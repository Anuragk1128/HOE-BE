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
    
    // Enhanced Shipment-related fields
    sku: { type: String, trim: true, index: true },
    shippingCategory: { 
      type: String, 
      trim: true,
      enum: [
        'artificial-jewellery',
        'earrings', 
        'necklaces', 
        'bracelets', 
        'bangles', 
        'rings',
        'clothes',
        'knitted-clothes', 
        'textiles',
        'accessories',
        'general'
      ],
      default: 'general'
    },
    weightKg: { type: Number, min: 0, default: 0.5 },
    dimensionsCm: {
      length: { type: Number, min: 0, default: 15 },
      breadth: { type: Number, min: 0, default: 10 },
      height: { type: Number, min: 0, default: 5 },
    },
    
    // Enhanced HSN Code and Tax Management
    hsnCode: { 
      type: String, 
      trim: true,
      required: true,
      default: function() {
        return this.getHSNCode();
      }
    },
    gstRate: { 
      type: Number, 
      min: 0, 
      max: 28,
      required: true,
      default: function() {
        return this.getGSTRate();
      }
    },
    
    // Product Classification
    productType: {
      type: String,
      enum: [
        'artificial-jewellery',
        'imitation-jewellery', 
        'fashion-jewellery',
        'clothing',
        'accessories',
        'textiles'
      ],
      required: true,
  
    },
    
    attributes: {
      size: [{ type: String }],
      color: [{ type: String }],
      material: { 
        type: String,
        enum: [
          'base-metal',
          'stainless-steel',
          'brass',
          'copper',
          'plastic',
          'resin',
          'glass',
          'wood',
          'cotton',
          'polyester',
          'silk',
          'mixed-material'
        ]
      },
      fit: { 
        type: String,
        enum: ['regular', 'slim', 'loose', 'oversized', 'fitted']
      },
      styling: { type: String },
      occasion: {
        type: String,
        enum: ['casual', 'formal', 'party', 'wedding', 'daily-wear', 'festive']
      },
      gender: {
        type: String,
        enum: ['women', 'men', 'unisex', 'kids'],
      }
    },
    
    // Inventory Management
    stock: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
    status: { 
      type: String, 
      enum: ['active', 'draft', 'pending_approval', 'out_of_stock', 'discontinued'], 
      default: 'active' 
    },
    lastStockUpdate: { type: Date, default: Date.now },
    
    // Business fields
    vendorId: { type: Types.ObjectId, ref: 'Vendor' },
    tags: [{ type: String }],
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    onSale: { type: Boolean, default: false },
    
    // Analytics
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    
    // SEO
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: [{ type: String }],
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for calculating tax amount
ProductSchema.virtual('taxAmount').get(function() {
  return Math.round((this.price * this.gstRate) / 100);
});

// Virtual for price including tax
ProductSchema.virtual('priceIncludingTax').get(function() {
  return this.price + this.taxAmount;
});

// Virtual for checking if product is in stock
ProductSchema.virtual('inStock').get(function() {
  return this.stock > 0;
});

// Virtual for checking low stock
ProductSchema.virtual('isLowStock').get(function() {
  return this.stock <= this.lowStockThreshold && this.stock > 0;
});

// Method to get HSN code based on product category
ProductSchema.methods.getHSNCode = function() {
  const hsnMap = {
    'artificial-jewellery': '7117',
    'earrings': '7117',
    'necklaces': '7117', 
    'bracelets': '7117',
    'bangles': '7117',
    'rings': '7117',
    'imitation-jewellery': '7117',
    'fashion-jewellery': '7117',
    'clothes': this.price <= 1000 ? '62' : '62',
    'knitted-clothes': this.price <= 1000 ? '61' : '61', 
    'textiles': this.price <= 1000 ? '63' : '63',
    'accessories': '6217',
    'clothing': this.price <= 1000 ? '62' : '62'
  };
  
  return hsnMap[this.shippingCategory] || hsnMap[this.productType] || '7117';
};

// Method to get GST rate based on HSN code and price
ProductSchema.methods.getGSTRate = function() {
  const hsnCode = this.hsnCode || this.getHSNCode();
  
  // GST rates based on HSN codes and price
  if (hsnCode === '7117') {
    return 12; // Artificial jewellery - 12%
  }
  
  if (['61', '62', '63'].includes(hsnCode)) {
    return this.price <= 1000 ? 5 : 12; // Clothes - 5% if ≤₹1000, 12% if >₹1000
  }
  
  if (hsnCode === '6217') {
    return 12; // Accessories - 12%
  }
  
  return 12; // Default GST rate
};

// Pre-save middleware to auto-calculate HSN code and GST rate
ProductSchema.pre('save', function(next) {
  // Auto-set HSN code if not provided
  if (!this.hsnCode) {
    this.hsnCode = this.getHSNCode();
  }
  
  // Auto-set GST rate if not provided or if price changed
  if (!this.gstRate || this.isModified('price')) {
    this.gstRate = this.getGSTRate();
  }
  
  // Auto-generate SKU if not provided
  if (!this.sku) {
    this.sku = `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  
  // Update status based on stock
  if (this.stock === 0 && this.status === 'active') {
    this.status = 'out_of_stock';
  } else if (this.stock > 0 && this.status === 'out_of_stock') {
    this.status = 'active';
  }
  
  // Track last stock update timestamp when stock changes
  if (this.isModified('stock')) {
    this.lastStockUpdate = new Date();
  }
  
  next();
});

// Static method to get products by category with tax info
ProductSchema.statics.findWithTaxInfo = function(filter = {}) {
  return this.find(filter).select('+gstRate +hsnCode +taxAmount +priceIncludingTax');
};

// Static method to update HSN codes for existing products
ProductSchema.statics.updateHSNCodes = async function() {
  const products = await this.find({});
  
  for (let product of products) {
    product.hsnCode = product.getHSNCode();
    product.gstRate = product.getGSTRate();
    await product.save();
  }
  
  return { updated: products.length };
};

// Indexes for performance
ProductSchema.index({ brandId: 1, slug: 1 }, { unique: true });
ProductSchema.index({ categoryId: 1, status: 1 });
ProductSchema.index({ productType: 1, shippingCategory: 1 });
ProductSchema.index({ hsnCode: 1 });
ProductSchema.index({ price: 1, gstRate: 1 });
ProductSchema.index({ featured: 1, bestseller: 1, newArrival: 1 });
ProductSchema.index({ 'attributes.material': 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ stock: 1, status: 1 });

// Text index for search
ProductSchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text' 
});

module.exports = model('Product', ProductSchema);
