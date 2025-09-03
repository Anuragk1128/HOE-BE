const express = require('express');
const Product = require('../models/Product');
const { Types: { ObjectId } } = require('mongoose');

const router = express.Router();

// GET / - Get all active products
router.get('/', async (req, res, next) => {
  try {
    const products = await Product.find({ status: 'active' })
      .select('-__v')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    next(error);
  }
});

// GET /:id - Get a single product by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }
    
    const product = await Product.findOne({
      _id: id,
      status: 'active'
    }).select('-__v');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
