// Test script: create a flow tracking record and simulate a flow response webhook
// Usage: set FIREBASE_SERVICE_ACCOUNT in env (same as for seed script), then run:
// node scripts/test_flow_response.js

const webhookService = require('../services/webhookService');
const flowService = require('../services/flowService');

async function main() {
  try {
    const testPhone = '+15551110001'; // seeded patient phone
  const testFlowId = '2249542565518793';
    const flowToken = `flow_token_test_${Date.now()}`;

    console.log('Creating flow tracking for test...');
    const tracking = await flowService.createFlowTracking({ userPhone: testPhone, flowId: testFlowId, flowToken, status: 'sent' });
    console.log('Created tracking:', tracking);

    // Build a sample nfm_reply object similar to WhatsApp flow response
    const nfm_reply = {
      name: 'Registration Flow',
      response_json: JSON.stringify({ name: 'Automated Test User', email: 'auto@test.local', flow_token: flowToken }),
      body: `Completed flow with token ${flowToken}`
    };

    console.log('Simulating incoming flow response webhook...');
    const result = await webhookService.simulateInteractiveWebhook({ nfm_reply }, testPhone);
    console.log('Simulation result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Test script failed:', err);
    process.exit(1);
  }
}

main();
