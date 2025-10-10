const { db } = require('../config/firebase');

class PatientService {
  constructor() {
    this.collection = db.collection('patients');
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
      const snapshot = await this.collection
        .where('phoneNumber', '==', phoneNumber)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
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

      await this.collection.doc(patientId).update(updatePayload);
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
      await this.collection.doc(patientId).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });
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
