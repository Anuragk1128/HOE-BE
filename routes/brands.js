const express = require('express');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');

const router = express.Router();

// GET /api/brands
router.get('/', async (req, res, next) => {
  try {
    const brands = await Brand.find({ active: true }).select('name slug description');
    res.json({ data: brands });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/categories
router.get('/:brandSlug/categories', async (req, res, next) => {
  try {
    const brand = await Brand.findOne({ slug: req.params.brandSlug, active: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const categories = await Category.find({ brandId: brand._id }).select('name slug image');
    res.json({ data: categories });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/categories/:categorySlug/subcategories
router.get('/:brandSlug/categories/:categorySlug/subcategories', async (req, res, next) => {
  try {
    const brand = await Brand.findOne({ slug: req.params.brandSlug, active: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    const category = await Category.findOne({ brandId: brand._id, slug: req.params.categorySlug });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const subcategories = await Subcategory.find({ brandId: brand._id, categoryId: category._id }).select('name slug image');
    res.json({ data: subcategories });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/products
router.get('/:brandSlug/products', async (req, res, next) => {
  try {
    const { brandSlug } = req.params;
    const { category, subcategory, q, min, max, page = 1, limit = 20 } = req.query;
    const brand = await Brand.findOne({ slug: brandSlug, active: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const filter = { brandId: brand._id, status: 'active' };

    if (category) {
      const cat = await Category.findOne({ brandId: brand._id, slug: category });
      if (cat) filter.categoryId = cat._id; else return res.json({ data: [], pagination: { page: 1, pages: 0, total: 0 } });
    }

    if (subcategory) {
      const sub = await Subcategory.findOne({ brandId: brand._id, slug: subcategory });
      if (sub) filter.subcategoryId = sub._id; else return res.json({ data: [], pagination: { page: 1, pages: 0, total: 0 } });
    }

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    if (min || max) {
      filter.price = {};
      if (min) filter.price.$gte = Number(min);
      if (max) filter.price.$lte = Number(max);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-__v').populate('categoryId', 'name slug').populate('subcategoryId', 'name slug'),
      Product.countDocuments(filter),
    ]);

    res.json({
      data: items,
      pagination: { page: Number(page), pages: Math.ceil(total / Number(limit) || 1), total },
    });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/products/list
// Public endpoint: returns only the list of product titles for the given brand
router.get('/:brandSlug/products/list', async (req, res, next) => {
  try {
    const { brandSlug } = req.params;
    const brand = await Brand.findOne({ slug: brandSlug, active: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    const products = await Product.find({ brandId: brand._id, status: 'active' }).select('title').sort({ createdAt: -1 });
    // Return array of titles only
    const titles = products.map(p => p.title);
    res.json({ data: titles });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/categories/:categorySlug/products
router.get('/:brandSlug/categories/:categorySlug/products', async (req, res, next) => {
  try {
    const { brandSlug, categorySlug } = req.params;
    
    const brand = await Brand.findOne({ slug: brandSlug, active: true });
    if (!brand) return res.status(404).json({ message: 'Brand not found' });
    
    const category = await Category.findOne({ brandId: brand._id, slug: categorySlug });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const filter = { 
      brandId: brand._id, 
      categoryId: category._id, 
      status: 'active' 
    };

    const products = await Product.find(filter).select('-__v').populate('categoryId', 'name slug').populate('subcategoryId', 'name slug');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

// GET /api/brands/:brandSlug/categories/:categorySlug/subcategories/:subcategorySlug/products
router.get('/:brandSlug/categories/:categorySlug/subcategories/:subcategorySlug/products', async (req, res, next) => {
  try {
    const { brandSlug, categorySlug, subcategorySlug } = req.params;
    
    const brand = await Brand.findOne({ slug: brandSlug, active: true });
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
      subcategoryId: subcategory._id, 
      status: 'active' 
    };

    const products = await Product.find(filter).select('-__v').populate('categoryId', 'name slug').populate('subcategoryId', 'name slug');

    res.json({
      data: products
    });
  } catch (err) { next(err); }
});

module.exports = router;
