const express = require('express');
const { check, validationResult } = require('express-validator');
const { authRequired, requireRoles } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const router = express.Router();

// Helpers
const isOwnerOrAdmin = (req, order) => {
  return order.user.toString() === req.user.sub || req.user.role === 'admin';
};

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
      const totalPrice = itemsPrice + Number(shippingPrice || 0) + Number(taxPrice || 0);

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
        taxPrice: Number(taxPrice || 0),
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
    check('shipmentStatus').optional().isIn(['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'failed']),
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
