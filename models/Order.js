const { Schema, model, Types } = require('mongoose');

// Geocoding service for fetching latitude/longitude
const geocodingService = require('../services/geocodingService');

// Order Item Schema - Enhanced for Shipyaari
const OrderItemSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    
    // Additional fields for Shipyaari
    sku: { type: String },
    category: { type: String },
    weight: { type: Number, default: 1 }, // in kg
    dimensions: {
      length: { type: Number, default: 10 }, // in cm
      breadth: { type: Number, default: 10 },
      height: { type: Number, default: 10 }
    },
    hsnCode: { type: String, default: '1234' }
  },
  { _id: false }
);

// Address Schema - Enhanced for Shipyaari
const AddressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' },
    phone: { type: String, required: true },
    
    // Additional fields for location services
    latitude: { type: String },
    longitude: { type: String },
    landmark: { type: String },
    // Geocoding metadata
    geocodingAttempted: { type: Boolean, default: false },
    geocodingStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    geocodingError: { type: String }
  },
  { _id: false }
);

// Razorpay Payment Result Schema
const RazorpayPaymentSchema = new Schema(
  {
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    paymentMethod: { type: String }, // card, netbanking, upi, etc.
    paymentStatus: { 
      type: String, 
      enum: ['pending', 'authorized', 'captured', 'failed'],
      default: 'pending'
    }
  },
  { _id: false }
);

// Shipment Details Schema (Enhanced)
const ShipmentSchema = new Schema(
  {
    shipyaariOrderId: { type: String },
    awbNumber: { type: String },
    courierPartner: { type: String },
    trackingUrl: { type: String },
    shipmentStatus: {
      type: String,
      enum: [
        'pending',
        'processing',
        'shipped',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'failed',
        'cancelled'
      ],
      default: 'pending'
    },
    estimatedDeliveryDate: { type: Date },
    actualDeliveryDate: { type: Date },
    shipmentError: { type: String },

    // NEW: Add tracking history entries
    trackingHistory: [
      {
        status: String,
        location: String,
        timestamp: Date,
        description: String,
        updatedAt: { type: Date, default: Date.now }
      }
    ],

    // NEW: Label and document URLs
    shippingLabel: {
      labelUrl: String,
      invoiceUrl: String,
      manifestUrl: String,
      generatedAt: Date
    },

    // NEW: Cancellation details
    cancellation: {
      isCancelled: { type: Boolean, default: false },
      cancelledAt: Date,
      cancelReason: String,
      cancelledBy: String // 'customer', 'admin', 'system'
    },

    // NEW: Last tracking update snapshot
    lastTrackingUpdate: {
      status: String,
      location: String,
      timestamp: Date,
      description: String
    }
  },
  { _id: false }
);

// Seller Details Schema
const SellerDetailsSchema = new Schema(
  {
    address: {
      fullAddress: { type: String, required: true },
      pincode: { type: Number, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, default: 'India' },
      latitude: { type: String },
      longitude: { type: String },
      geocodingAttempted: { type: Boolean, default: false },
      geocodingStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' }
    },
    contact: {
      name: { type: String, required: true },
      mobile: { type: Number, required: true },
      alternateMobile: { type: Number }
    }
  },
  { _id: false }
);

// Main Order Schema - Updated
const OrderSchema = new Schema(
  {
    // Order Identifiers
    orderId: { 
      type: String, 
      unique: true
    },
    orderNumber: { 
      type: String, 
      unique: true 
    },

    // User Reference
    user: { 
      type: Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },

    // Customer Details (for guest orders or additional info)
    customerDetails: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      mobile: { type: String, required: true }
    },

    // Order Items
    items: { 
      type: [OrderItemSchema], 
      required: true, 
      validate: v => v && v.length > 0 
    },

    // Addresses
    shippingAddress: { 
      type: AddressSchema, 
      required: true 
    },
    billingAddress: { 
      type: AddressSchema 
    },

    // Seller Details for Shipyaari
    sellerDetails: {
      type: SellerDetailsSchema,
      required: true
    },

    // Payment Information
    paymentMethod: { 
      type: String, 
      enum: ['online', 'cod', 'wallet'], 
      default: 'online' 
    },
    
    // Razorpay Integration
    razorpayDetails: {
      type: RazorpayPaymentSchema
    },

    // Shipment Integration
    shipmentDetails: {
      type: ShipmentSchema
    },

    // Order Calculations
    itemsPrice: { type: Number, required: true, min: 0 },
    shippingPrice: { type: Number, required: true, min: 0, default: 0 },
    taxPrice: { type: Number, required: true, min: 0, default: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    // Order Status Management
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'paid', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Timestamps
    paidAt: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },

    // Additional Order Info
    orderNotes: { type: String },
    specialInstructions: { type: String },
    insurance: { type: Boolean, default: false },

    // Status History for Tracking
    statusHistory: [{
      status: { type: String },
      timestamp: { type: Date, default: Date.now },
      updatedBy: { type: String },
      notes: { type: String }
    }]
  },
  { timestamps: true }
);

// Pre-save middleware for geocoding addresses
OrderSchema.pre('save', async function(next) {
  try {
    // Geocode shipping address
    if (this.isModified('shippingAddress') && this.shippingAddress && !this.shippingAddress.geocodingAttempted) {
      const shippingCoords = await geocodingService.getCoordinatesFromAddress(this.shippingAddress);
      if (shippingCoords) {
        this.shippingAddress.latitude = shippingCoords.latitude;
        this.shippingAddress.longitude = shippingCoords.longitude;
        this.shippingAddress.geocodingStatus = 'success';
      } else {
        this.shippingAddress.geocodingStatus = 'failed';
        this.shippingAddress.geocodingError = 'Unable to geocode shipping address';
      }
      this.shippingAddress.geocodingAttempted = true;
    }

    // Geocode billing address if exists
    if (this.billingAddress && this.isModified('billingAddress') && !this.billingAddress.geocodingAttempted) {
      const billingCoords = await geocodingService.getCoordinatesFromAddress(this.billingAddress);
      if (billingCoords) {
        this.billingAddress.latitude = billingCoords.latitude;
        this.billingAddress.longitude = billingCoords.longitude;
        this.billingAddress.geocodingStatus = 'success';
      } else {
        this.billingAddress.geocodingStatus = 'failed';
        this.billingAddress.geocodingError = 'Unable to geocode billing address';
      }
      this.billingAddress.geocodingAttempted = true;
    }

    // Geocode seller address
    if (this.sellerDetails && this.isModified('sellerDetails.address') && !this.sellerDetails.address.geocodingAttempted) {
      const sellerCoords = await geocodingService.getCoordinatesFromAddress({
        addressLine1: this.sellerDetails.address.fullAddress,
        city: this.sellerDetails.address.city,
        state: this.sellerDetails.address.state,
        postalCode: this.sellerDetails.address.pincode?.toString(),
        country: this.sellerDetails.address.country
      });

      if (sellerCoords) {
        this.sellerDetails.address.latitude = sellerCoords.latitude;
        this.sellerDetails.address.longitude = sellerCoords.longitude;
        this.sellerDetails.address.geocodingStatus = 'success';
      } else {
        this.sellerDetails.address.geocodingStatus = 'failed';
      }
      this.sellerDetails.address.geocodingAttempted = true;
    }

    next();
  } catch (error) {
    console.error('Error in order geocoding middleware:', error);
    next(); // Continue saving even if geocoding fails
  }
});

// Pre-save middleware to generate order IDs
OrderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderId = `ORD-${timestamp}-${random}`;
  }

  if (!this.orderNumber) {
    const count = await model('Order').countDocuments();
    this.orderNumber = `ORD${String(count + 1).padStart(6, '0')}`;
  }

  next();
});

// Indexes for better performance
OrderSchema.index({ user: 1, status: 1 });
OrderSchema.index({ orderId: 1 });
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ 'razorpayDetails.razorpayOrderId': 1 });
// Indexes for shipment lookups
OrderSchema.index({ 'shipmentDetails.awbNumber': 1 });
OrderSchema.index({ 'shipmentDetails.shipmentStatus': 1 });

module.exports = model('Order', OrderSchema);
