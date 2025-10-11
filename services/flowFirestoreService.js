const admin = require('firebase-admin')

if (!admin.apps.length) {
  // try to initialize if config didn't
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  } catch (e) {
    // ignore here; assume other code initializes admin
  }
}

const db = admin.firestore()

const FLOWS_COL = 'flows'
const RESPONSES_COL = 'flowResponses'

async function createFlow(flowData) {
  const payload = { ...flowData, createdAt: admin.firestore.FieldValue.serverTimestamp() }
  const ref = await db.collection(FLOWS_COL).add(payload)
  return { id: ref.id, ...payload }
}

async function saveFlowResponse(flowId, responseData) {
  const payload = { flowId, ...responseData, createdAt: admin.firestore.FieldValue.serverTimestamp() }
  const ref = await db.collection(RESPONSES_COL).add(payload)
  return { id: ref.id, ...payload }
}

async function getFlows(limit = 50) {
  const snap = await db.collection(FLOWS_COL).orderBy('createdAt', 'desc').limit(limit).get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function getResponsesForFlow(flowId, limit = 100) {
  const snap = await db.collection(RESPONSES_COL).where('flowId', '==', flowId).orderBy('createdAt', 'desc').limit(limit).get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

module.exports = { createFlow, saveFlowResponse, getFlows, getResponsesForFlow }
