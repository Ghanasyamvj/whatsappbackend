/*
  Seed Firestore with sample data for prototype:
  Collections: doctors, patients, medications, labs, doctorTimings, flows, flowResponses

  Usage (PowerShell):
    $env:FIREBASE_SERVICE_ACCOUNT = Get-Content -Raw 'C:\path\to\serviceAccountKey.json'
    node scripts/seedFirestore.js
*/

const admin = require('firebase-admin')

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT (raw JSON) or FIREBASE_SERVICE_ACCOUNT_BASE64')
  try {
    if (raw.trim().startsWith('{')) return JSON.parse(raw)
    // base64
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch (e) {
    throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT: ' + e.message)
  }
}

async function main() {
  const serviceAccount = loadServiceAccount()
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log('Seeding sample data...')

  // Sample medications
  const medications = [
    { id: 'med_aspirin', name: 'Aspirin', dosage: '75 mg', instructions: 'Once daily' },
    { id: 'med_paracetamol', name: 'Paracetamol', dosage: '500 mg', instructions: 'As needed for pain' }
  ]

  // Sample labs
  const labs = [
    { id: 'lab_cbc', name: 'Complete Blood Count' },
    { id: 'lab_lipid', name: 'Lipid Profile' }
  ]

  // Sample doctors
  const doctors = [
    { name: 'Dr. Emily Smith', phoneNumber: '+15550000001', email: 'emily@hospital.test', specialization: 'Cardiology', experience: 10 },
    { name: 'Dr. Raj Kumar', phoneNumber: '+15550000002', email: 'raj@hospital.test', specialization: 'General Medicine', experience: 8 }
  ]

  // Sample doctor timings (linked by phoneNumber)
  const doctorTimings = [
    { doctorPhone: '+15550000001', day: 'Monday', start: '09:00', end: '17:00' },
    { doctorPhone: '+15550000001', day: 'Wednesday', start: '09:00', end: '17:00' },
    { doctorPhone: '+15550000002', day: 'Tuesday', start: '10:00', end: '16:00' }
  ]

  // Sample patients
  const patients = [
    { name: 'Alice Johnson', phoneNumber: '+15551110001', dob: '1985-04-12', gender: 'female', meds: ['med_aspirin'] },
    { name: 'Bob Singh', phoneNumber: '+15551110002', dob: '1979-09-30', gender: 'male', meds: ['med_paracetamol'] }
  ]

  // Sample flow (simplified)
  const flows = [
    {
      name: 'Appointment Booking',
      category: 'appointment',
      flowJson: {
        id: 'BOOK_APPT',
        steps: [
          { id: 'ASK_SPECIALTY', text: 'Which specialty do you need?' },
          { id: 'ASK_DATE', text: 'Which date works for you?' }
        ]
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ]

  // Write collections (overwrite by id where provided)
  // medications
  for (const m of medications) {
    await db.collection('medications').doc(m.id).set(m)
  }

  // labs
  for (const l of labs) {
    await db.collection('labs').doc(l.id).set(l)
  }

  // doctors
  for (const d of doctors) {
    const ref = db.collection('doctors').doc()
    await ref.set({ ...d, createdAt: admin.firestore.FieldValue.serverTimestamp() })
  }

  // doctorTimings
  for (const t of doctorTimings) {
    await db.collection('doctorTimings').add({ ...t, createdAt: admin.firestore.FieldValue.serverTimestamp() })
  }

  // patients
  for (const p of patients) {
    await db.collection('patients').add({ ...p, createdAt: admin.firestore.FieldValue.serverTimestamp() })
  }

  // flows
  for (const f of flows) {
    await db.collection('flows').add(f)
  }

  console.log('Seeding completed.')
}

main().catch(err => { console.error('Seeding failed:', err); process.exit(1) })
