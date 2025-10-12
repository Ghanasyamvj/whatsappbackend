const { db } = require('../config/firebase');

class BookingService {
  constructor() {
    this.collection = db.collection('bookings');
  }

  async createBooking({ patientId, doctorId, bookingTime, meta = {} }) {
    try {
      const booking = {
        patientId,
        doctorId,
        bookingTime: bookingTime ? new Date(bookingTime) : new Date(),
        status: 'scheduled',
        meta,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await this.collection.add(booking);
      // Write bookingId into the document
      try {
        await this.collection.doc(docRef.id).update({ bookingId: docRef.id });
      } catch (e) {
        console.error('Failed to write bookingId into document:', e);
      }

      return { id: docRef.id, ...booking };
    } catch (error) {
      console.error('Error creating booking:', error);
      throw error;
    }
  }

  async getBookingById(bookingId) {
    try {
      const doc = await this.collection.doc(bookingId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting booking:', error);
      throw error;
    }
  }

  async updateBooking(bookingId, updateData) {
    try {
      const payload = { ...updateData, updatedAt: new Date() };
      await this.collection.doc(bookingId).update(payload);
      return await this.getBookingById(bookingId);
    } catch (error) {
      console.error('Error updating booking:', error);
      throw error;
    }
  }

  async getBookingsForPatient(patientId) {
    try {
      const snaps = await this.collection.where('patientId', '==', patientId).get();
      const bookings = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
      return bookings;
    } catch (error) {
      console.error('Error listing bookings for patient:', error);
      throw error;
    }
  }
}

module.exports = new BookingService();
