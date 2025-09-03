const { Schema, model } = require('mongoose');
const validator = require('validator');

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
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'vendor', 'admin'], default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model('User', UserSchema);
