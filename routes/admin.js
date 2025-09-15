const express = require('express');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');
const { authRequired, requireRoles } = require('../middleware/auth');

const router = express.Router();

// All routes below require admin
router.use(authRequired, requireRoles('admin'));

const slugify = (str) =>
  str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// POST /api/admin/brands - create brand
router.post('/brands', async (req, res, next) => {
  try {
    const { name, slug, description, active } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const finalSlug = (slug && slug.trim()) ? slugify(slug) : slugify(name);
    const exists = await Brand.findOne({ slug: finalSlug });
    if (exists) return res.status(409).json({ message: 'Slug already exists' });

    const brand = await Brand.create({ name, slug: finalSlug, description, active });
    res.status(201).json({ data: brand });
  } catch (err) { next(err); }
});

// PATCH /api/admin/brands/:id - update brand
router.patch('/brands/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['name', 'slug', 'description', 'active'];
    for (const key of allowed) {
      if (key in req.body) updates[key] = key === 'slug' ? slugify(req.body[key]) : req.body[key];
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No fields to update' });

    const brand = await Brand.findByIdAndUpdate(id, updates, { new: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    res.json({ data: brand });
  } catch (err) { next(err); }
});

// DELETE /api/admin/brands/:id - delete brand
router.delete('/brands/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    await Brand.deleteOne({ _id: id });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
 
// DELETE /api/admin/users/:id - delete a user (admin)
// Note: if the user is a vendor, also remove vendor profile
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'vendor') {
      await Vendor.deleteOne({ userId: user._id });
    }
    if (user.role === 'admin') {
      await Admin.deleteOne({ userId: user._id });
    }

    await User.deleteOne({ _id: user._id });
    return res.status(204).send();
  } catch (err) { next(err); }
});

// ===== Categories (per brand) =====
// POST /api/admin/brands/:brandId/categories - create category for a brand
router.post('/brands/:brandId/categories', async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const { name, slug, image } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const finalSlug = (slug && slug.trim()) ? slugify(slug) : slugify(name);
    const exists = await Category.findOne({ brandId, slug: finalSlug });
    if (exists) return res.status(409).json({ message: 'Slug already exists for this brand' });

    const cat = await Category.create({ brandId, name, slug: finalSlug, image });
    res.status(201).json({ data: cat });
  } catch (err) { next(err); }
});

// PATCH /api/admin/brands/:brandId/categories/:id - update category for a brand
router.patch('/brands/:brandId/categories/:id', async (req, res, next) => {
  try {
    const { brandId, id } = req.params;
    const updates = {};
    const allowed = ['name', 'slug', 'image'];
    for (const key of allowed) {
      if (key in req.body) updates[key] = key === 'slug' ? slugify(req.body[key]) : req.body[key];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No fields to update' });

    // Ensure brand exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const cat = await Category.findOneAndUpdate({ _id: id, brandId }, updates, { new: true });
    if (!cat) return res.status(404).json({ message: 'Category not found for this brand' });
    res.json({ data: cat });
  } catch (err) { next(err); }
});

// DELETE /api/admin/brands/:brandId/categories/:id - delete category for a brand
router.delete('/brands/:brandId/categories/:id', async (req, res, next) => {
  try {
    const { brandId, id } = req.params;

    // Ensure brand exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const cat = await Category.findOne({ _id: id, brandId });
    if (!cat) return res.status(404).json({ message: 'Category not found for this brand' });

    await Category.deleteOne({ _id: id });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ===== Subcategories (per brand & category) =====
// POST /api/admin/brands/:brandId/categories/:categoryId/subcategories - create subcategory
router.post('/brands/:brandId/categories/:categoryId/subcategories', async (req, res, next) => {
  try {
    const { brandId, categoryId } = req.params;
    const { name, slug, image } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });

    const finalSlug = (slug && slug.trim()) ? slugify(slug) : slugify(name);
    const exists = await Subcategory.findOne({ brandId, categoryId, slug: finalSlug });
    if (exists) return res.status(409).json({ message: 'Slug already exists for this category' });

    const sub = await Subcategory.create({ brandId, categoryId, name, slug: finalSlug, image });
    res.status(201).json({ data: sub });
  } catch (err) { next(err); }
});

// PATCH /api/admin/brands/:brandId/categories/:categoryId/subcategories/:id - update subcategory
router.patch('/brands/:brandId/categories/:categoryId/subcategories/:id', async (req, res, next) => {
  try {
    const { brandId, categoryId, id } = req.params;
    const updates = {};
    const allowed = ['name', 'slug', 'image'];
    for (const key of allowed) {
      if (key in req.body) updates[key] = key === 'slug' ? slugify(req.body[key]) : req.body[key];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No fields to update' });

    // Ensure hierarchy exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });

    const sub = await Subcategory.findOneAndUpdate({ _id: id, brandId, categoryId }, updates, { new: true });
    if (!sub) return res.status(404).json({ message: 'Subcategory not found for this category' });
    res.json({ data: sub });
  } catch (err) { next(err); }
});

// DELETE /api/admin/brands/:brandId/categories/:categoryId/subcategories/:id - delete subcategory
router.delete('/brands/:brandId/categories/:categoryId/subcategories/:id', async (req, res, next) => {
  try {
    const { brandId, categoryId, id } = req.params;

    // Ensure hierarchy exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });

    const sub = await Subcategory.findOne({ _id: id, brandId, categoryId });
    if (!sub) return res.status(404).json({ message: 'Subcategory not found for this category' });

    await Subcategory.deleteOne({ _id: id });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ===== Products (per brand, category, subcategory) =====
// POST /api/admin/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products - create product
router.post('/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products', async (req, res, next) => {
  try {
    const { brandId, categoryId, subcategoryId } = req.params;
    const {
      title,
      slug,
      description,
      images,
      price,
      compareAtPrice,
      // shipment & compliance
      sku,
      shippingCategory,
      weightKg,
      dimensionsCm,
      hsnCode,
      gstRate,
      // classification & attributes
      productType,
      attributes,
      // inventory & lifecycle
      stock,
      lowStockThreshold,
      isActive,
      status,
      // associations & merchandising
      vendorId,
      tags,
      featured,
      bestseller,
      newArrival,
      onSale,
      // SEO
      metaTitle,
      metaDescription,
      metaKeywords
    } = req.body;
    if (!title || price == null) return res.status(400).json({ message: 'Title and price are required' });

    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });
    const sub = await Subcategory.findOne({ _id: subcategoryId, brandId, categoryId });
    if (!sub) return res.status(404).json({ message: 'Subcategory not found for this category' });

    const finalSlug = (slug && slug.trim()) ? slugify(slug) : slugify(title);
    const exists = await Product.findOne({ brandId, slug: finalSlug });
    if (exists) return res.status(409).json({ message: 'Slug already exists for this brand' });

    const product = await Product.create({
      brandId,
      categoryId,
      subcategoryId,
      title,
      slug: finalSlug,
      description,
      images,
      price,
      compareAtPrice,
      // shipment & compliance
      sku,
      shippingCategory,
      weightKg,
      dimensionsCm,
      hsnCode,
      gstRate,
      // classification & attributes
      productType,
      attributes,
      // inventory & lifecycle
      stock,
      lowStockThreshold,
      isActive,
      status,
      // associations & merchandising
      vendorId,
      tags,
      featured,
      bestseller,
      newArrival,
      onSale,
      // SEO
      metaTitle,
      metaDescription,
      metaKeywords,
    });
    res.status(201).json({ data: product });
  } catch (err) { next(err); }
});

// PATCH /api/admin/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products/:id - update product
router.patch('/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products/:id', async (req, res, next) => {
  try {
    const { brandId, categoryId, subcategoryId, id } = req.params;

    // ensure hierarchy exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });
    const sub = await Subcategory.findOne({ _id: subcategoryId, brandId, categoryId });
    if (!sub) return res.status(404).json({ message: 'Subcategory not found for this category' });

    // fetch existing product to allow merging and preserving unspecified fields
    const existing = await Product.findOne({ _id: id, brandId, categoryId, subcategoryId });
    if (!existing) return res.status(404).json({ message: 'Product not found for this path' });

    const allowed = [
      'title',
      'slug',
      'description',
      'images',
      'price',
      'compareAtPrice',
      // shipment & compliance
      'sku',
      'shippingCategory',
      'weightKg',
      'dimensionsCm',
      'hsnCode',
      'gstRate',
      // classification & attributes
      'productType',
      'attributes',
      // inventory & lifecycle
      'stock',
      'lowStockThreshold',
      'isActive',
      'status',
      // associations & merchandising
      'vendorId',
      'tags',
      'featured',
      'bestseller',
      'newArrival',
      'onSale',
      // SEO
      'metaTitle',
      'metaDescription',
      'metaKeywords',
      // relocation
      'categoryId',
      'subcategoryId'
    ];
    const updates = {};

    for (const key of allowed) {
      if (!(key in req.body)) continue;

      // Skip empty string updates to preserve previous values
      if (typeof req.body[key] === 'string' && req.body[key].trim() === '') {
        continue;
      }

      if (key === 'slug') {
        const slugVal = req.body.slug;
        if (typeof slugVal === 'string' && slugVal.trim() !== '') {
          updates.slug = slugify(slugVal);
        }
        continue;
      }

      // Deep-merge for attributes object to avoid wiping existing keys
      if (key === 'attributes' && req.body.attributes && typeof req.body.attributes === 'object') {
        const currentAttrs = (existing.attributes && typeof existing.attributes === 'object') ? existing.attributes : {};
        updates.attributes = { ...currentAttrs, ...req.body.attributes };
        continue;
      }

      // Merge for dimensions object
      if (key === 'dimensionsCm' && req.body.dimensionsCm && typeof req.body.dimensionsCm === 'object') {
        const currentDims = (existing.dimensionsCm && typeof existing.dimensionsCm === 'object') ? existing.dimensionsCm : {};
        updates.dimensionsCm = { ...currentDims, ...req.body.dimensionsCm };
        continue;
      }

      // Only update images/tags if a non-empty array is provided; otherwise keep previous values
      if ((key === 'images' || key === 'tags') && Array.isArray(req.body[key])) {
        if (req.body[key].length > 0) {
          updates[key] = req.body[key];
        }
        continue;
      }

      // default assignment for other scalar fields
      updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No fields to update' });

    // If slug is changing, check uniqueness within brand
    if (updates.slug) {
      const exists = await Product.findOne({ brandId, slug: updates.slug, _id: { $ne: id } });
      if (exists) return res.status(409).json({ message: 'Slug already exists for this brand' });
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, brandId, categoryId, subcategoryId },
      updates,
      { new: true }
    );

    res.json({ data: product });
  } catch (err) { next(err); }
});

// DELETE /api/admin/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products/:id - delete product
router.delete('/brands/:brandId/categories/:categoryId/subcategories/:subcategoryId/products/:id', async (req, res, next) => {
  try {
    const { brandId, categoryId, subcategoryId, id } = req.params;

    // ensure hierarchy exists
    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ _id: categoryId, brandId });
    if (!category) return res.status(404).json({ message: 'Category not found for this brand' });
    const sub = await Subcategory.findOne({ _id: subcategoryId, brandId, categoryId });
    if (!sub) return res.status(404).json({ message: 'Subcategory not found for this category' });

    const product = await Product.findOne({ _id: id, brandId, categoryId, subcategoryId });
    if (!product) return res.status(404).json({ message: 'Product not found for this path' });

    await Product.deleteOne({ _id: id });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ===== Admin Product Listing Endpoints =====
// GET /api/admin/brands/:brandSlug/products - get products for a brand (admin)
router.get('/brands/:brandSlug/products', async (req, res, next) => {
  try {
    const { brandSlug } = req.params;
    
    const brand = await Brand.findOne({ slug: brandSlug });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const filter = { brandId: brand._id };

    const products = await Product.find(filter)
      .populate('categoryId', 'name slug')
      .populate('subcategoryId', 'name slug')
      .select('-__v');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

// GET /api/admin/brands/:brandSlug/categories/:categorySlug/products - get products for a category (admin)
router.get('/brands/:brandSlug/categories/:categorySlug/products', async (req, res, next) => {
  try {
    const { brandSlug, categorySlug } = req.params;
    
    const brand = await Brand.findOne({ slug: brandSlug });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    
    const category = await Category.findOne({ brandId: brand._id, slug: categorySlug });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const filter = { 
      brandId: brand._id, 
      categoryId: category._id
    };

    const products = await Product.find(filter)
      .populate('subcategoryId', 'name slug')
      .select('-__v');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

// GET /api/admin/brands/:brandSlug/categories/:categorySlug/subcategories/:subcategorySlug/products - get products for a subcategory (admin)
router.get('/brands/:brandSlug/categories/:categorySlug/subcategories/:subcategorySlug/products', async (req, res, next) => {
  try {
    const { brandSlug, categorySlug, subcategorySlug } = req.params;
    
    const brand = await Brand.findOne({ slug: brandSlug });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    
    const category = await Category.findOne({ brandId: brand._id, slug: categorySlug });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    const subcategory = await Subcategory.findOne({ 
      brandId: brand._id, 
      categoryId: category._id, 
      slug: subcategorySlug 
    });
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });

    const filter = { 
      brandId: brand._id, 
      categoryId: category._id, 
      subcategoryId: subcategory._id
    };

    const products = await Product.find(filter).select('-__v');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

// GET /api/admin/products - get all products across all brands (admin)
router.get('/products', async (req, res, next) => {
  try {
    const { brand, category, subcategory } = req.query;

    const filter = {};

    if (brand) {
      const b = await Brand.findOne({ slug: brand });
      if (b) filter.brandId = b._id; else return res.json({ data: [] });
    }

    if (category) {
      const cat = await Category.findOne({ slug: category });
      if (cat) filter.categoryId = cat._id; else return res.json({ data: [] });
    }

    if (subcategory) {
      const sub = await Subcategory.findOne({ slug: subcategory });
      if (sub) filter.subcategoryId = sub._id; else return res.json({ data: [] });
    }

    const products = await Product.find(filter)
      .populate('brandId', 'name slug')
      .populate('categoryId', 'name slug')
      .populate('subcategoryId', 'name slug')
      .populate('vendorId', 'name')
      .select('-__v');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

// ===== Vendor Management Endpoints =====
// GET /api/admin/vendors - get list of all vendors (admin) - simple version
router.get('/vendors', async (req, res, next) => {
  try {
    const vendors = await Vendor.find()
      .populate('userId', 'name email')
      .select('displayName status userId')
      .sort({ createdAt: -1 });

    res.json({
      data: vendors
    });
  } catch (err) { next(err); }
});

// GET /api/admin/vendors/detailed - get detailed list of all vendors (admin) - with pagination and filters
router.get('/vendors/detailed', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status && ['pending', 'approved', 'suspended'].includes(status)) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const vendors = await Vendor.find(filter)
      .populate('userId', 'name email role isActive')
      .select('-__v')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Vendor.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      data: vendors,
      pagination: {
        page: parseInt(page),
        pages: totalPages,
        total,
        limit: parseInt(limit)
      }
    });
  } catch (err) { next(err); }
});

// GET /api/admin/vendors/:id - get vendor details by ID (admin)
router.get('/vendors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const vendor = await Vendor.findById(id)
      .populate('userId', 'name email role isActive createdAt')
      .select('-__v');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    res.json({
      data: vendor
    });
  } catch (err) { next(err); }
});

// PATCH /api/admin/vendors/:id - update vendor status (admin)
router.patch('/vendors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, displayName, businessName, phone, gstNumber, address } = req.body;
    
    const allowedUpdates = ['status', 'displayName', 'businessName', 'phone', 'gstNumber', 'address'];
    const updates = {};
    
    for (const key of allowedUpdates) {
      if (key in req.body) {
        if (key === 'status' && !['pending', 'approved', 'suspended'].includes(req.body[key])) {
          return res.status(400).json({ message: 'Invalid status value' });
        }
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const vendor = await Vendor.findByIdAndUpdate(id, updates, { new: true })
      .populate('userId', 'name email role isActive')
      .select('-__v');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    res.json({
      data: vendor
    });
  } catch (err) { next(err); }
});
