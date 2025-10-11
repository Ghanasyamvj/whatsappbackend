const { db } = require('../config/firebase');

class PatientService {
  constructor() {
    this.collection = db.collection('patients');
    this.auditCollection = db.collection('patientAudits');
  }

  // Create a new patient
  async createPatient(patientData) {
    try {
      const patient = {
        ...patientData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      const docRef = await this.collection.add(patient);
      console.info('Created patient', { id: docRef.id, phoneNumber: patient.phoneNumber, timestamp: new Date().toISOString() });
      // Write audit record
      try {
        await this.auditCollection.add({
          action: 'create',
          patientId: docRef.id,
          data: patient,
          timestamp: new Date()
        });
      } catch (auditErr) {
        console.error('Failed to write patient create audit:', auditErr);
      }

      return { id: docRef.id, ...patient };
    } catch (error) {
      console.error('Error creating patient:', error);
      throw error;
    }
  }

  // Get patient by ID
  async getPatientById(patientId) {
    try {
      const doc = await this.collection.doc(patientId).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting patient:', error);
      throw error;
    }
  }

  // Get patient by phone number
  async getPatientByPhone(phoneNumber) {
    try {
      // Try exact match first
      const snapshot = await this.collection
        .where('phoneNumber', '==', phoneNumber)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      // Fallback: normalize digits and compare last 10 digits (helps when formats differ)
      const digits = (phoneNumber || '').replace(/\D/g, '');
      const last10 = digits.slice(-10);

      if (!last10) return null;

      const allSnapshot = await this.collection.where('isActive', '==', true).get();
      for (const d of allSnapshot.docs) {
        const p = d.data();
        const pDigits = (p.phoneNumber || '').toString().replace(/\D/g, '');
        if (pDigits.slice(-10) === last10) {
          return { id: d.id, ...p };
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting patient by phone:', error);
      throw error;
    }
  }

  // Update patient
  async updatePatient(patientId, updateData) {
    try {
      const updatePayload = {
        ...updateData,
        updatedAt: new Date()
      };

      console.info('Updating patient', { id: patientId, changes: Object.keys(updateData), timestamp: new Date().toISOString() });
      // Fetch existing for audit
      let before = null;
      try {
        const beforeDoc = await this.collection.doc(patientId).get();
        if (beforeDoc.exists) before = beforeDoc.data();
      } catch (e) {
        console.error('Failed to read patient before update for audit:', e);
      }

      await this.collection.doc(patientId).update(updatePayload);

      try {
        await this.auditCollection.add({
          action: 'update',
          patientId,
          before,
          after: updatePayload,
          timestamp: new Date()
        });
      } catch (auditErr) {
        console.error('Failed to write patient update audit:', auditErr);
      }

      return await this.getPatientById(patientId);
    } catch (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  }

  // Get all patients with pagination
  async getAllPatients(limit = 50, startAfter = null) {
    try {
      let query = this.collection
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (startAfter) {
        query = query.startAfter(startAfter);
      }

      const snapshot = await query.get();
      const patients = [];

      snapshot.forEach(doc => {
        patients.push({ id: doc.id, ...doc.data() });
      });

      return patients;
    } catch (error) {
      console.error('Error getting all patients:', error);
      throw error;
    }
  }

  // Search patients by name
  async searchPatientsByName(searchTerm) {
    try {
      const snapshot = await this.collection
        .where('isActive', '==', true)
        .orderBy('name')
        .startAt(searchTerm)
        .endAt(searchTerm + '\uf8ff')
        .limit(20)
        .get();

      const patients = [];
      snapshot.forEach(doc => {
        patients.push({ id: doc.id, ...doc.data() });
      });

      return patients;
    } catch (error) {
      console.error('Error searching patients:', error);
      throw error;
    }
  }

  // Soft delete patient
  async deletePatient(patientId) {
    try {
      console.warn('Soft-deleting patient', { id: patientId, timestamp: new Date().toISOString() });
      // For audit, capture current record
      let before = null;
      try {
        const beforeDoc = await this.collection.doc(patientId).get();
        if (beforeDoc.exists) before = beforeDoc.data();
      } catch (e) {
        console.error('Failed to read patient before delete for audit:', e);
      }

      await this.collection.doc(patientId).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });

      try {
        await this.auditCollection.add({
          action: 'delete',
          patientId,
          before,
          timestamp: new Date()
        });
      } catch (auditErr) {
        console.error('Failed to write patient delete audit:', auditErr);
      }

      return true;
    } catch (error) {
      console.error('Error deleting patient:', error);
      throw error;
    }
  }

  // Add medical history entry
  async addMedicalHistory(patientId, historyEntry) {
    try {
      const patient = await this.getPatientById(patientId);
      if (!patient) {
        throw new Error('Patient not found');
      }

      const medicalHistory = patient.medicalHistory || [];
      medicalHistory.push({
        ...historyEntry,
        timestamp: new Date(),
        id: Date.now().toString()
      });

      await this.updatePatient(patientId, { medicalHistory });
      return medicalHistory;
    } catch (error) {
      console.error('Error adding medical history:', error);
      throw error;
    }
  }
}

module.exports = new PatientService();
