const express = require('express');
const { check, validationResult } = require('express-validator');
const { authRequired, requireRoles } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');

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
      check('shippingAddress.fullName').isString().notEmpty(),
      check('shippingAddress.addressLine1').isString().notEmpty(),
      check('shippingAddress.city').isString().notEmpty(),
      check('shippingAddress.postalCode').isString().notEmpty(),
      check('shippingAddress.country').isString().notEmpty(),
      check('paymentMethod').optional().isIn(['cod', 'card', 'paypal', 'stripe'])
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { items, shippingAddress, paymentMethod = 'cod', shippingPrice = 0, taxPrice = 0 } = req.body;

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
        });
      }

      const itemsPrice = normItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const totalPrice = itemsPrice + Number(shippingPrice || 0) + Number(taxPrice || 0);

      const order = await Order.create({
        user: req.user.sub,
        items: normItems,
        shippingAddress,
        paymentMethod,
        itemsPrice,
        shippingPrice: Number(shippingPrice || 0),
        taxPrice: Number(taxPrice || 0),
        totalPrice,
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
  [authRequired, [
    check('paymentResult').optional().isObject(),
    check('paymentResult.id').optional().isString(),
    check('paymentResult.status').optional().isString(),
    check('paymentResult.update_time').optional().isString(),
    check('paymentResult.email_address').optional().isString(),
  ]],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (!isOwnerOrAdmin(req, order)) return res.status(403).json({ message: 'Forbidden' });

      order.status = 'paid';
      order.paidAt = new Date();
      if (req.body.paymentResult) order.paymentResult = req.body.paymentResult;
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
      if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
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
  [authRequired, requireRoles('admin'), [check('status').isIn(['pending', 'paid', 'shipped', 'delivered', 'cancelled'])]],
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

module.exports = router;
