const { Schema, model } = require('mongoose');
const validator = require('validator');

// Address subdocument schema aligning with OrderAddress
const AddressSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    phone: { type: String, required: true, trim: true },
    latitude: { type: String, trim: true },
    longitude: { type: String, trim: true },
    landmark: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Invalid email'],
    },
    passwordHash: { type: String, required: function() { return this.authProvider === 'local'; } },
    role: { type: String, enum: ['customer', 'vendor', 'admin'], default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    phone: { type: String, trim: true },
    addresses: { type: [AddressSchema], default: [] },
    // Google OAuth fields
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    avatar: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = model('User', UserSchema);
