const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');

const router = express.Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

// POST /api/auth/google-login (customer only)
router.post('/google-login', async (req, res, next) => {
  console.log('=== GOOGLE LOGIN ENDPOINT CALLED ===');
  
  try {
    // Set JSON content type immediately
    res.setHeader('Content-Type', 'application/json');
    
    const { token } = req.body;
    console.log('1. Token received:', token ? 'Yes' : 'No');
    console.log('2. Token length:', token ? token.length : 0);
    
    if (!token) {
      console.log('3. ERROR: No token provided');
      return res.status(400).json({ message: 'Google token is required' });
    }

    // Verify Google token
    console.log('4. Verifying token with Google...');
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      console.log('5. Token verification successful');
      
      const payload = ticket.getPayload();
      const { sub: googleId, email, name, picture } = payload;
      
      console.log('6. Google user data:', { 
        googleId, 
        email, 
        name: name ? 'Received' : 'Missing',
        picture: picture ? 'Received' : 'Missing' 
      });
      
      if (!email || !name) {
        console.log('7. ERROR: Missing required fields from Google');
        return res.status(400).json({ message: 'Invalid Google token - missing required fields' });
      }

      // Check if user exists
      console.log('8. Checking if user exists...');
      let user = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { googleId }]
      });
      
      if (user) {
        console.log('9. Existing user found:', user.email);
        
        // Update existing user logic
        if (!user.googleId) {
          console.log('10. Updating existing user with Google info...');
          user.googleId = googleId;
          user.authProvider = 'google';
          user.avatar = picture;
          await user.save();
          console.log('11. User updated successfully');
        }
      } else {
        console.log('12. No existing user found - creating new user...');
        try {
          user = await User.create({
            name,
            email: email.toLowerCase(),
            googleId,
            authProvider: 'google',
            avatar: picture,
            role: 'customer',
            passwordHash: null,
          });
          console.log('13. New user created successfully:', user.email);
        } catch (createError) {
          console.error('14. ERROR creating user:', createError);
          return res.status(500).json({ 
            message: 'Failed to create user account',
            error: createError.message 
          });
        }
      }
      
      // Generate JWT token
      console.log('15. Generating JWT token...');
      const jwtToken = signToken(user);
      console.log('16. JWT token generated successfully');
      
      const responseData = {
        token: jwtToken,
        user: { 
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role,
          avatar: user.avatar
        }
      };
      
      console.log('17. Sending success response');
      console.log('18. Response data structure:', Object.keys(responseData));
      
      res.json(responseData);
      
    } catch (verificationError) {
      console.error('19. Google token verification failed:', verificationError.message);
      return res.status(401).json({ 
        message: 'Invalid Google token',
        error: verificationError.message 
      });
    }
    
  } catch (error) {
    console.error('20. UNEXPECTED ERROR in google-login:', error);
    console.error('21. Error stack:', error.stack);
    
    // Ensure we always send JSON response
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Internal server error during authentication',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Authentication failed'
      });
    }
  }
});


module.exports = router;
