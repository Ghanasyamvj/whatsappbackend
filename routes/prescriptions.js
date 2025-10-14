const express = require('express');
const { sendTextMessage } = require('../services/whatsappService');
const messageLibraryService = require('../services/messageLibraryService');
const flowService = require('../services/flowService');
// NOTE: do not persist bookings for lab tests; include scheduled time directly in messages

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
        header: '🏥 Prescription Details',
  body: `🩺 *Patient:* ${patientName}\n🆔 *Patient ID:* ${patientId || 'N/A'}\n\n💊 *Medicine:* ${medicineName}\n📋 *Dosage:* ${dosage}\n⏰ *Frequency:* ${frequency}\n📅 *Duration:* ${duration}\n\n⚠️ *Important Instructions:*\n• Take medicine as prescribed\n• Complete the full course\n• Contact doctor if you experience any side effects\n\n_Prescribed on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_`,
  footer: 'For any queries, please contact your healthcare provider.',
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

    // Create a personalized payment message and register a dynamic trigger so
    // when the user clicks Pay Now they see the payment link WITH the prescription summary.
    try {
      // Use a timestamp + small random suffix so created messages/buttons get unique ids
      const ts = Date.now();
      const rnd = Math.random().toString(36).slice(2, 6);
      const confirmMsgId = `msg_order_pres_${ts}_${rnd}`;
      const payMsgId = `msg_payment_pres_${ts}_${rnd}`;
      const payNowButtonId = `btn_prescription_pay_now_${ts}_${rnd}`;
      const doneButtonId = `btn_payment_done_${ts}_${rnd}`;

      // Create a confirmation message for this prescription payment (Order placed -> proceed to pharmacy)
      const confirmMedicineMsg = messageLibraryService.addMessage({
        messageId: confirmMsgId,
        name: 'Order Placed - Prescription',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Order Placed Successfully 🛒',
          body: `Your order has been placed successfully. Please proceed to the pharmacy to collect your medicines for ${medicineName}.`,
          footer: 'Collect medicines at the pharmacy counter',
          buttons: [
            {
              buttonId: 'btn_main_menu',
              title: '🏠 Main Menu',
              triggerId: 'trigger_main_menu',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        }
      });

      // Build personalized payment message with a unique 'payment done' button id so it maps to the confirmation above
      const paymentPayload = {
        messageId: payMsgId,
        name: 'Payment Required - Prescription',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: '💳 Perform Payment',
          body: `Please perform your payment to confirm the prescription:\n\n💊 ${medicineName} - ${dosage} (${frequency})\n📅 Duration: ${duration} days\n\n[Payment Link: https://pay.hospital.com/abc123]`,
          footer: 'Secure payment powered by Razorpay',
          buttons: [
            { buttonId: doneButtonId, title: '✅ Payment Completed', triggerId: `trigger_payment_done_${ts}_${rnd}`, nextAction: 'send_message', targetMessageId: confirmMsgId },
            { buttonId: 'btn_payment_help', title: '❓ Payment Help', triggerId: 'trigger_payment_help', nextAction: 'send_message', targetMessageId: 'msg_payment_support' },
            { buttonId: 'btn_cancel_payment', title: '❌ Cancel', triggerId: 'trigger_cancel_payment', nextAction: 'send_message', targetMessageId: 'msg_welcome_interactive' }
          ]
        }
      };

      // Add the personalized payment message to the in-memory message library so it can be sent on trigger
  const addedPaymentMsg = messageLibraryService.addMessage({ messageId: paymentPayload.messageId, name: paymentPayload.name, type: paymentPayload.type, status: paymentPayload.status, contentPayload: paymentPayload.contentPayload });

      // Register dynamic trigger so clicking the Pay Now button on the prescription
      // sends the personalized payment message we just added. Use a unique Pay Now button id
      // to avoid colliding with global/static triggers.
      const dynamicTriggerPayNow = {
        triggerId: `trigger_pres_pay_now_${ts}_${rnd}`,
        triggerType: 'button_click',
        triggerValue: payNowButtonId,
        nextAction: 'send_message',
        targetId: addedPaymentMsg.messageId,
        messageId: addedPaymentMsg.messageId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Register dynamic trigger so clicking the unique payment-done button in the personalized
      // payment message maps to the final confirmation message.
      const dynamicTriggerDone = {
        triggerId: `trigger_payment_done_${ts}_${rnd}`,
        triggerType: 'button_click',
        triggerValue: doneButtonId,
        nextAction: 'send_message',
        targetId: confirmMedicineMsg.messageId,
        messageId: confirmMedicineMsg.messageId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Update the interactive prescription's Pay Now button to use the unique id and
      // point to the personalized payment message (for clarity in logs / client metadata).
      try {
        if (interactivePrescription && interactivePrescription.contentPayload && interactivePrescription.contentPayload.buttons && interactivePrescription.contentPayload.buttons.length) {
          interactivePrescription.contentPayload.buttons[0].buttonId = payNowButtonId;
          interactivePrescription.contentPayload.buttons[0].triggerId = dynamicTriggerPayNow.triggerId;
          interactivePrescription.contentPayload.buttons[0].targetMessageId = addedPaymentMsg.messageId;
        }
      } catch (e) {
        console.warn('Could not wire unique pay now button id to interactivePrescription:', e?.message || e);
      }

      // Unshift both triggers so they take precedence over global/default triggers.
  // register triggers in order: done, payNow (done checked first)
  messageLibraryService.triggers.unshift(dynamicTriggerDone);
  messageLibraryService.triggers.unshift(dynamicTriggerPayNow);
    } catch (err) {
      console.error('Failed to register personalized payment message/trigger:', err);
    }

    console.log(`📤 Sending interactive prescription to ${formattedPhone} for patient ${patientName}`);

    try {
      const result = await messageLibraryService.sendLibraryMessage(interactivePrescription, formattedPhone);
      console.log('✅ Interactive prescription sent successfully:', result);
      res.json({ success: true, data: { messageId: result.messageId, phoneNumber: formattedPhone, patientName, medicineName, timestamp: result.timestamp }, message: 'Prescription sent successfully via WhatsApp' });
    } catch (err) {
      console.error('❌ Failed to send interactive prescription via WhatsApp:', err?.message || err);
      // Persist the interactive message so it remains inspectable in messages collection
      try {
        await flowService.createMessageWithFlow({ userPhone: formattedPhone, messageType: 'interactive', content: interactivePrescription.contentPayload, isResponse: false });
        console.log('ℹ️ Interactive prescription persisted to messages collection as fallback');
        res.json({ success: true, data: { persisted: true, phoneNumber: formattedPhone }, message: 'Interactive prescription persisted (WhatsApp send failed)' });
      } catch (persistErr) {
        console.error('❌ Failed to persist interactive prescription fallback:', persistErr?.message || persistErr);
        // final fallback: send plain text
        const fallbackMessage = `Prescription for ${patientName}: ${medicineName} - ${dosage} - ${frequency} - ${duration}`;
        try {
          const textResult = await sendTextMessage(formattedPhone, fallbackMessage);
          res.json({ success: true, data: { messageId: textResult.messageId, phoneNumber: formattedPhone, patientName, medicineName, timestamp: textResult.timestamp }, message: 'Prescription sent as text via WhatsApp (final fallback)' });
        } catch (sendErr) {
          console.error('❌ Failed to send final fallback text prescription:', sendErr?.message || sendErr);
          res.status(500).json({ success: false, error: 'Failed to send prescription', details: sendErr?.message || sendErr });
        }
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
      const { atime } = req.body; // Added atime to the destructured request body

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

    // Build interactive lab-test prescription with Pay Now / Pay Later buttons
    const interactiveLabPrescription = {
      messageId: `msg_lab_prescription_${Date.now()}`,
      name: 'Lab Test Prescription - Interactive',
      type: 'interactive_button',
      status: 'published',
      contentPayload: {
        header: '🧪 Lab Test Prescription',
        body: `👤 *Patient:* ${patientName}\n🆔 *Patient ID:* ${patientId || 'N/A'}\n\n🧪 *Test:* ${labTestName}\n${notes ? `📝 *Notes:* ${notes}\n\n` : ''}⚠️ *Instructions:*\n• Please visit the lab for sample collection\n• Fasting may be required for certain tests\n• Carry this prescription and your ID\n\n_Prescribed on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_`,
        footer: 'For any queries, please contact your healthcare provider.',
        buttons: [
          { buttonId: 'btn_lab_pay_now', title: '💳 Pay Now', triggerId: 'trigger_prescription_pay_now', nextAction: 'send_message', targetMessageId: 'msg_payment_link' },
          { buttonId: 'btn_lab_pay_later', title: '⏳ Pay Later', triggerId: 'trigger_prescription_pay_later', nextAction: 'send_message', targetMessageId: 'msg_welcome_interactive' }
        ]
      }
    };

    // Register personalized payment message & dynamic trigger for lab pay now (similar to medicine flow)
    try {
        // Do not persist booking; use provided atime directly in messages
        const confirmLabPayload = {
          header: 'Lab Booking Confirmed ✅',
          body: atime ? `Your lab test booking for ${labTestName} is scheduled on ${new Date(atime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.` : `Your lab test booking for ${labTestName} has been confirmed. Please proceed to the lab at the scheduled time.`,
          footer: 'Thank you for choosing our lab services',
          buttons: [
            {
              buttonId: 'btn_main_menu',
              title: '🏠 Main Menu',
              triggerId: 'trigger_main_menu',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        };

        // Build personalized lab payment message with unique ids (timestamp + random suffix)
        const tsLab = Date.now();
        const rndLab = Math.random().toString(36).slice(2,6);
        const confirmLabMsgId = `msg_order_lab_${tsLab}_${rndLab}`;
        const payMsgLabId = `msg_payment_lab_${tsLab}_${rndLab}`;
  const payNowLabButtonId = `btn_lab_pay_now_${tsLab}_${rndLab}`;
  const doneLabButtonId = `btn_payment_done_${tsLab}_${rndLab}`;
  const paymentPayloadLab = {
    messageId: payMsgLabId,
    name: 'Payment Required - Lab Test',
    type: 'interactive_button',
    status: 'published',
    contentPayload: {
      header: '💳 Perform Payment',
      body: `Please perform your payment to confirm the lab test:\n\n🧪 ${labTestName}\n\n[Payment Link: https://pay.hospital.com/abc123]`,
      footer: 'Secure payment powered by Razorpay',
      buttons: [
        { buttonId: doneLabButtonId, title: '✅ Payment Completed', triggerId: `trigger_payment_done_${tsLab}_${rndLab}`, nextAction: 'send_message', targetMessageId: confirmLabMsgId },
        { buttonId: 'btn_payment_help', title: '❓ Payment Help', triggerId: 'trigger_payment_help', nextAction: 'send_message', targetMessageId: 'msg_payment_support' },
        { buttonId: 'btn_cancel_payment', title: '❌ Cancel', triggerId: 'trigger_cancel_payment', nextAction: 'send_message', targetMessageId: 'msg_welcome_interactive' }
      ]
    }
  };

  // Insert schedule info into messages based on provided atime (no persistence)
  if (atime) {
    try {
      const scheduledText = `\n\n🗓️ Scheduled: ${new Date(atime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
      if (interactiveLabPrescription && interactiveLabPrescription.contentPayload && typeof interactiveLabPrescription.contentPayload.body === 'string') {
        interactiveLabPrescription.contentPayload.body = interactiveLabPrescription.contentPayload.body + scheduledText;
      }
      if (paymentPayloadLab && paymentPayloadLab.contentPayload && typeof paymentPayloadLab.contentPayload.body === 'string') {
        paymentPayloadLab.contentPayload.body = paymentPayloadLab.contentPayload.body + scheduledText;
      }
      // Also add compact scheduled text in footer for visibility
      const scheduledCompact = `Scheduled: ${new Date(atime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
      try {
        if (interactiveLabPrescription && interactiveLabPrescription.contentPayload) {
          interactiveLabPrescription.contentPayload.footer = (interactiveLabPrescription.contentPayload.footer || '') + '\n' + scheduledCompact;
        }
        if (paymentPayloadLab && paymentPayloadLab.contentPayload) {
          paymentPayloadLab.contentPayload.footer = (paymentPayloadLab.contentPayload.footer || '') + '\n' + scheduledCompact;
        }
      } catch (e) {
        console.warn('Could not append compact scheduled info to footer/header:', e?.message || e);
      }
    } catch (e) {
      console.warn('Could not append scheduled details to messages:', e?.message || e);
    }
  }

  // Ensure confirmLabPayload has an explicit messageId and add to library
  const confirmLabMsgEntry = messageLibraryService.addMessage({ messageId: confirmLabMsgId, name: 'Lab Booking Confirmed', type: 'interactive_button', status: 'published', contentPayload: confirmLabPayload });

  const addedPaymentMsgLab = messageLibraryService.addMessage({ messageId: paymentPayloadLab.messageId, name: paymentPayloadLab.name, type: paymentPayloadLab.type, status: paymentPayloadLab.status, contentPayload: paymentPayloadLab.contentPayload });

  const dynamicTriggerPayNowLab = {
    triggerId: `trigger_lab_pay_now_${tsLab}_${rndLab}`,
    triggerType: 'button_click',
    triggerValue: payNowLabButtonId,
    nextAction: 'send_message',
    targetId: addedPaymentMsgLab.messageId,
    messageId: addedPaymentMsgLab.messageId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const dynamicTriggerDoneLab = {
    triggerId: `trigger_payment_done_${tsLab}_${rndLab}`,
    triggerType: 'button_click',
    triggerValue: doneLabButtonId,
    nextAction: 'send_message',
    targetId: confirmLabMsgEntry.messageId,
    messageId: confirmLabMsgEntry.messageId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Wire interactive lab prescription's Pay Now button to unique id/trigger
  try {
    if (interactiveLabPrescription && interactiveLabPrescription.contentPayload && interactiveLabPrescription.contentPayload.buttons && interactiveLabPrescription.contentPayload.buttons.length) {
      interactiveLabPrescription.contentPayload.buttons[0].buttonId = payNowLabButtonId;
      interactiveLabPrescription.contentPayload.buttons[0].triggerId = dynamicTriggerPayNowLab.triggerId;
      interactiveLabPrescription.contentPayload.buttons[0].targetMessageId = addedPaymentMsgLab.messageId;
    }
  } catch (e) {
    console.warn('Could not wire unique pay now button id to interactiveLabPrescription:', e?.message || e);
  }

  // register triggers in order: done, payNow
  messageLibraryService.triggers.unshift(dynamicTriggerDoneLab);
  messageLibraryService.triggers.unshift(dynamicTriggerPayNowLab);
    } catch (err) {
      console.error('Failed to register lab personalized payment message/trigger:', err);
    }

    console.log(`📤 Sending interactive lab prescription to ${formattedPhone} for patient ${patientName}`);
    // Diagnostic logs: show atime and booking details and payloads
    try {
      console.log('ℹ️ send-labtest - received atime:', atime);
      console.log('ℹ️ send-labtest - interactive body preview:', interactiveLabPrescription?.contentPayload?.body?.slice(0, 400));
      console.log('ℹ️ send-labtest - payment body preview:', paymentPayloadLab?.contentPayload?.body?.slice(0, 400));
    } catch (e) {
      console.warn('Could not log diagnostic details for send-labtest:', e?.message || e);
    }

    try {
      const result = await messageLibraryService.sendLibraryMessage(interactiveLabPrescription, formattedPhone);
  console.log('✅ Interactive lab prescription sent successfully:', result);
  res.json({ success: true, data: { messageId: result.messageId, phoneNumber: formattedPhone, patientName, labTestName, timestamp: result.timestamp, scheduledAt: atime || null }, message: 'Lab test prescription sent successfully via WhatsApp' });
    } catch (err) {
      console.error('❌ Failed to send interactive lab prescription via WhatsApp:', err?.message || err);
      try {
        await flowService.createMessageWithFlow({ userPhone: formattedPhone, messageType: 'interactive', content: interactiveLabPrescription.contentPayload, isResponse: false });
        res.json({ success: true, data: { persisted: true, phoneNumber: formattedPhone }, message: 'Interactive lab prescription persisted (WhatsApp send failed)' });
      } catch (persistErr) {
        console.error('❌ Failed to persist interactive lab prescription:', persistErr?.message || persistErr);
        res.status(500).json({ success: false, error: 'Failed to send lab test prescription', details: persistErr?.message || persistErr });
      }
    }

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
