const { db } = require('../config/firebase');

class BookingService {
  constructor() {
    this.collection = db.collection('bookings');
  }

  async createBooking({ patientId, doctorId, bookingTime, meta = {} }) {
    try {
      // Normalize bookingTime: accept Date, timestamp, or human string. If parsing fails, fall back to now.
      let bookingDate = null;
      if (!bookingTime) {
        bookingDate = new Date();
      } else if (bookingTime instanceof Date) {
        bookingDate = bookingTime;
      } else {
        try {
          bookingDate = new Date(bookingTime);
          if (isNaN(bookingDate.getTime())) {
            // Try removing emoji and common prefixes like weekday names
            const cleaned = String(bookingTime).replace(/[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            bookingDate = new Date(cleaned);
          }
          if (isNaN(bookingDate.getTime())) {
            console.warn('⚠️  Unable to parse bookingTime, falling back to now for booking. bookingTime:', bookingTime);
            bookingDate = new Date();
          }
        } catch (e) {
          console.warn('⚠️  Error parsing bookingTime, falling back to now:', e.message || e);
          bookingDate = new Date();
        }
      }

      const booking = {
        patientId,
        doctorId,
        bookingTime: bookingDate,
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

  // Pending booking helpers (used for interactive multi-step appointment flow)
  async createPendingBooking(userPhone, { patientId = null, doctorId = null, bookingTime = null, meta = {} } = {}) {
    try {
      // Fetch existing pending to merge meta safely
      let existing = null;
      try {
        const doc = await db.collection('pendingBookings').doc(userPhone).get();
        if (doc && doc.exists) existing = doc.data();
      } catch (e) {
        // ignore read errors, we'll proceed with empty existing
      }

      const existingMeta = (existing && existing.meta) ? existing.meta : {};
      const mergedMeta = Object.assign({}, existingMeta, meta || {});

      // Normalize bookingTime: if it's a Date or ISO-parsable string, store as ISO string
      let normalizedBookingTime = bookingTime;
      try {
        if (bookingTime instanceof Date) {
          normalizedBookingTime = bookingTime.toISOString();
        } else if (typeof bookingTime === 'string') {
          const dt = new Date(bookingTime);
          if (!isNaN(dt.getTime())) normalizedBookingTime = dt.toISOString();
        }
      } catch (e) {
        // leave bookingTime as-is (likely a human label like 'Wed 4:00 PM')
      }

      const payload = { userPhone, patientId, doctorId, bookingTime: normalizedBookingTime, meta: mergedMeta, createdAt: new Date(), updatedAt: new Date() };
      await db.collection('pendingBookings').doc(userPhone).set(payload, { merge: true });
      return payload;
    } catch (error) {
      console.error('Error creating pending booking:', error);
      throw error;
    }
  }

  async getPendingBookingForUser(userPhone) {
    try {
      const doc = await db.collection('pendingBookings').doc(userPhone).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error fetching pending booking:', error);
      throw error;
    }
  }

  async deletePendingBooking(userPhone) {
    try {
      await db.collection('pendingBookings').doc(userPhone).delete();
      return true;
    } catch (error) {
      console.error('Error deleting pending booking:', error);
      throw error;
    }
  }

  // Mark a booking as arrived (patient has checked in at hospital)
  async markArrived(bookingId, { arrivalLocation = null, checkedInBy = null } = {}) {
    try {
      const now = new Date();
      const update = {
        status: 'arrived',
        arrivalTime: now,
        arrivalLocation: arrivalLocation || null,
        checkedInBy: checkedInBy || null,
        updatedAt: now
      };

      await this.collection.doc(bookingId).update(update);
      const doc = await this.collection.doc(bookingId).get();

      // also write bookingId field if missing
      if (!doc.data().bookingId) {
        try { await this.collection.doc(bookingId).update({ bookingId }); } catch (e){}
      }

      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error marking booking arrived:', error);
      throw error;
    }
  }
}

module.exports = new BookingService();
