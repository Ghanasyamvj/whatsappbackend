const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const flowService = require('../services/flowService');
const patientService = require('../services/patientService');
const doctorService = require('../services/doctorService');
const messageLibraryService = require('../services/messageLibraryService');

// Check-in endpoint: mark booking as arrived and notify patient/doctor
router.post('/:id/checkin', async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { arrivalLocation, checkedInBy } = req.body;

    const booking = await bookingService.markArrived(bookingId, { arrivalLocation, checkedInBy });

    // Notify patient via message (create a message record)
    try {
      const patient = booking.patientId ? await patientService.getPatientById(booking.patientId) : null;
      const doctor = booking.doctorId ? await doctorService.getDoctorById(booking.doctorId) : null;

      const patientMessage = `${patient?.name || 'Patient'}, we've registered your arrival. Please proceed to the reception/desk. Doctor: ${doctor?.name || 'Assigned doctor'}. Room: ${booking.room || 'Please check at reception'}.`;

      await flowService.createMessageWithFlow({
        userPhone: patient?.phoneNumber || null,
        messageType: 'text',
        content: patientMessage,
        isResponse: false
      });

      // Optionally send interactive or WhatsApp via messageLibraryService if preferred
      // if (patient?.phoneNumber) {
      //   const msg = messageLibraryService.getMessageById('msg_patient_arrival');
      //   if (msg) await messageLibraryService.sendLibraryMessage(msg, patient.phoneNumber);
      // }

      // Notify doctor via internal message record
      const doctorMessage = `✅ ${patient?.name || 'Patient'} has checked in for booking ${bookingId}. Please attend to them.`;
      await flowService.createMessageWithFlow({ userPhone: doctor?.phoneNumber || null, messageType: 'text', content: doctorMessage, isResponse: false, doctorId: doctor?.id });
    } catch (notifyErr) {
      console.error('Failed to send notifications after check-in:', notifyErr);
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Error in booking check-in:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
