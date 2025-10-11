const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

function parseServiceAccount() {
  // 1) Full JSON in FIREBASE_SERVICE_ACCOUNT
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (raw) {
    try {
      if (raw.trim().startsWith('{')) return JSON.parse(raw)
      // base64
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    } catch (e) {
      throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT. Ensure it is valid JSON or base64-encoded JSON. ' + e.message)
    }
  }

  // 2) Individual fields (fallback)
  const pkRaw = process.env.FIREBASE_PRIVATE_KEY
  const private_key = pkRaw ? pkRaw.replace(/\\n/g, '\n') : undefined

  if (process.env.FIREBASE_CLIENT_EMAIL && private_key && process.env.FIREBASE_PROJECT_ID) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    }
  }

  return null
}

const serviceAccount = parseServiceAccount()

if (!serviceAccount || typeof serviceAccount.project_id !== 'string') {
  console.error('\n\n[firebase] Invalid or missing Firebase service account.');
  console.error('Make sure FIREBASE_SERVICE_ACCOUNT contains the full JSON or set FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and FIREBASE_PROJECT_ID.');
  throw new Error('Invalid Firebase service account: missing project_id');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  })
}

const db = getFirestore()

module.exports = { admin, db }
