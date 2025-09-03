const { Schema, model, Types } = require('mongoose');

const SubcategorySchema = new Schema(
  {
    brandId: { type: Types.ObjectId, ref: 'Brand', required: true, index: true },
    categoryId: { type: Types.ObjectId, ref: 'Category', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    image: { type: String },
  },
  { timestamps: true }
);

SubcategorySchema.index({ brandId: 1, categoryId: 1, slug: 1 }, { unique: true });

module.exports = model('Subcategory', SubcategorySchema);
