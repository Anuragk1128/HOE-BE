const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');

const router = express.Router();

const signToken = (user) => {
  const payload = { sub: user._id.toString(), role: user.role, email: user.email, name: user.name };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register (customer)
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role: 'customer' });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/login (any role)
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    // Prevent admins from using the general login; they must use /api/auth/admin/login
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Error' });
    }

    // Prevent vendors from using the general login; they must use /api/auth/vendor/login
    if (user.role === 'vendor') {
      return res.status(403).json({ message: 'Error' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/admin/login (admin-only, token-only response)
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({ email: email.toLowerCase(), role: 'admin', isActive: true });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token });
  } catch (err) { next(err); }
});

// POST /api/auth/vendor/login (vendor-only, token-only response)
router.post('/vendor/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const user = await User.findOne({ email: email.toLowerCase(), role: 'vendor', isActive: true });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token });
  } catch (err) { next(err); }
});

// POST /api/auth/vendor/register (creates vendor user + vendor profile with pending status)
router.post('/vendor/register', async (req, res, next) => {
  try {
    const { name, email, password, displayName, businessName, phone } = req.body;
    if (!name || !email || !password || !displayName) return res.status(400).json({ message: 'Missing fields' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role: 'vendor' });
    const vendor = await Vendor.create({ userId: user._id, displayName, businessName, phone, status: 'pending' });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      vendor: { id: vendor._id, status: vendor.status, displayName: vendor.displayName }
    });
  } catch (err) { next(err); }
});

// POST /api/auth/admin/create
router.post('/admin/create', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role: 'admin' });
    // Create matching Admin profile
    await Admin.create({ userId: user._id, displayName: name });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

module.exports = router;
