const express = require('express');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');
const { authRequired, requireRoles } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const router = express.Router();

// Multer disk storage for temporary file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(process.cwd(), 'tmp_uploads');
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `products-${unique}${ext}`);
    }
  })
});

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
// Complete bulk upload endpoint with ALL schema fields
router.post('/products/bulk-upload', upload.single('productFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Use field name "productFile"' });
    }
    const { path: filePath, mimetype, originalname } = req.file;
    let rawProducts = [];

    // Parse file based on type (same as before)
    if (mimetype.includes('sheet') || mimetype.includes('excel')) {
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      rawProducts = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    } else if (mimetype === 'text/csv') {
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      rawProducts = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    const results = [];
    const errors = [];

    // Note: We resolve brand/category/subcategory per row to ensure hierarchy integrity

    // Helper: normalize various cell values
    const toBool = (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
      return undefined;
    };

    // Process each product with ALL schema fields
    for (let i = 0; i < rawProducts.length; i++) {
      const productData = rawProducts[i];
      const rowNumber = i + 2;
      
      try {
        // Skip completely empty rows
        if (!productData.title && !productData.brandSlug && !productData.price) {
          continue;
        }

        // Required field validation
        const validationErrors = [];
        if (!productData.brandSlug) validationErrors.push('Missing brandSlug');
        if (!productData.categorySlug) validationErrors.push('Missing categorySlug');
        if (!productData.subcategorySlug) validationErrors.push('Missing subcategorySlug');
        if (!productData.title) validationErrors.push('Missing title');
        if (!productData.price || isNaN(parseFloat(productData.price))) {
          validationErrors.push('Missing or invalid price');
        }

        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join(', '));
        }

        // Find brand, category, subcategory within correct hierarchy
        const brand = await Brand.findOne({ slug: productData.brandSlug });
        
        let category = null;
        let subcategory = null;
        if (brand) {
          category = await Category.findOne({ brandId: brand._id, slug: productData.categorySlug });
          if (category) {
            subcategory = await Subcategory.findOne({ brandId: brand._id, categoryId: category._id, slug: productData.subcategorySlug });
          }
        }

        if (!brand) throw new Error(`Brand not found: ${productData.brandSlug}`);
        if (!category) throw new Error(`Category not found: ${productData.categorySlug}`);
        if (!subcategory) throw new Error(`Subcategory not found: ${productData.subcategorySlug}`);

        // Create product object with ALL possible schema fields
        const transformedProduct = {
          // Required fields
          title: productData.title,
          price: Number(productData.price)
        };

        // Basic product info
        if (productData.slug && productData.slug.trim()) {
          transformedProduct.slug = slugify(productData.slug.trim());
        } else {
          transformedProduct.slug = slugify(productData.title);
        }

        if (productData.description && productData.description.trim()) {
          transformedProduct.description = productData.description.trim();
        }

        if (productData.images && productData.images.trim()) {
          transformedProduct.images = productData.images.split(',')
            .map(img => img.trim())
            .filter(img => img.length > 0);
        }

        if (productData.compareAtPrice && !isNaN(parseFloat(productData.compareAtPrice))) {
          transformedProduct.compareAtPrice = Number(productData.compareAtPrice);
        }

        // SHIPPING & LOGISTICS FIELDS - UPDATED
        if (productData.sku) {
          transformedProduct.sku = String(productData.sku).trim();
        }

        if (productData.shippingCategory) {
          transformedProduct.shippingCategory = String(productData.shippingCategory).trim();
        }

        if (productData.weightKg && !isNaN(parseFloat(productData.weightKg))) {
          transformedProduct.weightKg = Number(productData.weightKg);
        }

        // DIMENSIONS OBJECT (from your schema)
        if (productData.dimensionsLength || productData.dimensionsBreadth || productData.dimensionsHeight) {
          const dimensionsCm = {};
          if (productData.dimensionsLength && !isNaN(parseFloat(productData.dimensionsLength))) {
            dimensionsCm.length = Number(productData.dimensionsLength);
          }
          if (productData.dimensionsBreadth && !isNaN(parseFloat(productData.dimensionsBreadth))) {
            dimensionsCm.breadth = Number(productData.dimensionsBreadth);
          }
          if (productData.dimensionsHeight && !isNaN(parseFloat(productData.dimensionsHeight))) {
            dimensionsCm.height = Number(productData.dimensionsHeight);
          }
          if (Object.keys(dimensionsCm).length > 0) {
            transformedProduct.dimensionsCm = dimensionsCm;
          }
        }

        // TAX & COMPLIANCE FIELDS (from your schema)
        if (productData.hsnCode) {
          transformedProduct.hsnCode = String(productData.hsnCode).trim();
        }

        if (productData.gstRate && !isNaN(parseFloat(productData.gstRate))) {
          transformedProduct.gstRate = Number(productData.gstRate);
        }

        if (productData.productType) {
          transformedProduct.productType = String(productData.productType).trim();
        }

        // ATTRIBUTES OBJECT - UPDATED
        const attributes = {};
        if (productData.size) {
          attributes.size = String(productData.size).split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        if (productData.color) {
          attributes.color = String(productData.color).split(',').map(c => c.trim()).filter(c => c.length > 0);
        }
        if (productData.material) {
          attributes.material = String(productData.material).trim();
        }
        if (productData.fit) {
          attributes.fit = String(productData.fit).trim();
        }
        if (productData.styling) {
          attributes.styling = String(productData.styling).trim();
        }
        // Add any additional attributes from the file
        Object.keys(productData).forEach(key => {
          if (key.startsWith('attr_') && productData[key] && productData[key].trim()) {
            const attrName = key.replace('attr_', '');
            attributes[attrName] = productData[key].trim();
          }
        });
        if (Object.keys(attributes).length > 0) {
          transformedProduct.attributes = attributes;
        }

        // INVENTORY FIELDS
        if (productData.stock && !isNaN(parseInt(productData.stock))) {
          transformedProduct.stock = parseInt(productData.stock);
        }

        if (productData.lowStockThreshold && !isNaN(parseInt(productData.lowStockThreshold))) {
          transformedProduct.lowStockThreshold = parseInt(productData.lowStockThreshold);
        }

        // STATUS & BOOLEAN FIELDS - UPDATED
        if (productData.isActive !== undefined && productData.isActive !== '') {
          const b = toBool(productData.isActive);
          if (typeof b === 'boolean') transformedProduct.isActive = b;
        }

        if (productData.status) {
          transformedProduct.status = String(productData.status).trim();
        }

        // VENDOR & BUSINESS FIELDS - UPDATED
        if (productData.vendorId) {
          transformedProduct.vendorId = String(productData.vendorId).trim();
        }

        if (productData.tags) {
          transformedProduct.tags = String(productData.tags).split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
        }

        // MARKETING FLAGS (case-insensitive TRUE/FALSE)
        const featuredBool = toBool(productData.featured);
        if (typeof featuredBool === 'boolean') transformedProduct.featured = featuredBool;
        const bestsellerBool = toBool(productData.bestseller);
        if (typeof bestsellerBool === 'boolean') transformedProduct.bestseller = bestsellerBool;
        const newArrivalBool = toBool(productData.newArrival);
        if (typeof newArrivalBool === 'boolean') transformedProduct.newArrival = newArrivalBool;
        const onSaleBool = toBool(productData.onSale);
        if (typeof onSaleBool === 'boolean') transformedProduct.onSale = onSaleBool;

        // RATING & SALES FIELDS (if provided)
        if (productData.rating && !isNaN(parseFloat(productData.rating))) {
          transformedProduct.rating = Number(productData.rating);
        }
        if (productData.numReviews && !isNaN(parseInt(productData.numReviews))) {
          transformedProduct.numReviews = parseInt(productData.numReviews);
        }
        if (productData.totalSales && !isNaN(parseInt(productData.totalSales))) {
          transformedProduct.totalSales = parseInt(productData.totalSales);
        }
        if (productData.viewCount && !isNaN(parseInt(productData.viewCount))) {
          transformedProduct.viewCount = parseInt(productData.viewCount);
        }

        // SEO META FIELDS - UPDATED
        if (productData.metaTitle) {
          transformedProduct.metaTitle = String(productData.metaTitle).trim();
        }
        if (productData.metaDescription) {
          transformedProduct.metaDescription = String(productData.metaDescription).trim();
        }
        if (productData.metaKeywords) {
          transformedProduct.metaKeywords = String(productData.metaKeywords).split(',')
            .map(keyword => keyword.trim())
            .filter(keyword => keyword.length > 0);
        }

        // Enforce unique slug per brand
        const existing = await Product.findOne({ brandId: brand._id, slug: transformedProduct.slug });
        if (existing) {
          throw new Error(`Duplicate slug for brand: ${transformedProduct.slug}`);
        }

        // Create product in database
        const createdProduct = await Product.create({
          brandId: brand._id,
          categoryId: category._id,
          subcategoryId: subcategory._id,
          ...transformedProduct
        });

        results.push({ 
          row: rowNumber, 
          success: true, 
          productId: createdProduct._id,
          title: transformedProduct.title,
          brand: brand.name,
          category: category.name,
          subcategory: subcategory.name
        });

      } catch (error) {
        errors.push({ 
          row: rowNumber, 
          error: error.message,
          productData: productData.title || `Row ${rowNumber}`,
          brandSlug: productData.brandSlug,
          categorySlug: productData.categorySlug,
          subcategorySlug: productData.subcategorySlug
        });
      }
    }

    // Clean up uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      filename: originalname,
      summary: {
        total: rawProducts.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors
    });

  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

