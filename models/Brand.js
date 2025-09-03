const { Schema, model } = require('mongoose');

const BrandSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model('Brand', BrandSchema);
