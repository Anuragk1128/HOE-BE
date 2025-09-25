const { Schema, model } = require('mongoose');
const validator = require('validator');
const geocodingService = require('../services/geocodingService');

// Enhanced Address subdocument schema
const AddressSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    phone: { type: String, required: true, trim: true },
    latitude: { type: String, trim: true },
    longitude: { type: String, trim: true },
    landmark: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    
    // Geocoding tracking fields
    geocodingAttempted: { type: Boolean, default: false },
    geocodingStatus: { 
      type: String, 
      enum: ['pending', 'success', 'failed'], 
      default: 'pending' 
    },
    geocodingError: { type: String }
  },
  { _id: true, timestamps: true }
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Invalid email'],
    },
    passwordHash: { type: String, required: function() { return this.authProvider === 'local'; } },
    role: { type: String, enum: ['customer', 'vendor', 'admin'], default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    phone: { type: String, trim: true },
    addresses: { type: [AddressSchema], default: [] },
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    avatar: { type: String, trim: true },
  },
  { timestamps: true }
);

// Pre-save middleware for automatic geocoding
UserSchema.pre('save', async function(next) {
  try {
    if (this.isModified('addresses')) {
      console.log('Processing address geocoding for user:', this._id);
      
      for (let address of this.addresses) {
        // Check if address needs geocoding
        const shouldGeocode = address.isNew || 
          ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country']
            .some(field => address.isModified(field));
        
        if (shouldGeocode && !address.geocodingAttempted) {
          console.log('Attempting geocoding for address:', address.addressLine1);
          
          const coordinates = await geocodingService.getCoordinatesFromAddress({
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country
          });

          if (coordinates) {
            address.latitude = coordinates.latitude;
            address.longitude = coordinates.longitude;
            address.geocodingStatus = 'success';
            console.log('Geocoding successful for:', address.city);
          } else {
            address.geocodingStatus = 'failed';
            address.geocodingError = 'Unable to geocode address';
            console.log('Geocoding failed for:', address.city);
          }
          
          address.geocodingAttempted = true;
        }
      }
    }
    next();
  } catch (error) {
    console.error('Error in user geocoding middleware: ', error);
    next(); // Continue saving even if geocoding fails
  }
});

module.exports = model('User', UserSchema);
