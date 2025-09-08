const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const Product = require('../models/Product');
const Wishlist = require('../models/Wishlist');

// POST /api/wishlist - Add a product to the authenticated user's wishlist
router.post(
  '/',
  [
    authRequired,
    [check('product', 'Product ID is required').isString().notEmpty()]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product } = req.body;

    try {
      const prod = await Product.findById(product);
      if (!prod) {
        return res.status(404).json({ message: 'Product not found' });
      }

      try {
        const created = await Wishlist.create({ user: req.user.sub, product });
        const item = await Wishlist.findById(created._id);
        return res.status(201).json(item);
      } catch (err) {
        // Handle duplicate wishlist entries gracefully
        if (err && err.code === 11000) {
          const existing = await Wishlist.findOne({ user: req.user.sub, product });
          return res.status(200).json({ message: 'Already in wishlist', item: existing });
        }
        throw err;
      }
    } catch (err) {
      console.error('Wishlist add error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router;
// POST /api/wishlist/:productId - Add via path param
router.post(
  '/:productId',
  [authRequired],
  async (req, res) => {
    const product = req.params.productId;
    try {
      const prod = await Product.findById(product);
      if (!prod) return res.status(404).json({ message: 'Product not found' });

      try {
        const created = await Wishlist.create({ user: req.user.sub, product });
        const item = await Wishlist.findById(created._id);
        return res.status(201).json(item);
      } catch (err) {
        if (err && err.code === 11000) {
          const existing = await Wishlist.findOne({ user: req.user.sub, product });
          return res.status(200).json({ message: 'Already in wishlist', item: existing });
        }
        throw err;
      }
    } catch (err) {
      console.error('Wishlist add (path) error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);
