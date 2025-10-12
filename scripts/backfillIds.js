const admin = require('firebase-admin');

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT (raw JSON) or FIREBASE_SERVICE_ACCOUNT_BASE64');
  try {
    if (raw.trim().startsWith('{')) return JSON.parse(raw);
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT: ' + e.message);
  }
}

async function main() {
  const serviceAccount = loadServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('Backfilling patient documents with patientId field...');
  const pSnap = await db.collection('patients').get();
  for (const doc of pSnap.docs) {
    const data = doc.data();
    if (!data.patientId) {
      console.log('Updating patient', doc.id);
      await db.collection('patients').doc(doc.id).update({ patientId: doc.id });
    }
  }

  console.log('Backfilling doctor documents with doctorId field...');
  const dSnap = await db.collection('doctors').get();
  for (const doc of dSnap.docs) {
    const data = doc.data();
    if (!data.doctorId) {
      console.log('Updating doctor', doc.id);
      await db.collection('doctors').doc(doc.id).update({ doctorId: doc.id });
    }
  }

  console.log('Backfill completed');
}

main().catch(err => { console.error('Backfill failed:', err); process.exit(1); });
