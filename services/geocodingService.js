// services/geocodingService.js
const axios = require('axios');

class GeocodingService {
  constructor() {
    this.accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    this.baseUrl = 'https://api.mapbox.com/search/geocode/v6';
    
    if (!this.accessToken) {
      console.error('MAPBOX_ACCESS_TOKEN is not set in environment variables');
    }
  }

  // Forward geocoding - address to coordinates
  async getCoordinatesFromAddress(addressData) {
    try {
      if (!this.accessToken) {
        throw new Error('Mapbox access token not configured');
      }

      // Build full address string
      const addressString = [
        addressData.addressLine1,
        addressData.addressLine2,
        addressData.city,
        addressData.state,
        addressData.postalCode,
        addressData.country || 'India'
      ].filter(Boolean).join(', ');

      console.log('Geocoding address:', addressString);

      const response = await axios.get(`${this.baseUrl}/forward`, {
        params: {
          q: addressString,
          access_token: this.accessToken,
          limit: 1,
          country: (addressData.country === 'India' || !addressData.country) ? 'in' : undefined
        }
      });

      if (response.data.features && response.data.features.length > 0) {
        const [longitude, latitude] = response.data.features[0].geometry.coordinates;
        const result = {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          full_address: response.data.features[0].properties.full_address,
          place_formatted: response.data.features[0].properties.place_formatted
        };
        
        console.log('Geocoding successful:', result);
        return result;
      }

      console.log('No geocoding results found for:', addressString);
      return null;
    } catch (error) {
      console.error('Geocoding error:', error.message);
      if (error.response) {
        console.error('API Response:', error.response.status, error.response.data);
      }
      return null;
    }
  }

  // Reverse geocoding - coordinates to address
  async getAddressFromCoordinates(latitude, longitude) {
    try {
      if (!this.accessToken) {
        throw new Error('Mapbox access token not configured');
      }

      const response = await axios.get(`${this.baseUrl}/reverse`, {
        params: {
          longitude,
          latitude,
          access_token: this.accessToken
        }
      });

      if (response.data.features && response.data.features.length > 0) {
        return {
          full_address: response.data.features[0].properties.full_address,
          place_formatted: response.data.features[0].properties.place_formatted,
          coordinates: [longitude, latitude]
        };
      }

      return null;
    } catch (error) {
      console.error('Reverse geocoding error:', error.message);
      return null;
    }
  }

  // Validate coordinates
  isValidCoordinates(latitude, longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
}

module.exports = new GeocodingService();
