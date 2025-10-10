#!/usr/bin/env node

const { seedDatabase } = require('../utils/seedData');
const { admin } = require('../config/firebase');

async function setupSystem() {
  console.log('🏥 WhatsApp Hospital Backend Setup');
  console.log('=====================================\n');

  try {
    // Check Firebase connection
    console.log('🔥 Testing Firebase connection...');
    const db = admin.firestore();
    await db.collection('_test').doc('connection').set({
      timestamp: new Date(),
      status: 'connected'
    });
    await db.collection('_test').doc('connection').delete();
    console.log('✅ Firebase connection successful\n');

    // Seed database with sample data
    console.log('🌱 Seeding database with sample data...');
    await seedDatabase();
    console.log('✅ Database seeding completed\n');

    // Display setup summary
    console.log('🎉 Setup completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Configure your WhatsApp Business API credentials in .env');
    console.log('2. Start the server: npm start');
    console.log('3. Test the webhook endpoints');
    console.log('4. Create your custom flows in the flow builder');
    console.log('\n📚 Available API Endpoints:');
    console.log('• Patients: /api/patients');
    console.log('• Doctors: /api/doctors');
    console.log('• Flows: /api/flows');
    console.log('• Message Library: /api/message-library');
    console.log('• Webhook: /webhook');
    console.log('\n📖 Documentation:');
    console.log('• Firebase Setup: FIREBASE_SETUP.md');
    console.log('• Interactive Messages: INTERACTIVE_MESSAGES_README.md');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your Firebase configuration in .env');
    console.log('2. Ensure Firebase Admin SDK is properly initialized');
    console.log('3. Verify network connectivity');
    console.log('4. Check Firebase project permissions');
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupSystem()
    .then(() => {
      console.log('\n✅ Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupSystem };
