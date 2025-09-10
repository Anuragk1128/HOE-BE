const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const Product = require('../models/Product');
const CartItem = require('../models/Cart');

// GET /api/cart - List cart items for authenticated user
router.get('/', [authRequired], async (req, res) => {
  try {
    const items = await CartItem.find({ user: req.user.sub }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.error('Cart list error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// POST /api/cart - Add a product to cart (or increase quantity)
router.post(
  '/',
  [
    authRequired,
    [
      check('product', 'Product ID is required').isString().notEmpty(),
      check('quantity').optional().isInt({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product, quantity = 1 } = req.body;

    try {
      const prod = await Product.findById(product);
      if (!prod) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Upsert: if exists, increase quantity, else create
      const item = await CartItem.findOneAndUpdate(
        { user: req.user.sub, product },
        { $inc: { quantity } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return res.status(201).json(item);
    } catch (err) {
      console.error('Cart add error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// POST /api/cart/:productId - Add by path param (quantity optional in body)
router.post(
  '/:productId',
  [authRequired, [check('quantity').optional().isInt({ min: 1 })]],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const product = req.params.productId;
    const quantity = Number(req.body?.quantity || 1);
    try {
      const prod = await Product.findById(product);
      if (!prod) return res.status(404).json({ message: 'Product not found' });

      const item = await CartItem.findOneAndUpdate(
        { user: req.user.sub, product },
        { $inc: { quantity } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return res.status(201).json(item);
    } catch (err) {
      console.error('Cart add (path) error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

// DELETE /api/cart/:productId - Remove a product entirely from cart
router.delete(
  '/:productId',
  [authRequired],
  async (req, res) => {
    const product = req.params.productId;
    try {
      const result = await CartItem.deleteOne({ user: req.user.sub, product });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Item not found in cart' });
      }
      return res.status(204).send();
    } catch (err) {
      console.error('Cart remove error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router;


