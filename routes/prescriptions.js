const express = require('express');
const { sendTextMessage } = require('../services/whatsappService');
const messageLibraryService = require('../services/messageLibraryService');

const router = express.Router();

/**
 * Send prescription via WhatsApp
 * POST /api/prescriptions/send
 */
router.post('/send', async (req, res) => {
  try {
    const { 
      phoneNumber, 
      patientName, 
      patientId,
      medicineName,
      dosage, 
      frequency, 
      duration 
    } = req.body;

    // Validate required fields
    if (!phoneNumber || !patientName || !medicineName || !dosage || !frequency || !duration) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phoneNumber', 'patientName', 'medicineName', 'dosage', 'frequency', 'duration']
      });
    }

    // Format phone number (ensure it has country code)
    let formattedPhone = phoneNumber.replace(/\D/g, ''); // Remove non-digits
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone; // Add India country code if missing
    }

    // Build interactive prescription message with Pay Now / Pay Later buttons
    const interactivePrescription = {
      messageId: `msg_prescription_${Date.now()}`,
      name: 'Prescription - Interactive',
      type: 'interactive_button',
      status: 'published',
      contentPayload: {
        header: '� Prescription Details',
        body: `👤 ${patientName}\n💊 ${medicineName}\n📋 ${dosage}\n⏰ ${frequency}\n📅 ${duration}\n\n_Prescribed on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_`,
        footer: 'Tap Pay Now to complete payment or Pay Later to return to home',
        buttons: [
          {
            buttonId: 'btn_prescription_pay_now',
            title: '💳 Pay Now',
            triggerId: 'trigger_prescription_pay_now',
            nextAction: 'send_message',
            targetMessageId: 'msg_payment_link'
          },
          {
            buttonId: 'btn_prescription_pay_later',
            title: '⏳ Pay Later',
            triggerId: 'trigger_prescription_pay_later',
            nextAction: 'send_message',
            targetMessageId: 'msg_welcome_interactive'
          }
        ]
      }
    };

    console.log(`📤 Sending interactive prescription to ${formattedPhone} for patient ${patientName}`);

    try {
      const result = await messageLibraryService.sendLibraryMessage(interactivePrescription, formattedPhone);
      console.log('✅ Interactive prescription sent successfully:', result);
      res.json({ success: true, data: { messageId: result.messageId, phoneNumber: formattedPhone, patientName, medicineName, timestamp: result.timestamp }, message: 'Prescription sent successfully via WhatsApp' });
    } catch (err) {
      console.error('❌ Failed to send interactive prescription via WhatsApp, falling back to text:', err?.message || err);
      // fallback to sending plain text
      const fallbackMessage = `Prescription for ${patientName}: ${medicineName} - ${dosage} - ${frequency} - ${duration}`;
      try {
        const textResult = await sendTextMessage(formattedPhone, fallbackMessage);
        res.json({ success: true, data: { messageId: textResult.messageId, phoneNumber: formattedPhone, patientName, medicineName, timestamp: textResult.timestamp }, message: 'Prescription sent as text via WhatsApp (fallback)' });
      } catch (sendErr) {
        console.error('❌ Failed to send fallback text prescription:', sendErr?.message || sendErr);
        res.status(500).json({ success: false, error: 'Failed to send prescription', details: sendErr?.message || sendErr });
      }
    }

  } catch (error) {
    console.error('❌ Error sending prescription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send prescription',
      details: error.message
    });
  }
});

/**
 * Send lab test prescription via WhatsApp
 * POST /api/prescriptions/send-labtest
 */
router.post('/send-labtest', async (req, res) => {
  try {
    const { 
      phoneNumber, 
      patientName, 
      patientId,
      labTestName,
      notes 
    } = req.body;

    // Validate required fields
    if (!phoneNumber || !patientName || !labTestName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phoneNumber', 'patientName', 'labTestName']
      });
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    // Create lab test message
    const labTestMessage = `
🏥 *Lab Test Prescription*

👤 *Patient:* ${patientName}
🆔 *Patient ID:* ${patientId || 'N/A'}

🧪 *Lab Test:* ${labTestName}
${notes ? `📝 *Notes:* ${notes}` : ''}

⚠️ *Instructions:*
- Please visit the lab for sample collection
- Fasting may be required for certain tests
- Carry this prescription and your ID

_Prescribed on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_

For any queries, please contact your healthcare provider.
    `.trim();

    console.log(`📤 Sending lab test prescription to ${formattedPhone} for patient ${patientName}`);

    const result = await sendTextMessage(formattedPhone, labTestMessage);

    console.log('✅ Lab test prescription sent successfully:', result);

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        phoneNumber: formattedPhone,
        patientName,
        labTestName,
        timestamp: result.timestamp
      },
      message: 'Lab test prescription sent successfully via WhatsApp'
    });

  } catch (error) {
    console.error('❌ Error sending lab test prescription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send lab test prescription',
      details: error.message
    });
  }
});

/**
 * Send follow-up reminder via WhatsApp
 * POST /api/prescriptions/send-followup
 */
router.post('/send-followup', async (req, res) => {
  try {
    const { 
      phoneNumber, 
      patientName, 
      patientId,
      followUpType,
      followUpValue,
      notes 
    } = req.body;

    // Validate required fields
    if (!phoneNumber || !patientName || !followUpType || !followUpValue) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phoneNumber', 'patientName', 'followUpType', 'followUpValue']
      });
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    // Calculate follow-up date
    const followUpDate = new Date();
    if (followUpType === 'days') {
      followUpDate.setDate(followUpDate.getDate() + parseInt(followUpValue));
    } else if (followUpType === 'weeks') {
      followUpDate.setDate(followUpDate.getDate() + (parseInt(followUpValue) * 7));
    }

    // Create follow-up message
    const followUpMessage = `
🏥 *Follow-Up Appointment Reminder*

👤 *Patient:* ${patientName}
🆔 *Patient ID:* ${patientId || 'N/A'}

📅 *Follow-up scheduled in:* ${followUpValue} ${followUpType}
📆 *Approximate Date:* ${followUpDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
${notes ? `📝 *Notes:* ${notes}` : ''}

⚠️ *Reminder:*
- Please schedule your appointment
- Bring previous prescriptions and reports
- Contact us to confirm your appointment

_Scheduled on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_

For appointment booking, please contact your healthcare provider.
    `.trim();

    console.log(`📤 Sending follow-up reminder to ${formattedPhone} for patient ${patientName}`);

    const result = await sendTextMessage(formattedPhone, followUpMessage);

    console.log('✅ Follow-up reminder sent successfully:', result);

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        phoneNumber: formattedPhone,
        patientName,
        followUpDate: followUpDate.toISOString(),
        timestamp: result.timestamp
      },
      message: 'Follow-up reminder sent successfully via WhatsApp'
    });

  } catch (error) {
    console.error('❌ Error sending follow-up reminder:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send follow-up reminder',
      details: error.message
    });
  }
});

module.exports = router;
