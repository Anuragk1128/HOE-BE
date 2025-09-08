const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const { authRequired } = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// @route    POST api/reviews
// @desc     Create a review
// @access   Private
router.post(
  '/',
  [
    authRequired,
    [
      check('product', 'Product ID is required').not().isEmpty(),
      check('rating', 'Please include a rating between 1 and 5').isInt({ min: 1, max: 5 }),
      check('comment', 'Please include a comment').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await Product.findById(req.body.product);
      if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
      }

      // Check if user already reviewed this product
      const existingReview = await Review.findOne({
        product: req.body.product,
        user: req.user.sub
      });

      if (existingReview) {
        return res.status(400).json({ msg: 'You have already reviewed this product' });
      }

      const review = new Review({
        product: req.body.product,
        user: req.user.sub,
        rating: req.body.rating,
        comment: req.body.comment
      });

      await review.save();
      
      // Update product's average rating
      await updateProductAverageRating(req.body.product);

      res.status(201).json(review);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route    GET api/reviews/product/:productId
// @desc     Get all reviews for a product
// @access   Public
router.get('/product/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ 
      product: req.params.productId,
      status: 'approved' // Only show approved reviews
    }).sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route    GET api/reviews/:id
// @desc     Get review by ID
// @access   Public
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }

    res.json(review);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Review not found' });
    }
    res.status(500).send('Server Error');
  }
});

// Helper function to update product's average rating
const updateProductAverageRating = async (productId) => {
  try {
    const result = await Review.aggregate([
      { $match: { product: productId, status: 'approved' } },
      {
        $group: {
          _id: '$product',
          averageRating: { $avg: '$rating' },
          numOfReviews: { $sum: 1 }
        }
      }
    ]);

    if (result.length > 0) {
      await Product.findByIdAndUpdate(productId, {
        rating: result[0].averageRating,
        numReviews: result[0].numOfReviews
      });
    }
  } catch (err) {
    console.error('Error updating product rating:', err);
  }
};

module.exports = router;
