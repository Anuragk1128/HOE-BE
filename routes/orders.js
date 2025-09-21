const express = require('express');
const { check, validationResult } = require('express-validator');
const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const { authRequired, requireRoles } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
// Match the actual file created by the user (services/shipyariServices.js)
const shipyaariService = require('../services/shipyariServices');

const router = express.Router();

// Helpers
const isOwnerOrAdmin = (req, order) => {
  return order.user.toString() === req.user.sub || req.user.role === 'admin';
};

// ADD: Payment initiation route
router.post(
  '/payment/initiate',
  [
    authRequired,
    [
      check('items').isArray({ min: 1 }).withMessage('Items array is required'),
      check('customerDetails.name').isString().notEmpty(),
      check('customerDetails.email').isEmail(),
      check('customerDetails.mobile').isString().notEmpty(),
      check('shippingAddress.fullName').isString().notEmpty(),
      check('shippingAddress.addressLine1').isString().notEmpty(),
      check('shippingAddress.city').isString().notEmpty(),
      check('shippingAddress.state').isString().notEmpty(),
      check('shippingAddress.postalCode').isString().notEmpty(),
      check('shippingAddress.phone').isString().notEmpty(),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

// (advanced tracking, cancel-shipment, and generate-label routes are defined later in the file)
    const { items, customerDetails, shippingAddress, billingAddress, paymentMethod = 'online' } = req.body;

    try {
      // Fetch products and calculate totals
      const productIds = items.map((i) => i.product);
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      const normItems = [];
      for (const i of items) {
        const prod = productMap.get(i.product);
        if (!prod) return res.status(404).json({ message: `Product not found: ${i.product}` });
        const qty = Number(i.quantity || 1);
        normItems.push({
          product: prod._id,
          title: prod.title,
          image: Array.isArray(prod.images) && prod.images.length ? prod.images[0] : undefined,
          price: prod.price,
          quantity: qty,
          sku: i.sku || prod.sku,
          category: i.category || prod.shippingCategory || 'General',
          weight: typeof i.weight !== 'undefined' ? i.weight : typeof prod.weightKg === 'number' ? prod.weightKg : 1,
          dimensions:
            i.dimensions ||
            (prod.dimensionsCm
              ? { length: prod.dimensionsCm.length, breadth: prod.dimensionsCm.breadth, height: prod.dimensionsCm.height }
              : { length: 10, breadth: 10, height: 10 }),
          hsnCode: i.hsnCode || prod.hsnCode || '1234',
          gstRate: prod.gstRate || 12, // Add GST rate for Shipyaari
        });
      }

      const itemsPrice = normItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const shippingPrice = 0; // Free shipping for all orders
      
      // Calculate GST from products
      let taxPrice = 0;
      for (const item of normItems) {
        const product = productMap.get(item.product.toString());
        if (product && product.gstRate) {
          const itemTax = Math.round((item.price * item.quantity * product.gstRate) / 100);
          taxPrice += itemTax;
        }
      }
      
      const totalPrice = itemsPrice + shippingPrice + taxPrice;

      // Create order in database
      const order = new Order({
        user: req.user.sub,
        items: normItems,
        shippingAddress,
        billingAddress: billingAddress || shippingAddress,
        customerDetails,
        paymentMethod,
        itemsPrice,
        shippingPrice,
        taxPrice,
        totalPrice,
        currency: 'INR',
        status: 'pending',
        sellerDetails: {
          address: {
            fullAddress: process.env.SELLER_ADDRESS ,
            pincode: parseInt(process.env.SELLER_PINCODE),
            city: process.env.SELLER_CITY ,
            state: process.env.SELLER_STATE ,
            country: 'India',
            latitude: process.env.SELLER_LATITUDE ,
            longitude: process.env.SELLER_LONGITUDE,
          },
          contact: {
            name: process.env.SELLER_CONTACT_NAME || 'Store Manager',
            mobile: parseInt(process.env.SELLER_MOBILE) || 9876543210,
            alternateMobile: parseInt(process.env.SELLER_ALTERNATE_MOBILE) || 9876543210,
          },
        },
      });

      await order.save();

      // Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalPrice * 100), // in paise
        currency: 'INR',
        receipt: order.orderId,
        notes: {
          orderId: order._id.toString(),
          customerEmail: customerDetails.email,
          customerMobile: customerDetails.mobile,
        },
      });

      // Update order with Razorpay details
      order.razorpayDetails = {
        razorpayOrderId: razorpayOrder.id,
        paymentStatus: 'pending',
      };
      await order.save();

      return res.json({
        success: true,
        message: 'Payment initiated successfully',
        orderId: order._id,
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        customerDetails: {
          name: customerDetails.name,
          email: customerDetails.email,
          contact: customerDetails.mobile,
        },
      });
    } catch (error) {
      console.error('Payment initiation error:', error);
      return res.status(500).json({ success: false, message: 'Failed to initiate payment', error: error.message });
    }
  }
);

// ADD: Payment confirmation route
router.post('/payment/confirm', [authRequired], async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(sign.toString()).digest('hex');
    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({ success: false, message: 'Payment verification failed - Invalid signature' });
    }

    const order = await Order.findOneAndUpdate(
      { 'razorpayDetails.razorpayOrderId': razorpay_order_id, user: req.user.sub },
      {
        'razorpayDetails.razorpayPaymentId': razorpay_payment_id,
        'razorpayDetails.razorpaySignature': razorpay_signature,
        'razorpayDetails.paymentStatus': 'captured',
        status: 'paid',
        paidAt: new Date(),
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found or access denied' });

    return res.json({
      success: true,
      message: 'Payment confirmed successfully',
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentStatus: 'completed',
      orderStatus: order.status,
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    return res.status(500).json({ success: false, message: 'Payment confirmation failed', error: error.message });
  }
});

// 1. ADVANCED TRACKING - GET /api/orders/:id/tracking
router.get('/:id/tracking', [authRequired], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });

    if (!order.shipmentDetails?.awbNumber) {
      return res.json({
        success: true,
        message: 'Shipment not yet created',
        order: { orderNumber: order.orderNumber, status: order.status }
      });
    }

    const trackingData = await shipyaariService.trackShipment(order.shipmentDetails.awbNumber);

    await Order.findByIdAndUpdate(order._id, {
      'shipmentDetails.lastTrackingUpdate': {
        status: trackingData.status,
        location: trackingData.location,
        timestamp: trackingData.lastUpdate
      },
      'shipmentDetails.trackingHistory': trackingData.trackingHistory
    });

    return res.json({
      success: true,
      tracking: {
        orderNumber: order.orderNumber,
        awbNumber: order.shipmentDetails.awbNumber,
        currentStatus: trackingData.status,
        trackingHistory: trackingData.trackingHistory
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get tracking' });
  }
});

// 2. CANCEL SHIPMENT - POST /api/orders/:id/cancel-shipment
router.post('/:id/cancel-shipment', [authRequired], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });

    if (!order.shipmentDetails?.awbNumber) {
      return res.status(400).json({ success: false, message: 'No shipment to cancel' });
    }

    const cancellationResult = await shipyaariService.cancelShipment(
      order.shipmentDetails.awbNumber,
      req.body?.reason || 'Cancelled by customer'
    );

    await Order.findByIdAndUpdate(order._id, {
      'shipmentDetails.cancellation': {
        isCancelled: Boolean(cancellationResult.cancelled),
        cancelledAt: cancellationResult.cancelledAt || new Date(),
        cancelReason: req.body?.reason || 'Cancelled by customer',
        cancelledBy: req.user?.role === 'admin' ? 'admin' : 'customer'
      },
      'shipmentDetails.shipmentStatus': 'cancelled',
      status: 'cancelled'
    });

    return res.json({ success: true, message: 'Shipment cancelled successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to cancel shipment' });
  }
});

// 3. GENERATE LABELS - POST /api/orders/:id/generate-label (admin)
router.post('/:id/generate-label', [authRequired, requireRoles('admin')], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || !order.shipmentDetails?.awbNumber) {
      return res.status(400).json({ success: false, message: 'No AWB number found' });
    }

    const labelData = await shipyaariService.generateShippingLabels([order.shipmentDetails.awbNumber]);

    await Order.findByIdAndUpdate(order._id, {
      'shipmentDetails.shippingLabel': labelData
    });

    return res.json({ success: true, labels: labelData });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate labels' });
  }
});

// ADD: Public order tracking route
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber }).select(
      'orderNumber orderId status razorpayDetails.paymentStatus shipmentDetails createdAt paidAt shippedAt deliveredAt'
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    return res.json({
      success: true,
      order: {
        orderNumber: order.orderNumber,
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.razorpayDetails?.paymentStatus || 'pending',
        shipmentStatus: order.shipmentDetails?.shipmentStatus || 'pending',
        awbNumber: order.shipmentDetails?.awbNumber,
        courierPartner: order.shipmentDetails?.courierPartner,
        trackingUrl: order.shipmentDetails?.trackingUrl,
        timestamps: {
          orderDate: order.createdAt,
          paidAt: order.paidAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
        },
      },
    });
  } catch (error) {
    console.error('Track order error:', error);
    return res.status(500).json({ success: false, message: 'Failed to track order' });
  }
});

// POST /api/orders - Create a new order for authenticated user
router.post(
  '/',
  [
    authRequired,
    [
      check('items').isArray({ min: 1 }).withMessage('Items array is required'),
      check('items.*.product').isString().notEmpty().withMessage('Each item must have product id'),
      check('items.*.quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be >= 1'),

      // Customer details
      check('customerDetails.name').isString().notEmpty(),
      check('customerDetails.email').isString().notEmpty(),
      check('customerDetails.mobile').isString().notEmpty(),

      // Address selection: either addressId or full shippingAddress must be provided
      check('addressId').optional().isString(),
      check('billingAddressId').optional().isString(),
      check('shippingAddress').optional().isObject(),
      check('billingAddress').optional().isObject(),
      check('shippingAddress').custom((value, { req }) => {
        if (req.body.addressId) return true; // using saved address
        // Require full address fields if not using saved address
        const a = value || {};
        const required = ['fullName','addressLine1','city','state','postalCode','country','phone'];
        const missing = required.filter(k => !a || typeof a[k] !== 'string' || a[k].trim().length === 0);
        if (missing.length) {
          throw new Error(`shippingAddress missing fields: ${missing.join(', ')}`);
        }
        return true;
      }),

      // Seller details (required for Shipyaari)
      check('sellerDetails.address.fullAddress').isString().notEmpty(),
      check('sellerDetails.address.pincode').isInt().toInt(),
      check('sellerDetails.address.city').isString().notEmpty(),
      check('sellerDetails.address.state').isString().notEmpty(),
      check('sellerDetails.contact.name').isString().notEmpty(),
      check('sellerDetails.contact.mobile').isInt().toInt(),

      check('paymentMethod').optional().isIn(['online', 'cod', 'wallet'])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { items, shippingAddress, billingAddress, addressId, billingAddressId, customerDetails, sellerDetails, paymentMethod = 'online', shippingPrice = 0, taxPrice = 0, orderNotes, specialInstructions, insurance } = req.body;

    try {
      // Fetch products to validate and get current price/title/image
      const productIds = items.map(i => i.product);
      const products = await Product.find({ _id: { $in: productIds } });
      const productMap = new Map(products.map(p => [p._id.toString(), p]));

      // Build normalized order items and compute totals
      const normItems = [];
      for (const i of items) {
        const prod = productMap.get(i.product);
        if (!prod) return res.status(404).json({ message: `Product not found: ${i.product}` });
        const qty = Number(i.quantity || 1);
        normItems.push({
          product: prod._id,
          title: prod.title,
          image: Array.isArray(prod.images) && prod.images.length ? prod.images[0] : undefined,
          price: prod.price,
          quantity: qty,
          // Optional Shipyaari specific fields if provided by client, else defaults from schema
          sku: i.sku || prod.sku,
          category: i.category || prod.shippingCategory,
          weight: typeof i.weight !== 'undefined' ? i.weight : (typeof prod.weightKg === 'number' ? prod.weightKg : undefined),
          dimensions: i.dimensions || (prod.dimensionsCm ? { length: prod.dimensionsCm.length, breadth: prod.dimensionsCm.breadth, height: prod.dimensionsCm.height } : undefined),
          hsnCode: i.hsnCode || prod.hsnCode,
          gstRate: prod.gstRate || 12, // Add GST rate for Shipyaari
        });
      }

      // Resolve addresses: load from user's saved addresses if IDs provided
      let resolvedShipping = shippingAddress;
      let resolvedBilling = billingAddress;
      if (addressId || billingAddressId) {
        const user = await User.findById(req.user.sub).select('addresses');
        if (!user) return res.status(404).json({ message: 'User not found' });
        const findAddr = (id) => (user.addresses || []).id(id);
        if (addressId) {
          const a = findAddr(addressId);
          if (!a) return res.status(400).json({ message: 'Invalid addressId' });
          resolvedShipping = {
            fullName: a.fullName,
            addressLine1: a.addressLine1,
            addressLine2: a.addressLine2,
            city: a.city,
            state: a.state,
            postalCode: a.postalCode,
            country: a.country,
            phone: a.phone,
            latitude: a.latitude,
            longitude: a.longitude,
            landmark: a.landmark,
          };
        }
        if (billingAddressId) {
          const b = findAddr(billingAddressId);
          if (!b) return res.status(400).json({ message: 'Invalid billingAddressId' });
          resolvedBilling = {
            fullName: b.fullName,
            addressLine1: b.addressLine1,
            addressLine2: b.addressLine2,
            city: b.city,
            state: b.state,
            postalCode: b.postalCode,
            country: b.country,
            phone: b.phone,
            latitude: b.latitude,
            longitude: b.longitude,
            landmark: b.landmark,
          };
        }
      }

      // If billing not provided, default to shipping
      if (!resolvedBilling && resolvedShipping) resolvedBilling = resolvedShipping;

      const itemsPrice = normItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
      
      // Calculate GST from products if not provided
      let calculatedTaxPrice = Number(taxPrice || 0);
      if (calculatedTaxPrice === 0) {
        for (const item of normItems) {
          const product = productMap.get(item.product.toString());
          if (product && product.gstRate) {
            const itemTax = Math.round((item.price * item.quantity * product.gstRate) / 100);
            calculatedTaxPrice += itemTax;
          }
        }
      }
      
      const totalPrice = itemsPrice + Number(shippingPrice || 0) + calculatedTaxPrice;

      const order = await Order.create({
        user: req.user.sub,
        items: normItems,
        shippingAddress: resolvedShipping,
        billingAddress: resolvedBilling,
        customerDetails,
        sellerDetails,
        paymentMethod,
        itemsPrice,
        shippingPrice: Number(shippingPrice || 0),
        taxPrice: calculatedTaxPrice,
        totalPrice,
        currency: 'INR',
        orderNotes,
        specialInstructions,
        insurance: Boolean(insurance),
      });

      return res.status(201).json(order);
    } catch (err) {
      console.error('Create order error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// GET /api/orders/mine - List authenticated user's orders
router.get('/mine', [authRequired], async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.sub }).sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    console.error('List my orders error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// GET /api/orders/:id - Get an order (owner or admin)
router.get('/:id', [authRequired], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });
    return res.json(order);
  } catch (err) {
    console.error('Get order error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// PATCH /api/orders/:id/pay - Mark as paid (owner) and save payment result
router.patch(
  '/:id/pay',
  [
    authRequired,
    [
      check('razorpayOrderId').isString().notEmpty(),
      check('razorpayPaymentId').isString().notEmpty(),
      check('razorpaySignature').isString().notEmpty(),
      check('paymentMethod').optional().isIn(['online', 'cod', 'wallet']),
      check('paymentStatus').optional().isIn(['pending', 'authorized', 'captured', 'failed'])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });

      // Save Razorpay payment details
      order.razorpayDetails = {
        razorpayOrderId: req.body.razorpayOrderId,
        razorpayPaymentId: req.body.razorpayPaymentId,
        razorpaySignature: req.body.razorpaySignature,
        paymentMethod: req.body.paymentMethod || 'online',
        paymentStatus: req.body.paymentStatus || 'captured'
      };

      order.status = 'paid';
      order.paidAt = new Date();
      await order.save();

      return res.json(order);
    } catch (err) {
      console.error('Pay order error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// POST /api/orders/:id/cancel - Cancel order (owner) if not shipped/delivered
router.post(
  '/:id/cancel',
  [authRequired, [check('reason').optional().isString()]],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });
      if (['processing', 'shipped', 'in_transit', 'delivered', 'cancelled'].includes(order.status)) {
        return res.status(400).json({ message: `Cannot cancel order in status: ${order.status}` });
      }
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      if (req.body.reason) order.cancellationReason = req.body.reason;
      await order.save();
      return res.json(order);
    } catch (err) {
      console.error('Cancel order error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// ADMIN: GET /api/orders - List all orders
router.get('/', [authRequired, requireRoles('admin')], async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    console.error('Admin list orders error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// ADMIN: PATCH /api/orders/:id/status - Update status (paid/shipped/delivered)
router.patch(
  '/:id/status',
  [authRequired, requireRoles('admin'), [check('status').isIn(['pending', 'confirmed', 'paid', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'])]],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      order.status = req.body.status;
      if (req.body.status === 'shipped') order.shippedAt = new Date();
      if (req.body.status === 'delivered') order.deliveredAt = new Date();
      await order.save();

      return res.json(order);
    } catch (err) {
      console.error('Admin update status error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// ADMIN: POST /api/orders/:id/ship - Set shipment details (Shipyaari)
router.post(
  '/:id/ship',
  [authRequired, requireRoles('admin'), [
    check('shipyaariOrderId').optional().isString(),
    check('awbNumber').optional().isString(),
    check('courierPartner').optional().isString(),
    check('trackingUrl').optional().isString(),
    check('shipmentStatus').optional().isIn(['pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled']),
    check('estimatedDeliveryDate').optional().isISO8601().toDate(),
    check('actualDeliveryDate').optional().isISO8601().toDate(),
    check('shipmentError').optional().isString()
  ]],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });

      order.shipmentDetails = {
        shipyaariOrderId: req.body.shipyaariOrderId,
        awbNumber: req.body.awbNumber,
        courierPartner: req.body.courierPartner,
        trackingUrl: req.body.trackingUrl,
        shipmentStatus: req.body.shipmentStatus || 'processing',
        estimatedDeliveryDate: req.body.estimatedDeliveryDate,
        actualDeliveryDate: req.body.actualDeliveryDate,
        shipmentError: req.body.shipmentError
      };

      // If moving to shipped/in_transit, set shippedAt
      if (['shipped', 'in_transit'].includes(order.shipmentDetails.shipmentStatus) && !order.shippedAt) {
        order.shippedAt = new Date();
      }

      await order.save();
      return res.json(order);
    } catch (err) {
      console.error('Set shipment details error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router;
