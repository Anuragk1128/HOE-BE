const express = require('express');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');

const router = express.Router();

// GET /api/catalog/products (combined across brands)
router.get('/products', async (req, res, next) => {
  try {
    const { brand, category, subcategory, q, min, max, page = 1, limit = 20 } = req.query;

    const filter = { status: 'active' };

    if (brand) {
      const b = await Brand.findOne({ slug: brand, active: true });
      if (b) filter.brandId = b._id; else return res.json({ data: [], pagination: { page: 1, pages: 0, total: 0 } });
    }

    if (category) {
      const cat = await Category.findOne({ slug: category });
      if (cat) filter.categoryId = cat._id; else return res.json({ data: [], pagination: { page: 1, pages: 0, total: 0 } });
    }

    if (subcategory) {
      const sub = await Subcategory.findOne({ slug: subcategory });
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
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-__v'),
      Product.countDocuments(filter),
    ]);

    res.json({
      data: items,
      pagination: { page: Number(page), pages: Math.ceil(total / Number(limit) || 1), total },
    });
  } catch (err) { next(err); }
});

// GET /api/products/:idOrSlug
router.get('/product/:idOrSlug', async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const isObjectId = idOrSlug.match(/^[0-9a-fA-F]{24}$/);
    const product = await Product.findOne(
      isObjectId ? { _id: idOrSlug } : { slug: idOrSlug }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ data: product });
  } catch (err) { next(err); }
});

module.exports = router;
