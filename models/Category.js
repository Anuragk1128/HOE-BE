const { Schema, model, Types } = require('mongoose');

const CategorySchema = new Schema(
  {
    brandId: { type: Types.ObjectId, ref: 'Brand', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    image: { type: String },
  },
  { timestamps: true }
);

CategorySchema.index({ brandId: 1, slug: 1 }, { unique: true });

module.exports = model('Category', CategorySchema);
