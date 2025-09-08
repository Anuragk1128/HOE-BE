const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  },
  { timestamps: true }
);

// each user can wishlist a product only once
wishlistSchema.index({ user: 1, product: 1 }, { unique: true });

wishlistSchema.pre(/^find/, function(next) {
  this.populate({ path: 'product', select: 'title price images slug brandId categoryId subcategoryId' });
  next();
});

module.exports = mongoose.model('Wishlist', wishlistSchema);
