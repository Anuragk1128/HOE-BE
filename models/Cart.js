const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

// a product should appear only once per user in the cart
cartItemSchema.index({ user: 1, product: 1 }, { unique: true });

cartItemSchema.pre(/^find/, function(next) {
  this.populate({ path: 'product', select: 'title price images slug brandId categoryId subcategoryId' });
  next();
});

module.exports = mongoose.model('CartItem', cartItemSchema);


