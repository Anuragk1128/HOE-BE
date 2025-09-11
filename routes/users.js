const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');

// GET /api/users/me - Fetch authenticated user's full profile
router.get('/me', [authRequired], async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Placeholder for related data like orders; extend when Order model exists
    // const orders = await Order.find({ user: req.user.sub }).sort({ createdAt: -1 });

    return res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// PATCH /api/users/me - Update authenticated user's profile
router.patch(
  '/me',
  [
    authRequired,
    [
      check('name').optional().isString().isLength({ min: 1 }).trim(),
      check('phone').optional().isString().trim(),
      check('address').optional().isString().trim(),
      check('email').not().exists().withMessage('Email cannot be changed here'),
      check('role').not().exists().withMessage('Role cannot be changed here'),
      check('passwordHash').not().exists().withMessage('Password cannot be changed here')
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updates = {};
    for (const key of ['name', 'phone', 'address']) {
      if (typeof req.body[key] !== 'undefined') updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    try {
      const user = await User.findByIdAndUpdate(req.user.sub, updates, { new: true, runValidators: true }).select('-passwordHash');
      if (!user) return res.status(404).json({ message: 'User not found' });
      return res.json({ user });
    } catch (err) {
      console.error('Update me error:', err);
      return res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router;


