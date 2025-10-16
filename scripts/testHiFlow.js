/**
 * Test script to verify "Hi" flow functionality
 */

const webhookService = require('../services/webhookService');

async function testHiFlow() {
  console.log('🧪 Testing "Hi" flow functionality...\n');
  
  // Simulate a WhatsApp webhook message with "Hi"
  const testWebhookData = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test_entry',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550617327',
            phone_number_id: '158282837372377'
          },
          messages: [{
            id: `test-hi-${Date.now()}`,
            from: '+1234567890', // Test phone number
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: {
              body: 'Hi'
            },
            type: 'text'
          }]
        },
        field: 'messages'
      }]
    }]
  };

  try {
    console.log('📤 Sending test "Hi" message from +1234567890');
    console.log('Expected behavior:');
    console.log('1. Check if +1234567890 exists in Firebase patients');
    console.log('2. If not found → Send WhatsApp flow 737535792667128');
    console.log('3. If found → Send welcome interactive message\n');
    
    await webhookService.handleWebhook(testWebhookData);
    console.log('✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('Firebase')) {
      console.log('\n💡 Tip: Make sure your Firebase credentials are configured in .env file');
    }
    
    if (error.message.includes('WhatsApp')) {
      console.log('\n💡 Tip: Make sure your WhatsApp credentials are configured in .env file');
    }
  }
}

// Run test
if (require.main === module) {
  testHiFlow()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test script error:', error);
      process.exit(1);
    });
}

module.exports = { testHiFlow };
