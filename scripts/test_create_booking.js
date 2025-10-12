const webhookService = require('../services/webhookService');

async function main() {
  const testPhone = '+15551110001';
  const formData = {
    specialization: 'General Medicine',
    name: 'Test Patient',
    date: new Date().toISOString()
  };

  try {
    const result = await webhookService.processAppointmentFlow(formData, testPhone);
    console.log('processAppointmentFlow returned:', result);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

main();
