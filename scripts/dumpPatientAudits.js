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

  console.log('Fetching recent patient audits (last 100)...');
  const snaps = await db.collection('patientAudits').orderBy('timestamp', 'desc').limit(100).get();
  if (snaps.empty) {
    console.log('No audit records found.');
    return;
  }

  for (const doc of snaps.docs) {
    const d = doc.data();
    console.log('---');
    console.log('id:', doc.id);
    console.log('action:', d.action);
    console.log('patientId:', d.patientId);
    if (d.data && d.data.phoneNumber) console.log('phone:', d.data.phoneNumber);
    if (d.before && d.before.phoneNumber) console.log('beforePhone:', d.before.phoneNumber);
    if (d.after && d.after.phoneNumber) console.log('afterPhone:', d.after.phoneNumber);
    console.log('timestamp:', d.timestamp && d.timestamp.toDate ? d.timestamp.toDate().toISOString() : d.timestamp);
  }
}

main().catch(err => { console.error('Failed to dump audits:', err); process.exit(1); });
