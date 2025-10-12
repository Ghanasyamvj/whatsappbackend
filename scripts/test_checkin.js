const bookingService = require('../services/bookingService');

async function main() {
  try {
    const bookingId = process.argv[2] || 'e4B7Gz9C2Iav4pNW1SUQ';
    const result = await bookingService.markArrived(bookingId, { arrivalLocation: 'Main Gate', checkedInBy: 'receptionist-1' });
    console.log('Check-in result:', result);
  } catch (err) {
    console.error('Test check-in failed:', err);
  }
}

main();
