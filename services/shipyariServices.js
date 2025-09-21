const axios = require('axios');

class ShipyaariService {
  constructor() {
    this.baseURL = process.env.SHIPYAARI_BASE_URL || 'https://api-seller.shipyaari.com/api/v1';
    this.credentials = {
      email: process.env.SHIPYAARI_EMAIL,
      password: process.env.SHIPYAARI_PASSWORD
    };
    this.token = null;
    this.tokenExpiry = null;
  }

  // 1. AUTHENTICATION (Fixed - Correct token extraction and header format)
  async authenticate() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      console.log('🔐 Authenticating with Shipyaari...');
      console.log('📋 Using credentials:', { email: this.credentials.email, password: '***' });
      
      const response = await axios.post(`${this.baseURL}/seller/signIn`, this.credentials, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      console.log('📋 Authentication response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        this.token = response.data.data[0].token; // ✅ FIXED: data is an array
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 hours
        console.log('✅ Shipyaari authentication successful, token received');
        return this.token;
      } else {
        throw new Error(`Authentication failed: ${response.data.message}`);
      }
    } catch (error) {
      console.error('❌ Shipyaari authentication error:', error.response?.data || error.message);
      throw new Error(`Shipyaari authentication failed: ${error.message}`);
    }
  }

  // 2. CREATE SHIPMENT (Existing - Enhanced with environment variables)
  async createShipment(order) {
    try {
      console.log(`📦 Creating Shipyaari shipment for order: ${order.orderId}`);
      
      const token = await this.authenticate();
      const shipyaariPayload = this.buildShipyaariPayload(order);
      
      const response = await axios.post(
        `${this.baseURL}/order/placeOrderApiV3`,
        shipyaariPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          timeout: 45000 // 45 second timeout for order creation
        }
      );

      if (response.data.success) {
        console.log('✅ Shipyaari order created successfully:', response.data.data);
        
        // Parse the actual response structure from Shipyaari API
        const orderData = response.data.data[0]; // API returns array with first element
        
        return {
          shipyaariOrderId: orderData.orderId,
          awbNumber: orderData.awbs?.[0]?.tracking?.awb,
          courierPartner: orderData.awbs?.[0]?.charges?.partnerName,
          trackingUrl: orderData.awbs?.[0]?.tracking?.label,
          estimatedDeliveryDate: orderData.awbs?.[0]?.pickupDate,
          zone: orderData.zone,
          charges: orderData.awbs?.[0]?.charges
        };
      } else {
        throw new Error(`Shipyaari API error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Shipyaari shipment creation error:', error.response?.data || error.message);
      
      // Return more detailed error information
      const errorMessage = error.response?.data?.message || error.message || 'Unknown shipment creation error';
      throw new Error(`Failed to create shipment: ${errorMessage}`);
    }
  }

  // 3. TRACK SHIPMENT (NEW - Essential)
  async trackShipment(awbNumber) {
    try {
      console.log(`📍 Tracking shipment with AWB: ${awbNumber}`);
      
      const token = await this.authenticate();
      
      const response = await axios.get(
        `${this.baseURL}/tracking/getTracking?trackingNo=${awbNumber}`,
        {
          headers: {
            'Authorization': token,
            'accept': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.success) {
        const trackingData = response.data.data;
        console.log('✅ Tracking data retrieved for AWB:', awbNumber);
        
        return {
          awbNumber: awbNumber,
          status: trackingData.status || 'unknown',
          location: trackingData.location || 'N/A',
          lastUpdate: trackingData.lastUpdate || new Date(),
          deliveryStatus: trackingData.deliveryStatus || 'in_transit',
          estimatedDelivery: trackingData.estimatedDelivery,
          trackingHistory: (trackingData.trackingHistory || []).map(update => ({
            status: update.status,
            location: update.location,
            timestamp: new Date(update.timestamp),
            description: update.description || update.message || ''
          })),
          courierPartner: trackingData.courierPartner || trackingData.courier,
          trackingUrl: trackingData.trackingUrl
        };
      } else {
        throw new Error(`Tracking failed: ${response.data.message || 'No tracking data available'}`);
      }
    } catch (error) {
      console.error('❌ Shipyaari tracking error:', error.response?.data || error.message);
      
      // Return partial data if available
      if (error.response?.status === 404) {
        return {
          awbNumber: awbNumber,
          status: 'not_found',
          message: 'Tracking information not yet available',
          trackingHistory: []
        };
      }
      
      throw new Error(`Failed to track shipment: ${error.message}`);
    }
  }

  // 4. GENERATE SHIPPING LABELS (NEW - Important)
  async generateShippingLabels(awbNumbers) {
    try {
      console.log(`🏷️ Generating labels for AWBs: ${awbNumbers.join(', ')}`);
      
      const token = await this.authenticate();
      
      const response = await axios.post(
        `${this.baseURL}/labels/fetchLabels`,
        {
          awbs: Array.isArray(awbNumbers) ? awbNumbers : [awbNumbers],
          source: "API"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          timeout: 60000 // Labels can take longer to generate
        }
      );

      if (response.data.success) {
        console.log('✅ Labels generated successfully');
        return {
          labelUrl: response.data.data.labelUrl || response.data.labelUrl,
          invoiceUrl: response.data.data.invoiceUrl || response.data.invoiceUrl,
          manifestUrl: response.data.data.manifestUrl || response.data.manifestUrl,
          generatedAt: new Date()
        };
      } else {
        throw new Error(`Label generation failed: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Label generation error:', error.response?.data || error.message);
      throw new Error(`Failed to generate labels: ${error.message}`);
    }
  }

  // 5. CANCEL SHIPMENT (NEW - Essential)
  async cancelShipment(awbNumber, reason = 'Order cancelled by customer') {
    try {
      console.log(`❌ Cancelling shipment with AWB: ${awbNumber}`);
      
      const token = await this.authenticate();
      
      const response = await axios.post(
        `${this.baseURL}/cancel`,
        {
          awbNumber: awbNumber,
          reason: reason
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          timeout: 30000
        }
      );

      if (response.data.success) {
        console.log('✅ Shipment cancelled successfully');
        return {
          cancelled: true,
          awbNumber: awbNumber,
          reason: reason,
          cancelledAt: new Date(),
          cancellationId: response.data.data?.cancellationId
        };
      } else {
        throw new Error(`Cancellation failed: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Shipment cancellation error:', error.response?.data || error.message);
      
      // Some shipments might not be cancellable
      if (error.response?.status === 400 || error.response?.data?.message?.includes('cannot be cancelled')) {
        return {
          cancelled: false,
          awbNumber: awbNumber,
          reason: 'Shipment cannot be cancelled at current stage',
          error: error.response.data.message
        };
      }
      
      throw new Error(`Failed to cancel shipment: ${error.message}`);
    }
  }

  // 6. BUILD SHIPYAARI PAYLOAD (Enhanced with environment variables)
  buildShipyaariPayload(order) {
    return {
      pickupDetails: {
        addressType: "warehouse",
        fullAddress: process.env.SELLER_ADDRESS || "201 Goregaon West, Mumbai, Maharashtra 400062",
        pincode: parseInt(process.env.SELLER_PINCODE) || 400062,
        startTime: process.env.PICKUP_START_TIME || "09",
        endTime: process.env.PICKUP_END_TIME || "18",
        latitude: process.env.SELLER_LATITUDE || "19.0697",
        longitude: process.env.SELLER_LONGITUDE || "72.8856",
        contact: {
          name: process.env.SELLER_CONTACT_NAME || "Store Manager",
          mobileNo: parseInt(process.env.SELLER_MOBILE) || 9876543210,
          alternateMobileNo: parseInt(process.env.SELLER_ALTERNATE_MOBILE || process.env.SELLER_MOBILE) || 9876543210
        }
      },
      deliveryDetails: {
        addressType: "home",
        fullAddress: this.buildFullAddress(order.shippingAddress),
        pincode: parseInt(order.shippingAddress.postalCode),
        startTime: "10",
        endTime: "20",
        latitude: order.shippingAddress.latitude ? parseFloat(order.shippingAddress.latitude) : null,
        longitude: order.shippingAddress.longitude ? parseFloat(order.shippingAddress.longitude) : null,
        contact: {
          name: order.shippingAddress.fullName,
          mobileNo: parseInt(order.shippingAddress.phone),
          alternateMobileNo: parseInt(order.shippingAddress.phone)
        },
        gstNumber: process.env.BUSINESS_GST_NUMBER || "09HRTPS8794G1ZD" // Your business GST number
      },
      boxInfo: order.items.map((item, index) => ({
        name: `box_${index + 1}`,
        type: "parcel",
        weightUnit: "Kg",
        deadWeight: item.weight || 1,
        length: item.dimensions?.length || 10,
        breadth: item.dimensions?.breadth || 10,
        height: item.dimensions?.height || 10,
        qty: item.quantity,
        discount: 0,
        measureUnit: "cm",
        products: [{
          name: item.title,
          category: item.category || "General",
          sku: item.sku || item.product.toString(),
          hsnCode: item.hsnCode || "1234",
          qty: item.quantity,
          unitPrice: item.price,
          discount: 0,
          unitTax: Math.round((item.price * (item.gstRate || 12)) / 100),
          sellingPrice: item.price,
          totalDiscount: 0,
          totalPrice: item.price * item.quantity,
          weightUnit: "kg",
          deadWeight: item.weight || 1,
          length: item.dimensions?.length || 10,
          breadth: item.dimensions?.breadth || 10,  
          height: item.dimensions?.height || 10,
          measureUnit: "cm",
          images: item.image ? [item.image] : []
        }],
        codInfo: {
          isCod: order.paymentMethod === 'cod',
          collectableAmount: order.paymentMethod === 'cod' ? order.totalPrice : 0,
          invoiceValue: order.totalPrice
        },
        podInfo: {
          isPod: false
        },
        insurance: order.insurance || false
      })),
      orderType: "B2C",
      transit: "FORWARD",
      courierPartner: "",
      courierPartnerServices: "",
      serviceMode: "AIR",
      giftCharges: 0,
      shippingCharges: 0,
      transactionCharges: 0,
      advanceAmountPaid: 0,
      servicePriority: "cheapest",
      source: "",
      qcType: "DoorStep",
      returnReason: "",
      orderFutureDate: "",
      pickupDate: new Date().getTime().toString(),
      gstNumber: process.env.BUSINESS_GST_NUMBER || "09HRTPS8794G1ZD",
      childGstNumber: process.env.BUSINESS_GST_NUMBER || "09HRTPS8794G1ZD",
      parentId: 1,
      childId: 2,
      orderId: order.orderId,
      eWayBillNo: "",
      brandName: process.env.BRAND_NAME || "Your Store",
      brandLogo: process.env.BRAND_LOGO || ""
    };
  }

  // Helper: Build full address string
  buildFullAddress(address) {
    const parts = [
      address.addressLine1,
      address.addressLine2,
      address.city,
      address.state
    ].filter(Boolean);
    
    return parts.join(', ');
  }

  // 7. BULK TRACKING (Utility method)
  async trackMultipleShipments(awbNumbers) {
    const trackingPromises = awbNumbers.map(awb => 
      this.trackShipment(awb).catch(error => ({
        awbNumber: awb,
        error: error.message
      }))
    );
    
    return await Promise.all(trackingPromises);
  }
}

module.exports = new ShipyaariService();
