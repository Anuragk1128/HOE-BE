const { Schema, model, Types } = require('mongoose');

const ProductSchema = new Schema(
  {
    brandId: { type: Types.ObjectId, ref: 'Brand', required: true, index: true },
    categoryId: { type: Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategoryId: { type: Types.ObjectId, ref: 'Subcategory', required: true, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    description: { type: String },
    images: [{ type: String }],
    price: { type: Number, required: true },
    compareAtPrice: { type: Number },
    // Shipment-related fields (to align with Order item fields)
    sku: { type: String, trim: true, index: true },
    shippingCategory: { type: String, trim: true },
    weightKg: { type: Number, min: 0, default: 1 },
    dimensionsCm: {
      length: { type: Number, min: 0, default: 10 },
      breadth: { type: Number, min: 0, default: 10 },
      height: { type: Number, min: 0, default: 10 },
    },
    hsnCode: { type: String, trim: true },
    attributes: {
      size: [{ type: String }],
      color: [{ type: String }],
      material: { type: String },
      fit: { type: String },
      styling: { type: String },
      // add brand-specific attributes as needed
    },
    stock: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'draft', 'pending_approval'], default: 'active' },
    vendorId: { type: Types.ObjectId, ref: 'Vendor' },
    tags: [{ type: String }],
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ brandId: 1, slug: 1 }, { unique: true });
// Optional uniqueness can be enforced brand-wise if needed
// ProductSchema.index({ brandId: 1, sku: 1 }, { unique: true, sparse: true });

module.exports = model('Product', ProductSchema);
