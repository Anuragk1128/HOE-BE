require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi.json');
const mongoose = require('mongoose');
const { cloudinary } = require('./config/cloudinary');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Routes
const brandsRoutes = require('./routes/brands');
const catalogRoutes = require('./routes/catalog');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const productsRoutes = require('./routes/products');
const wishlistRoutes = require('./routes/wishlist');
const reviewsRoutes = require('./routes/reviews');

const app = express();

// Parse JSON
app.use(express.json());

// CORS setup
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow requests from allowed origins or non-browser tools (no Origin header)
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check with DB and Cloudinary status
app.get('/health', async (req, res) => {
  const dbState = {
    code: mongoose.connection.readyState,
    status: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  };
  let cloudinaryStatus = { status: 'unknown' };
  try {
    const ping = await cloudinary.api.ping();
    cloudinaryStatus = { status: 'connected', response: ping.status || 'ok' };
  } catch (e) {
    cloudinaryStatus = { status: 'error', message: e?.message };
  }
  res.json({ status: 'ok', services: { db: dbState, cloudinary: cloudinaryStatus } });
});

// Swagger docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewsRoutes);

// 404 handler for unknown API routes (Express 5 safe catch-all)
app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));

// Centralized error handler
app.use(errorHandler);

// Start server after DB connects
const PORT = process.env.PORT || 4000;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Log Cloudinary connectivity once at startup
    cloudinary.api.ping()
      .then(() => console.log('Cloudinary connected'))
      .catch((err) => console.warn('Cloudinary connection error:', err?.message));
  });
})();