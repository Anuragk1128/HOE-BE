// routes/geocoding.js
const express = require('express');
const router = express.Router();
const geocodingService = require('../services/geocodingService');

// Validate and geocode a single address
router.post('/api/geocoding/validate-address', async (req, res) => {
  try {
    const addressData = req.body;
    
    // Validate required fields
    if (!addressData.addressLine1 || !addressData.city || !addressData.state || !addressData.postalCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required address fields'
      });
    }
    
    const coordinates = await geocodingService.getCoordinatesFromAddress(addressData);
    
    if (coordinates) {
      res.json({
        success: true,
        data: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          full_address: coordinates.full_address,
          place_formatted: coordinates.place_formatted,
          isValid: true,
          original_input: addressData
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Address could not be geocoded - please check the address details',
        isValid: false,
        original_input: addressData
      });
    }
  } catch (error) {
    console.error('Address validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during address validation'
    });
  }
});

// Reverse geocode coordinates to address
router.post('/api/geocoding/reverse', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    if (!geocodingService.isValidCoordinates(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates provided'
      });
    }
    
    const addressData = await geocodingService.getAddressFromCoordinates(latitude, longitude);
    
    if (addressData) {
      res.json({
        success: true,
        data: addressData
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No address found for the given coordinates'
      });
    }
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during reverse geocoding'
    });
  }
});

// Test geocoding service
router.get('/api/geocoding/test', async (req, res) => {
  try {
    const testAddress = {
      addressLine1: 'Gateway of India',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India'
    };
    
    const result = await geocodingService.getCoordinatesFromAddress(testAddress);
    
    res.json({
      success: true,
      message: 'Geocoding service test',
      test_address: testAddress,
      result: result,
      token_configured: !!process.env.MAPBOX_ACCESS_TOKEN
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      token_configured: !!process.env.MAPBOX_ACCESS_TOKEN
    });
  }
});

module.exports = router;
