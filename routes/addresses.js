const express = require('express');
const { check, validationResult } = require('express-validator');
const { authRequired } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// GET /api/addresses - List all addresses for current user
router.get('/', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).select('addresses');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user.addresses || []);
  } catch (err) {
    console.error('List addresses error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

const addressValidators = [
  check('fullName').isString().notEmpty(),
  check('addressLine1').isString().notEmpty(),
  check('city').isString().notEmpty(),
  check('state').isString().notEmpty(),
  check('postalCode').isString().notEmpty(),
  check('country').isString().notEmpty(),
  check('phone').isString().notEmpty(),
  check('addressLine2').optional().isString(),
  check('landmark').optional().isString(),
  check('latitude').optional().isString(),
  check('longitude').optional().isString(),
  check('isDefault').optional().isBoolean(),
];

// POST /api/addresses - Add new address
router.post('/', authRequired, addressValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = {
      fullName: req.body.fullName,
      addressLine1: req.body.addressLine1,
      addressLine2: req.body.addressLine2,
      city: req.body.city,
      state: req.body.state,
      postalCode: req.body.postalCode,
      country: req.body.country,
      phone: req.body.phone,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      landmark: req.body.landmark,
      isDefault: Boolean(req.body.isDefault),
    };

    if (addr.isDefault) {
      // Unset previous defaults
      user.addresses = (user.addresses || []).map(a => ({ ...a.toObject(), isDefault: false }));
    }

    user.addresses.push(addr);
    await user.save();

    const added = user.addresses[user.addresses.length - 1];
    return res.status(201).json(added);
  } catch (err) {
    console.error('Create address error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// PUT /api/addresses/:id - Update an address
router.put('/:id', authRequired, addressValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ message: 'Address not found' });

    const isDefault = Boolean(req.body.isDefault);
    if (isDefault) {
      user.addresses = (user.addresses || []).map(a => ({ ...a.toObject(), isDefault: false }));
    }

    addr.fullName = req.body.fullName;
    addr.addressLine1 = req.body.addressLine1;
    addr.addressLine2 = req.body.addressLine2;
    addr.city = req.body.city;
    addr.state = req.body.state;
    addr.postalCode = req.body.postalCode;
    addr.country = req.body.country;
    addr.phone = req.body.phone;
    addr.latitude = req.body.latitude;
    addr.longitude = req.body.longitude;
    addr.landmark = req.body.landmark;
    addr.isDefault = isDefault ? true : Boolean(req.body.isDefault);

    await user.save();
    return res.json(addr);
  } catch (err) {
    console.error('Update address error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// DELETE /api/addresses/:id - Delete an address
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ message: 'Address not found' });

    const wasDefault = addr.isDefault;
    addr.remove();
    await user.save();

    // Optionally set another address as default if none left
    if (wasDefault) {
      const hasDefault = (user.addresses || []).some(a => a.isDefault);
      if (!hasDefault && user.addresses.length > 0) {
        user.addresses[0].isDefault = true;
        await user.save();
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete address error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// PATCH /api/addresses/:id/set-default - Set default address
router.patch('/:id/set-default', authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ message: 'Address not found' });

    user.addresses = (user.addresses || []).map(a => ({ ...a.toObject(), isDefault: false }));
    addr.isDefault = true;
    await user.save();

    return res.json(addr);
  } catch (err) {
    console.error('Set default address error:', err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
