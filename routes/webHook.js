const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const shipyaariService = require('../services/shipyariServices');

// Razorpay webhook handler
router.post('/razorpay', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    if (!signature) {
      console.error('❌ Missing webhook signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { event, payload } = req.body;
    console.log(`🔔 Webhook received: ${event} - ${payload.payment?.entity?.id || 'Unknown'}`);

    // Handle different payment events
    switch (event) {
      case 'payment.captured':
        await handlePaymentSuccess(payload.payment.entity);
        break;
        
      case 'payment.failed':
        await handlePaymentFailure(payload.payment.entity);
        break;
        
      case 'payment.authorized':
        await handlePaymentAuthorized(payload.payment.entity);
        break;
        
      default:
        console.log(`ℹ️ Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment
async function handlePaymentSuccess(paymentData) {
  try {
    console.log(`💰 Processing successful payment: ${paymentData.id}`);
    
    // Find order by Razorpay order ID
    const order = await Order.findOne({
      'razorpayDetails.razorpayOrderId': paymentData.order_id
    });

    if (!order) {
      throw new Error(`Order not found for payment: ${paymentData.id}`);
    }

    // Update order with payment details + status history
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        'razorpayDetails.razorpayPaymentId': paymentData.id,
        'razorpayDetails.paymentStatus': 'captured',
        'razorpayDetails.paymentMethod': paymentData.method,
        status: 'paid',
        paidAt: new Date(),
        $push: {
          statusHistory: {
            status: 'paid',
            timestamp: new Date(),
            updatedBy: 'razorpay_webhook',
            notes: `Payment captured: ₹${paymentData.amount / 100} via ${paymentData.method}`
          }
        }
      },
      { new: true }
    );

    console.log(`✅ Payment completed for order: ${order.orderId} - ₹${paymentData.amount / 100}`);

    // Automatic stock deduction for purchased items
    console.log('📦 Deducting stock for purchased items...');
    for (const item of updatedOrder.items) {
      try {
        // Prevent stock from going negative using conditional update
        const stockUpdate = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          {
            $inc: {
              stock: -item.quantity,
              totalSales: item.quantity
            },
            $set: {
              lastStockUpdate: new Date()
            }
          },
          { new: true }
        );

        if (!stockUpdate) {
          console.error(`❌ Failed to update stock for product: ${item.product} (insufficient stock?)`);
          continue;
        }

        console.log(`✅ Stock updated: ${item.title} - Reduced by ${item.quantity}, Remaining: ${stockUpdate.stock}`);

        // Auto-update product status if out of stock
        if (stockUpdate.stock === 0 && stockUpdate.status !== 'out_of_stock') {
          await Product.findByIdAndUpdate(item.product, { status: 'out_of_stock', lastStockUpdate: new Date() });
          console.log(`⚠️ Product ${item.title} is now OUT OF STOCK`);
        }
      } catch (e) {
        console.error(`❌ Error updating stock for product ${item.product}:`, e.message);
      }
    }

    // Automatically create Shipyaari shipment
    await processShipment(updatedOrder);

  } catch (error) {
    console.error('❌ Handle payment success error:', error);
    // Log error but don't throw - webhook should always return 200
  }
}

// Handle payment failure
async function handlePaymentFailure(paymentData) {
  try {
    console.log(`❌ Processing failed payment: ${paymentData.id}`);
    
    const order = await Order.findOne({
      'razorpayDetails.razorpayOrderId': paymentData.order_id
    });

    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        'razorpayDetails.paymentStatus': 'failed',
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Payment failed',
        $push: {
          statusHistory: {
            status: 'cancelled',
            timestamp: new Date(),
            updatedBy: 'razorpay_webhook',
            notes: `Payment failed: ${paymentData.error_description || 'Payment processing failed'}`
          }
        }
      });
      
      console.log(`❌ Payment failed for order: ${order.orderId} - ${paymentData.error_description || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ Handle payment failure error:', error);
  }
}

// Handle payment authorized (but not captured yet)
async function handlePaymentAuthorized(paymentData) {
  try {
    console.log(`🔐 Processing authorized payment: ${paymentData.id}`);
    
    const order = await Order.findOne({
      'razorpayDetails.razorpayOrderId': paymentData.order_id
    });

    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        'razorpayDetails.razorpayPaymentId': paymentData.id,
        'razorpayDetails.paymentStatus': 'authorized',
        'razorpayDetails.paymentMethod': paymentData.method,
        $push: {
          statusHistory: {
            status: 'payment_authorized',
            timestamp: new Date(),
            updatedBy: 'razorpay_webhook',
            notes: `Payment authorized: ₹${paymentData.amount / 100} - Awaiting capture`
          }
        }
      });
      
      console.log(`🔐 Payment authorized for order: ${order.orderId}`);
    }
  } catch (error) {
    console.error('❌ Handle payment authorized error:', error);
  }
}

// Process shipment creation (enhanced)
async function processShipment(order) {
  try {
    console.log(`🚚 Processing shipment for order: ${order.orderId}`);

    // Update order status to processing with status history
    await Order.findByIdAndUpdate(order._id, {
      status: 'processing',
      $push: {
        statusHistory: {
          status: 'processing',
          timestamp: new Date(),
          updatedBy: 'system',
          notes: 'Order processing for shipment creation'
        }
      }
    });

    console.log(`📦 Creating Shipyaari shipment for order: ${order.orderId}`);

    // Create Shipyaari shipment
    const shipmentResult = await shipyaariService.createShipment(order);

    // Update order with shipment details + status history
    await Order.findByIdAndUpdate(order._id, {
      'shipmentDetails.shipmentStatus': 'processing',
      'shipmentDetails.shipyaariOrderId': shipmentResult.shipyaariOrderId,
      'shipmentDetails.awbNumber': shipmentResult.awbNumber,
      'shipmentDetails.courierPartner': shipmentResult.courierPartner,
      'shipmentDetails.trackingUrl': shipmentResult.trackingUrl,
      'shipmentDetails.estimatedDeliveryDate': shipmentResult.estimatedDeliveryDate,
      status: 'shipped',
      shippedAt: new Date(),
      $push: {
        statusHistory: {
          status: 'shipped',
          timestamp: new Date(),
          updatedBy: 'shipyaari_integration',
          notes: `Shipment created - AWB: ${shipmentResult.awbNumber}, Courier: ${shipmentResult.courierPartner}`
        }
      }
    });

    console.log('🎉 Automated shipment created successfully:', {
      orderId: order.orderId,
      awbNumber: shipmentResult.awbNumber,
      courierPartner: shipmentResult.courierPartner,
      trackingUrl: shipmentResult.trackingUrl
    });

  } catch (error) {
    console.error('❌ Process shipment error:', error);
    
    // Update order with shipment error + status history
    await Order.findByIdAndUpdate(order._id, {
      'shipmentDetails.shipmentStatus': 'failed',
      'shipmentDetails.shipmentError': error.message,
      $push: {
        statusHistory: {
          status: 'shipment_failed',
          timestamp: new Date(),
          updatedBy: 'system',
          notes: `Shipment creation failed: ${error.message}`
        }
      }
    });

    // Optionally: Send notification to admin about shipment failure
    console.error(`🚨 ALERT: Shipment failed for order ${order.orderId}:`, error.message);
  }
}

module.exports = router;
