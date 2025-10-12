const { db } = require('../config/firebase');

class DoctorService {
  constructor() {
    this.collection = db.collection('doctors');
  }

  // Create a new doctor
  async createDoctor(doctorData) {
    try {
      const doctor = {
        ...doctorData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isAvailable: true
      };

      const docRef = await this.collection.add(doctor);
      try {
        await this.collection.doc(docRef.id).update({ doctorId: docRef.id });
      } catch (e) {
        console.error('Failed to write doctorId into document:', e);
      }
      return { id: docRef.id, ...doctor };
    } catch (error) {
      console.error('Error creating doctor:', error);
      throw error;
    }
  }

  // Get doctor by ID
  async getDoctorById(doctorId) {
    try {
      const doc = await this.collection.doc(doctorId).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting doctor:', error);
      throw error;
    }
  }

  // Get doctor by phone number
  async getDoctorByPhone(phoneNumber) {
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
      console.error('Error getting doctor by phone:', error);
      throw error;
    }
  }

  // Get doctors by specialization
  async getDoctorsBySpecialization(specialization) {
    try {
      const snapshot = await this.collection
        .where('specialization', '==', specialization)
        .where('isActive', '==', true)
        .where('isAvailable', '==', true)
        .get();

      const doctors = [];
      snapshot.forEach(doc => {
        doctors.push({ id: doc.id, ...doc.data() });
      });

      return doctors;
    } catch (error) {
      console.error('Error getting doctors by specialization:', error);
      throw error;
    }
  }

  // Update doctor
  async updateDoctor(doctorId, updateData) {
    try {
      const updatePayload = {
        ...updateData,
        updatedAt: new Date()
      };

      await this.collection.doc(doctorId).update(updatePayload);
      return await this.getDoctorById(doctorId);
    } catch (error) {
      console.error('Error updating doctor:', error);
      throw error;
    }
  }

  // Get all doctors with pagination
  async getAllDoctors(limit = 50, startAfter = null) {
    try {
      let query = this.collection
        .where('isActive', '==', true)
        .orderBy('name')
        .limit(limit);

      if (startAfter) {
        query = query.startAfter(startAfter);
      }

      const snapshot = await query.get();
      const doctors = [];

      snapshot.forEach(doc => {
        doctors.push({ id: doc.id, ...doc.data() });
      });

      return doctors;
    } catch (error) {
      console.error('Error getting all doctors:', error);
      throw error;
    }
  }

  // Get available doctors
  async getAvailableDoctors() {
    try {
      const snapshot = await this.collection
        .where('isActive', '==', true)
        .where('isAvailable', '==', true)
        .orderBy('name')
        .get();

      const doctors = [];
      snapshot.forEach(doc => {
        doctors.push({ id: doc.id, ...doc.data() });
      });

      return doctors;
    } catch (error) {
      console.error('Error getting available doctors:', error);
      throw error;
    }
  }

  // Set doctor availability
  async setDoctorAvailability(doctorId, isAvailable) {
    try {
      await this.updateDoctor(doctorId, { isAvailable });
      return await this.getDoctorById(doctorId);
    } catch (error) {
      console.error('Error setting doctor availability:', error);
      throw error;
    }
  }

  // Add schedule for doctor
  async addSchedule(doctorId, scheduleData) {
    try {
      const doctor = await this.getDoctorById(doctorId);
      if (!doctor) {
        throw new Error('Doctor not found');
      }

      const schedule = doctor.schedule || [];
      schedule.push({
        ...scheduleData,
        id: Date.now().toString(),
        createdAt: new Date()
      });

      await this.updateDoctor(doctorId, { schedule });
      return schedule;
    } catch (error) {
      console.error('Error adding doctor schedule:', error);
      throw error;
    }
  }

  // Soft delete doctor
  async deleteDoctor(doctorId) {
    try {
      await this.collection.doc(doctorId).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });
      return true;
    } catch (error) {
      console.error('Error deleting doctor:', error);
      throw error;
    }
  }
}

module.exports = new DoctorService();
