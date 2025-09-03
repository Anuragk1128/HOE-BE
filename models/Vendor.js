const { Schema, model, Types } = require('mongoose');

const VendorSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    displayName: { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
    phone: { type: String },
    gstNumber: { type: String },
    address: { type: String },
  },
  { timestamps: true }
);

module.exports = model('Vendor', VendorSchema);
