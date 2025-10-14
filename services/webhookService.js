const { sendFlowMessage } = require('./whatsappService');
const flowService = require('./flowService');
const { findMatchingTrigger } = require('./triggerService');
const messageLibraryService = require('./messageLibraryService');
const patientService = require('./patientService');
const doctorService = require('./doctorService');
const bookingService = require('./bookingService');

// Helper: build and send (or persist) an interactive list of current bookings for a phone
async function sendBookingSelectionList(phone) {
  try {
    const patient = await patientService.getPatientByPhone(phone);
    if (!patient) {
      // Prompt to select existing patient or register
      const msg = messageLibraryService.getMessageById('msg_existing_patient_select');
      if (msg) {
        try { await messageLibraryService.sendLibraryMessage(msg, phone); } catch(e){ console.error('Failed to send existing-patient selection message', e); await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'interactive', content: msg.contentPayload, isResponse: false }); }
      }
      return;
    }

    // Find scheduled bookings for this patient
    const snaps = await require('../config/firebase').db.collection('bookings').where('patientId', '==', patient.id).where('status', '==', 'scheduled').get();
    const candidates = [];
    const now = new Date();
    const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    snaps.forEach(d => {
      const b = d.data();
      const bt = (b.bookingTime && b.bookingTime.toDate) ? b.bookingTime.toDate() : new Date(b.bookingTime);
      if (bt >= windowStart && bt <= windowEnd) {
        candidates.push({ id: d.id, ...b, bookingTimeObj: bt });
      }
    });

    // If none in window, include all scheduled and pick soonest
    if (candidates.length === 0) {
      snaps.forEach(d => {
        const b = d.data();
        const bt = (b.bookingTime && b.bookingTime.toDate) ? b.bookingTime.toDate() : new Date(b.bookingTime);
        candidates.push({ id: d.id, ...b, bookingTimeObj: bt });
      });
    }

    if (candidates.length === 0) {
      // No bookings found
      try {
        await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'We could not find any upcoming bookings for you. Please check at reception.' } }, phone);
      } catch (sendErr) {
        console.error('Failed to send WhatsApp message, saving message record instead:', sendErr?.message || sendErr);
        await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'text', content: 'We could not find any upcoming bookings for you. Please check at reception.', isResponse: false });
      }
      return;
    }

    // Build list rows and register selection triggers
    const rows = [];
    const truncate = (s, n) => {
      if (!s) return '';
      const str = String(s);
      if (str.length <= n) return str;
      return str.slice(0, Math.max(0, n - 1)) + '…';
    };

    for (const c of candidates) {
      const doctor = c.doctorId ? await doctorService.getDoctorById(c.doctorId) : null;
  // Build a compact title (doctor name + slot title) and truncate to WhatsApp list title limit (24 chars)
  const doctorName = (c.meta && c.meta.doctorName) ? c.meta.doctorName : (doctor?.name || 'Doctor');
  const slotTitle = (c.meta && c.meta.slotTitle) ? c.meta.slotTitle : (c.bookingTimeObj ? c.bookingTimeObj.toLocaleString() : '');
  const rawTitle = `${doctorName} — ${slotTitle}`;
      const safeTitle = truncate(rawTitle, 24);
  const safeDesc = `${doctorName} · ${slotTitle}`;
  rows.push({ rowId: c.id, title: safeTitle, description: safeDesc, triggerId: `trigger_booking_${c.id}` });
      // register a list-selection trigger for this booking if not exists
      const existing = messageLibraryService.triggers.find(t => t.triggerType === 'list_selection' && t.triggerValue === c.id);
      if (!existing) {
        messageLibraryService.addTrigger({ triggerId: `trigger_booking_${c.id}`, triggerType: 'list_selection', triggerValue: c.id, nextAction: 'mark_arrived_selected', targetId: c.id, messageId: null });
      }
    }

    const listMessage = {
      messageId: `msg_booking_select_${Date.now()}`,
      name: 'Select Booking to Check-in',
      type: 'interactive_list',
      status: 'published',
      contentPayload: {
        header: 'Which booking are you checking in for?',
        body: 'Select the booking you have arrived for:',
        footer: 'Choose from the list',
        buttonText: 'Select Booking',
        sections: [{ title: 'Upcoming bookings', rows }]
      }
    };

    try {
      await messageLibraryService.sendLibraryMessage(listMessage, phone);
    } catch (sendErr) {
      console.error('Failed to send interactive list via WhatsApp, saving message record instead:', sendErr?.message || sendErr);
      await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'interactive', content: listMessage.contentPayload, isResponse: false });
    }
  } catch (err) {
    console.error('❌ Failed to handle mark_arrived:', err);
    try { await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'Sorry, we could not process your check-in. Please try at reception.' } }, phone); } catch(e){ await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'text', content: 'Sorry, we could not process your check-in. Please try at reception.', isResponse: false }); }
  }
}

/**
 * Process incoming webhook payload from WhatsApp Business API
 */
async function processWebhookPayload(payload) {

  if (payload.object !== 'whatsapp_business_account') {
    console.log('📝 Not a WhatsApp Business webhook, ignoring');
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field === 'messages' && change.value.messages) {
        for (const message of change.value.messages) {
          await handleIncomingMessage(message);
        }
      }

      // Handle message status updates (delivery, read, etc.)
      if (change.field === 'messages' && change.value.statuses) {
        for (const status of change.value.statuses) {
          handleMessageStatus(status);
        }
      }
    }
  }
}

/**
 * Handle individual incoming messages
 */
async function handleIncomingMessage(message) {
  try {
    console.log(`📱 Processing message from ${message.from}:`, message);

    let messageText = '';
    
    // Extract message text based on message type
    if (message.type === 'text' && message.text) {
      messageText = message.text.body.toLowerCase().trim();
    } else if (message.type === 'interactive') {
      // Handle interactive messages (buttons, lists, flows)
      if (message.interactive.nfm_reply) {
        // Handle flow responses
        await handleFlowResponse(message);
        return;
      } else if (message.interactive.button_reply || message.interactive.list_reply) {
        // Handle button clicks and list selections
        await handleInteractiveResponse(message);
        return;
      }
    } else {
      console.log(`📝 Message type '${message.type}' not supported for triggers`);
      return;
    }

    console.log(`💬 Message text: "${messageText}"`);

    // NEW: Use Message Library instead of old trigger system
    const matchingTriggers = messageLibraryService.findMatchingTriggers(messageText);
    
    if (matchingTriggers.length > 0) {
      console.log(`🎯 Found ${matchingTriggers.length} matching trigger(s)`);
      // Special-case: if one of the matching triggers is the "hi"/welcome trigger,
      // check Firestore for an existing patient by phone and send the appropriate
      // welcome or new-patient message instead of the default library flow.
      const hasHiTrigger = matchingTriggers.some(t => t.triggerId === 'trigger_hi');
      if (hasHiTrigger) {
        try {
          const patient = await patientService.getPatientByPhone(message.from).catch(() => null);
          if (patient) {
            console.log('ℹ️ Existing patient found for phone, sending welcome interactive');
            const welcomeMsg = messageLibraryService.getMessageById('msg_welcome_interactive');
            if (welcomeMsg) {
              try {
                await messageLibraryService.sendLibraryMessage(welcomeMsg, message.from);
                console.log('✅ Welcome interactive sent');
              } catch (err) {
                console.error('Failed to send welcome interactive, persisting message instead:', err?.message || err);
                await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'interactive', content: welcomeMsg.contentPayload, isResponse: false });
              }
            } else {
              console.log('⚠️ msg_welcome_interactive not found in library');
            }
          } else {
            // Start the registration flow instead of sending the static form text
            const registrationFlowId = '1366099374850695';
            console.log('ℹ️ No patient found for phone, starting registration flow:', registrationFlowId);
            const flowToken = `flow_token_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            try {
              await flowService.createFlowTracking({ userPhone: message.from, flowId: registrationFlowId, flowToken, status: 'sent' });
              await sendFlowMessage(message.from, registrationFlowId, 'Please complete this registration form:', flowToken);
              console.log('✅ Registration flow started for', message.from);
            } catch (err) {
              console.error('Failed to start registration flow, falling back to sending/persisting form text:', err?.message || err);
              const newPatientMsg = messageLibraryService.getMessageById('msg_new_patient_form') || messageLibraryService.getMessageById('msg_new_or_existing');
              if (newPatientMsg) {
                try {
                  await messageLibraryService.sendLibraryMessage(newPatientMsg, message.from);
                  console.log('✅ Fallback: New patient form sent');
                } catch (sendErr) {
                  console.error('Fallback send failed, persisting message instead:', sendErr?.message || sendErr);
                  if (newPatientMsg.type === 'standard_text') {
                    await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: newPatientMsg.contentPayload.body, isResponse: false });
                  } else {
                    await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'interactive', content: newPatientMsg.contentPayload, isResponse: false });
                  }
                }
              } else {
                console.log('⚠️ msg_new_patient_form not found in library for fallback');
              }
            }
          }
        } catch (err) {
          console.error('Error during hi-trigger patient lookup:', err);
        }
        // We've handled the hi trigger explicitly; do not continue with the generic loop
        return;
      }

        for (const trigger of matchingTriggers) {
          if (trigger.nextAction === 'send_message') {
          // Get the message from library
          const messageEntry = messageLibraryService.getMessageById(trigger.targetId);
          
          if (messageEntry && messageEntry.status === 'published') {
            console.log(`📤 Sending library message: "${messageEntry.name}" to ${message.from}`);
            
            try {
              await messageLibraryService.sendLibraryMessage(messageEntry, message.from);
              console.log(`✅ Successfully sent message "${messageEntry.name}" to ${message.from}`);
            } catch (error) {
              console.error(`❌ Failed to send message "${messageEntry.name}":`, error.message);
            }
          } else {
            console.log(`⚠️  Message ${trigger.targetId} not found or not published`);
          }
  } else if (trigger.nextAction === 'start_flow') {
          // Start a tracked flow: create a tracking record, then send flow with token
          try {
            console.log(`🔄 Starting tracked flow: ${trigger.targetId}`);
            const flowToken = `flow_token_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            // create tracking record
            await flowService.createFlowTracking({
              userPhone: message.from,
              flowId: trigger.targetId,
              flowToken,
              status: 'sent'
            });
            // send flow with token
            await sendFlowMessage(message.from, trigger.targetId, 'Please complete this form:', flowToken);
          } catch (err) {
            console.error('❌ Failed to start tracked flow:', err.message || err);
          }
        } else if (trigger.nextAction === 'mark_arrived') {
          try {
            console.log('🔔 Trigger requests mark_arrived for', message.from);
            await sendBookingSelectionList(message.from);
          } catch (err) {
            console.error('Error handling mark_arrived trigger:', err);
          }
        }
      }
    } else {
      console.log(`📝 No matching triggers found for message: "${messageText}"`);
      
      // Fallback to old trigger system for backward compatibility
      const oldTrigger = findMatchingTrigger(messageText);
      if (oldTrigger && oldTrigger.isActive) {
        console.log(`🔄 Using legacy trigger: "${oldTrigger.keyword}" -> Flow: ${oldTrigger.flowId}`);
        const flowToken = `flow_token_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        try {
          await flowService.createFlowTracking({ userPhone: message.from, flowId: oldTrigger.flowId, flowToken, status: 'sent' });
          await sendFlowMessage(message.from, oldTrigger.flowId, oldTrigger.message, flowToken);
          console.log(`✅ Successfully sent legacy flow ${oldTrigger.flowId} to ${message.from}`);
        } catch (err) {
          console.error('❌ Failed to send legacy tracked flow:', err.message || err);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling incoming message:', error);
    throw error;
  }
}

/**
 * Handle interactive message responses (buttons and lists)
 */
async function handleInteractiveResponse(message) {
  try {
    console.log(`🔘 Processing interactive response from ${message.from}:`, message.interactive);

    // Persist raw interactive webhook for debugging (so we can inspect button/list ids)
    try {
      await flowService.createWebhookMessage({ rawMessage: message });
      console.log('📥 Raw interactive webhook persisted for debugging');
    } catch (err) {
      console.error('⚠️ Failed to persist raw interactive webhook:', err.message || err);
    }

    // Log raw reply ids for quick diagnostics
    try {
      const rawButtonId = message.interactive?.button_reply?.id || null;
      const rawListId = message.interactive?.list_reply?.id || null;
      console.log('🔎 Raw interactive ids:', { rawButtonId, rawListId });
    } catch (err) {
      // ignore
    }
    // Proactively create pending booking entries from raw interactive replies so Confirm & Pay can finalize
    try {
      const rawButtonId2 = message.interactive?.button_reply?.id || null;
      const rawListId2 = message.interactive?.list_reply?.id || null;
      if (rawListId2) {
        // Check if this list id maps to a doctor
        const doc = await doctorService.getDoctorById(rawListId2).catch(() => null);
        if (doc) {
          console.log('ℹ️ Proactively creating pending booking for doctor selection (raw list):', rawListId2);
          await bookingService.createPendingBooking(message.from, { doctorId: rawListId2, meta: { doctorName: doc.name } });
        }
      }

      if (rawButtonId2 && String(rawButtonId2).startsWith('btn_slot_')) {
        // Create/merge pending with slot info
        let slotTitle = rawButtonId2;
        const slotsMsg = messageLibraryService.getMessageById('msg_sharma_slots_interactive');
        if (slotsMsg && slotsMsg.contentPayload && Array.isArray(slotsMsg.contentPayload.buttons)) {
          const btn = slotsMsg.contentPayload.buttons.find(b => b.buttonId === rawButtonId2);
          if (btn) slotTitle = btn.title;
        }
        console.log('ℹ️ Proactively creating pending booking for slot selection (raw button):', slotTitle);
        await bookingService.createPendingBooking(message.from, { bookingTime: slotTitle, meta: { slotTitle } });
      }
    } catch (err) {
      console.error('Error proactively creating pending booking from raw interactive reply:', err);
    }
    
    let result = messageLibraryService.processInteractiveResponse(message.interactive);

    // Additional fallback: if no result but raw ids exist, handle them directly
    const rawButtonId = message.interactive?.button_reply?.id || null;
    const rawListId = message.interactive?.list_reply?.id || null;

    if ((!result || !result.trigger) && rawListId) {
      // Check if this is a patient selection first
      try {
        const patient = await patientService.getPatientById(rawListId).catch(() => null);
        if (patient) {
          console.log('ℹ️ Fallback: patient selected from existing patients list:', rawListId);
          // Send welcome message for existing patient
          const welcomeMsg = messageLibraryService.getMessageById('msg_welcome_interactive');
          if (welcomeMsg) {
            try {
              await messageLibraryService.sendLibraryMessage(welcomeMsg, message.from);
              console.log('✅ Welcome message sent to existing patient');
            } catch (e) {
              console.error('Failed to send welcome message:', e);
            }
          }
          return;
        }
      } catch (err) {
        console.error('Error checking patient selection:', err);
      }

      // Treat rawListId as doctor id (common when dynamic lists are built)
      try {
        const doc = await doctorService.getDoctorById(rawListId).catch(() => null);
        if (doc) {
          console.log('ℹ️ Fallback: creating pending booking from raw list id (doctor):', rawListId);
          await bookingService.createPendingBooking(message.from, { doctorId: rawListId, meta: { doctorName: doc.name } });
          // send slots message (best-effort)
          const slotsMsg = messageLibraryService.getMessageById('msg_sharma_slots_interactive');
              if (slotsMsg) {
            try {
              // clone and inject doctor's name into header, preserving the template suffix
              const msgToSend = JSON.parse(JSON.stringify(slotsMsg));
              msgToSend.contentPayload = msgToSend.contentPayload || {};
              if (doc && doc.name) {
                const originalHeader = String(msgToSend.contentPayload.header || '');
                const suffixMatch = originalHeader.match(/(\s*-\s*Available Slots[\s\S]*)$/i);
                const suffix = suffixMatch ? suffixMatch[1] : ' - Available Slots 📅';
                msgToSend.contentPayload.header = `${doc.name}${suffix}`;
              }
              await messageLibraryService.sendLibraryMessage(msgToSend, message.from);
            } catch (e) { console.error('Failed to send slots message in fallback', e); }
          }
          // we handled it
          return;
        }
        // If not a doctor id, maybe it's a booking id (user selected from bookings list)
        try {
          const bookingDocSnap = await require('../config/firebase').db.collection('bookings').doc(rawListId).get();
          if (bookingDocSnap.exists) {
            console.log('ℹ️ Fallback: raw list id maps to booking id, marking arrived:', rawListId);
            const bookingData = bookingDocSnap.data();
            // mark arrived
            await bookingService.markArrived(rawListId, { arrivalLocation: null, checkedInBy: 'whatsapp' });

            // notify user
            try {
              await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `Thanks, we've marked you as arrived for booking ${rawListId}. Please proceed to reception.` } }, message.from);
            } catch (e) {
              console.error('Failed to send arrival confirmation, persisting instead:', e?.message || e);
              await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: `Thanks, we've marked you as arrived for booking ${rawListId}. Please proceed to reception.`, isResponse: false });
            }

            // notify doctor if present
            if (bookingData && bookingData.doctorId) {
              const doctor = await doctorService.getDoctorById(bookingData.doctorId).catch(() => null);
              if (doctor) {
                await flowService.createMessageWithFlow({ userPhone: doctor.phoneNumber || null, messageType: 'text', content: `Patient ${bookingData.patientId || ''} has checked in for booking ${rawListId}.`, isResponse: false, doctorId: doctor.id });
              }
            }

            return;
          }
        } catch (err) {
          console.error('Error checking booking doc fallback for rawListId:', err);
        }
      } catch (err) {
        console.error('Error in rawListId fallback:', err);
      }
    }

    if ((!result || !result.trigger) && rawButtonId) {
      // Slot selection or confirm-pay/payment-done buttons
      try {
        if (String(rawButtonId).startsWith('btn_slot_')) {
          // Save selected slot
          let slotTitle = rawButtonId;
          const slotsMsg = messageLibraryService.getMessageById('msg_sharma_slots_interactive');
          if (slotsMsg && slotsMsg.contentPayload && Array.isArray(slotsMsg.contentPayload.buttons)) {
            const btn = slotsMsg.contentPayload.buttons.find(b => b.buttonId === rawButtonId);
            if (btn) slotTitle = btn.title;
          }
          await bookingService.createPendingBooking(message.from, { bookingTime: slotTitle, meta: { slotTitle } });
          // forward confirm message if exists - inject selected slot/doctor info when possible
          const confirmMsg = messageLibraryService.getMessageById('msg_confirm_appointment');
          if (confirmMsg) {
            try {
              // try to read doctor name from pending booking meta (if available) or from slots message
              let doctorName = null;
              try {
                const pending = await bookingService.getPendingBookingForUser(message.from).catch(() => null);
                if (pending && pending.meta && pending.meta.doctorName) doctorName = pending.meta.doctorName;
              } catch (e) { /* ignore */ }
              // fallback: try to infer from slots message header
              if (!doctorName) {
                const slotsMsg = messageLibraryService.getMessageById('msg_sharma_slots_interactive');
                if (slotsMsg && slotsMsg.contentPayload && slotsMsg.contentPayload.header) {
                  // header might be like 'Dr. Sharma - Available Slots 📅'
                  doctorName = String(slotsMsg.contentPayload.header).split('\n')[0].split(' - ')[0];
                }
              }
              const confirmToSend = JSON.parse(JSON.stringify(confirmMsg));
              if (doctorName) {
                confirmToSend.contentPayload = confirmToSend.contentPayload || {};
                // Use a static header and ensure doctor's name appears in the body
                confirmToSend.contentPayload.header = 'Appointment Confirmation';
                if (confirmToSend.contentPayload.body) {
                  try {
                    if (/Dr\.?\s+[^\n\r]*/i.test(String(confirmToSend.contentPayload.body))) {
                      confirmToSend.contentPayload.body = confirmToSend.contentPayload.body.replace(/Dr\.?\s+[^\n\r]*/i, doctorName);
                    } else {
                      confirmToSend.contentPayload.body = `${doctorName}\n${String(confirmToSend.contentPayload.body)}`;
                    }
                  } catch (e) { /* ignore */ }
                }
              }
              await messageLibraryService.sendLibraryMessage(confirmToSend, message.from);
            } catch (e) { console.error('Failed to send confirm message in fallback', e) }
          }
          console.log('ℹ️ Fallback: pending booking created for slot:', slotTitle);
          return;
        }

        if (rawButtonId === 'btn_confirm_pay') {
          // Finalize booking immediately (as user requested)
          console.log('ℹ️ Fallback: finalize booking on raw confirm_pay');
          const pending = await bookingService.getPendingBookingForUser(message.from);
          if (pending) {
            let patient = await patientService.getPatientByPhone(message.from);
            if (!patient) patient = await patientService.createPatient({ name: pending.meta?.patientName || 'Unknown', phoneNumber: message.from });
            const bookingTime = pending.bookingTime || new Date().toISOString();
            const booking = await bookingService.createBooking({ patientId: patient.id, doctorId: pending.doctorId, bookingTime, meta: pending.meta || {} });
            await bookingService.deletePendingBooking(message.from);
            try { await messageLibraryService.sendLibraryMessage({ type:'standard_text', contentPayload:{ body:`✅ Your appointment has been reserved. Booking ID: ${booking.id}. Please complete payment to confirm.` } }, message.from);}catch(e){console.error('Failed to send confirmation in fallback', e)}
            await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: `Appointment reserved: ${booking.id}`, patientId: patient.id, doctorId: booking.doctorId, bookingId: booking.id, isResponse: false });
          } else {
            console.log('Fallback confirm_pay: no pending booking to finalize');
          }
          return;
        }
      } catch (err) {
        console.error('Error in rawButtonId fallback:', err);
      }
    }

    // If the library didn't find a trigger (could be id mismatch), attempt to resolve from raw payload
    if ((!result || !result.trigger) && message.interactive) {
      try {
        const rawButtonId = message.interactive?.button_reply?.id || null;
        const rawListId = message.interactive?.list_reply?.id || null;
        if (rawButtonId) {
          const btnTrig = messageLibraryService.findButtonTrigger(rawButtonId);
          if (btnTrig) {
            result = { trigger: btnTrig, nextMessage: messageLibraryService.getMessageById(btnTrig.targetId) };
            console.log('🔎 Resolved trigger from raw button id:', rawButtonId, '->', btnTrig.triggerId);
          }
        } else if (rawListId) {
          const listTrig = messageLibraryService.findListTrigger(rawListId);
          if (listTrig) {
            result = { trigger: listTrig, nextMessage: messageLibraryService.getMessageById(listTrig.targetId) };
            console.log('🔎 Resolved trigger from raw list id:', rawListId, '->', listTrig.triggerId);
          }
        }
      } catch (err) {
        console.error('Error resolving interactive trigger from raw payload:', err);
      }
    }

    if (result && result.trigger) {
      const trigger = result.trigger;
      console.log('🔔 Interactive trigger details:', { triggerId: trigger.triggerId, triggerType: trigger.triggerType, triggerValue: trigger.triggerValue, nextAction: trigger.nextAction, targetId: trigger.targetId });
      // If trigger asks to send a library message
        if (trigger.nextAction === 'send_message' && result.nextMessage) {
        try {
          // If this next message is the slots message, try to inject doctor's name into header.
          // Handle both list-selection triggers (doctor select) and button triggers like 'reschedule'.
          if (result.nextMessage && (result.nextMessage.messageId === 'msg_sharma_slots_interactive' || result.nextMessage.messageId === trigger.targetId)) {
            let msgToSend = result.nextMessage;
            let injected = false;

            // 1) Try to get doctorName from a pending booking for this user (covers reschedule flows)
            try {
              const pending = await bookingService.getPendingBookingForUser(message.from).catch(() => null);
                if (pending && pending.meta && pending.meta.doctorName) {
                msgToSend = JSON.parse(JSON.stringify(result.nextMessage));
                msgToSend.contentPayload = msgToSend.contentPayload || {};
                const originalHeader = String(msgToSend.contentPayload.header || '');
                const suffixMatch = originalHeader.match(/(\s*-\s*Available Slots[\s\S]*)$/i);
                const suffix = suffixMatch ? suffixMatch[1] : ' - Available Slots 📅';
                msgToSend.contentPayload.header = `${pending.meta.doctorName}${suffix}`;
                injected = true;
                console.log('ℹ️ Injected doctorName from pending booking for slots message:', pending.meta.doctorName);
              }
            } catch (e) {
              console.warn('Could not read pending booking to inject doctor name:', e?.message || e);
            }

            // 2) If not injected yet, fall back to list_selection trigger behavior (dynamic doctor id)
            if (!injected && trigger.triggerType === 'list_selection' && trigger.triggerValue) {
              try {
                const doc = await doctorService.getDoctorById(trigger.triggerValue).catch(() => null);
                if (doc) {
                  msgToSend = JSON.parse(JSON.stringify(result.nextMessage));
                  msgToSend.contentPayload = msgToSend.contentPayload || {};
                  const originalHeader = String(msgToSend.contentPayload.header || '');
                  const suffixMatch = originalHeader.match(/(\s*-\s*Available Slots[\s\S]*)$/i);
                  const suffix = suffixMatch ? suffixMatch[1] : ' - Available Slots 📅';
                  msgToSend.contentPayload.header = `${doc.name}${suffix}`;
                  injected = true;
                }
              } catch (e) {
                console.warn('Could not fetch doctor to inject header:', e?.message || e);
              }
            }

            // 3) If still not injected, try to infer doctor's name from recently persisted messages for this user
            if (!injected) {
              try {
                const recent = await flowService.getMessagesByUser(message.from).catch(() => []);
                const doctorMatchRegex = /Dr\.?\s+([A-Z][a-zA-Z\-']{1,50})/;
                let inferred = null;
                for (const m of recent) {
                  const content = m.content;
                  if (!content) continue;
                  // content may be an object (interactive contentPayload) or string
                  if (typeof content === 'string') {
                    const mm = content.match(doctorMatchRegex);
                    if (mm) { inferred = `Dr. ${mm[1]}`; break; }
                  } else if (typeof content === 'object') {
                    const cp = content.contentPayload || content;
                    if (cp && cp.header && typeof cp.header === 'string') {
                      const mm = String(cp.header).match(doctorMatchRegex);
                      if (mm) { inferred = `Dr. ${mm[1]}`; break; }
                    }
                    if (cp && cp.body && typeof cp.body === 'string') {
                      const mm = String(cp.body).match(doctorMatchRegex);
                      if (mm) { inferred = `Dr. ${mm[1]}`; break; }
                    }
                  }
                }
                if (inferred) {
                  msgToSend = JSON.parse(JSON.stringify(result.nextMessage));
                  msgToSend.contentPayload = msgToSend.contentPayload || {};
                  const originalHeader = String(msgToSend.contentPayload.header || '');
                  const suffixMatch = originalHeader.match(/(\s*-\s*Available Slots[\s\S]*)$/i);
                  const suffix = suffixMatch ? suffixMatch[1] : ' - Available Slots 📅';
                  msgToSend.contentPayload.header = `${inferred}${suffix}`;
                  injected = true;
                  console.log('ℹ️ Injected doctorName inferred from recent messages for slots message:', inferred);
                }
              } catch (e) {
                console.warn('Could not infer doctor name from recent messages:', e?.message || e);
              }
            }

            // 3) As a last resort, if the slots template already contains a header, use it (no change)
            console.log(`📤 Sending next message: "${msgToSend.name}" to ${message.from}`);
            await messageLibraryService.sendLibraryMessage(msgToSend, message.from);
            console.log(`✅ Successfully sent interactive response message to ${message.from}`);
          } else if (result.nextMessage && result.nextMessage.messageId === 'msg_confirm_appointment') {
            // If nextMessage is the confirm appointment message, inject doctor name if possible
            try {
              const confirmMsg = result.nextMessage;
              let doctorName = null;
              if (trigger && trigger.triggerType === 'button_click' && trigger.triggerValue && String(trigger.triggerValue).startsWith('btn_slot_')) {
                // try to find doctorName from pending booking or slots meta
                const pending = await bookingService.getPendingBookingForUser(message.from).catch(() => null);
                if (pending && pending.meta && pending.meta.doctorName) doctorName = pending.meta.doctorName;
              }
              if (!doctorName && trigger && trigger.triggerType === 'list_selection' && trigger.triggerValue) {
                const doc = await doctorService.getDoctorById(trigger.triggerValue).catch(() => null);
                if (doc) doctorName = doc.name;
              }
              const confirmToSend = JSON.parse(JSON.stringify(confirmMsg));
              if (doctorName) {
                confirmToSend.contentPayload = confirmToSend.contentPayload || {};
                confirmToSend.contentPayload.header = 'Appointment Confirmation';
                if (confirmToSend.contentPayload.body) {
                  try {
                    if (/Dr\.?\s+[^\n\r]*/i.test(String(confirmToSend.contentPayload.body))) {
                      confirmToSend.contentPayload.body = confirmToSend.contentPayload.body.replace(/Dr\.?\s+[^\n\r]*/i, doctorName);
                    } else {
                      confirmToSend.contentPayload.body = `${doctorName}\n${String(confirmToSend.contentPayload.body)}`;
                    }
                  } catch (e) { /* ignore */ }
                }
              }
              await messageLibraryService.sendLibraryMessage(confirmToSend, message.from);
              console.log(`✅ Successfully sent interactive response message to ${message.from}`);
            } catch (error) {
              console.error('❌ Failed to send confirm appointment with injected doctor name:', error.message);
            }
          } else {
            console.log(`📤 Sending next message: "${result.nextMessage.name}" to ${message.from}`);
            await messageLibraryService.sendLibraryMessage(result.nextMessage, message.from);
            console.log(`✅ Successfully sent interactive response message to ${message.from}`);
          }
        } catch (error) {
          console.error(`❌ Failed to send interactive response message:`, error.message);
        }
          // If this was the Confirm & Pay button, finalize the pending booking now
          try {
            if (trigger.triggerId === 'trigger_confirm_pay' || trigger.triggerValue === 'btn_confirm_pay') {
              const pending = await bookingService.getPendingBookingForUser(message.from);
              if (pending) {
                // Ensure patient exists
                let patient = await patientService.getPatientByPhone(message.from);
                if (!patient) {
                  patient = await patientService.createPatient({ name: pending.meta?.patientName || 'Unknown', phoneNumber: message.from });
                }

                const bookingTime = pending.bookingTime || new Date().toISOString();
                const booking = await bookingService.createBooking({ patientId: patient.id, doctorId: pending.doctorId, bookingTime, meta: pending.meta || {} });
                await bookingService.deletePendingBooking(message.from);

                // send a quick confirmation message (in addition to payment link)
                try {
                  await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `✅ Your appointment has been reserved. Booking ID: ${booking.id}. Please complete payment to confirm.` } }, message.from);
                } catch (err) {
                  console.error('Failed to send booking confirmation message after confirm_pay:', err);
                }

                // persist appointment message
                await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: `Appointment reserved: ${booking.id}`, patientId: patient.id, doctorId: booking.doctorId, bookingId: booking.id, isResponse: false });
              }
            }
          } catch (err) {
            console.error('Error finalizing booking on confirm_pay:', err);
          }
        return;
      }

      // If we don't have a resolved trigger but the nextMessage is the payment link, try finalizing
      if ((!result || !result.trigger) && result && result.nextMessage) {
        try {
          const nm = result.nextMessage;
          const nmId = nm.messageId || nm.name;
          console.log('ℹ️ No trigger resolved, but nextMessage exists:', nmId);
          if (nmId === 'msg_payment_link' || (typeof nm.name === 'string' && nm.name.toLowerCase().includes('payment'))) {
            // finalize pending booking as Confirm & Pay
            console.log('ℹ️ Finalizing booking because nextMessage is payment link');
            const pending = await bookingService.getPendingBookingForUser(message.from);
            if (pending) {
              let patient = await patientService.getPatientByPhone(message.from);
              if (!patient) {
                patient = await patientService.createPatient({ name: pending.meta?.patientName || 'Unknown', phoneNumber: message.from });
              }
              const bookingTime = pending.bookingTime || new Date().toISOString();
              const booking = await bookingService.createBooking({ patientId: patient.id, doctorId: pending.doctorId, bookingTime, meta: pending.meta || {} });
              await bookingService.deletePendingBooking(message.from);
              console.log('✅ Booking finalized on payment-link path:', booking.id);
              try { await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `✅ Your appointment has been reserved. Booking ID: ${booking.id}. Please complete payment to confirm.` } }, message.from); } catch(e){console.error('Failed to send confirmation after payment-link finalize', e)}
              await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: `Appointment reserved: ${booking.id}`, patientId: patient.id, doctorId: booking.doctorId, bookingId: booking.id, isResponse: false });
            } else {
              console.log('No pending booking to finalize on payment-link path');
            }
          }
        } catch (err) {
          console.error('Error in fallback payment-link finalization:', err);
        }
      }

        // --- Interactive booking helpers (robust) ---
        try {
          const rawButtonId = message.interactive?.button_reply?.id || null;
          const rawListId = message.interactive?.list_reply?.id || null;

          // 1) If this is a list selection and the value corresponds to a doctor id, save pending doctor
          if ((trigger.triggerType === 'list_selection' || rawListId) ) {
            const doctorId = trigger.triggerValue || rawListId;
            if (doctorId) {
              try {
                const doctor = await doctorService.getDoctorById(doctorId).catch(() => null);
                if (doctor) {
                  await bookingService.createPendingBooking(message.from, { doctorId: doctor.id, meta: { doctorName: doctor.name } });
                  // forward next message if present (slots)
                  if (result.nextMessage) {
                    try {
                      const msgToSend = JSON.parse(JSON.stringify(result.nextMessage));
                      msgToSend.contentPayload = msgToSend.contentPayload || {};
                      msgToSend.contentPayload.header = doctor.name || msgToSend.contentPayload.header;
                      await messageLibraryService.sendLibraryMessage(msgToSend, message.from);
                    } catch (e) {
                      console.error('Failed to forward slots message after creating pending booking:', e);
                    }
                  }
                  console.log('✅ Pending booking created for doctor selection:', doctor.id);
                  return;
                }
              } catch (err) {
                console.error('Error creating pending booking from list selection:', err);
              }
            }
          }

          // 2) If this is a slot button click (button id like btn_slot_...), save the slot
          const clickedButtonId = trigger.triggerValue || rawButtonId;
          if (clickedButtonId && String(clickedButtonId).startsWith('btn_slot_')) {
            try {
              // find human-friendly title when possible
              let slotTitle = clickedButtonId;
              const slotsMsg = messageLibraryService.getMessageById('msg_sharma_slots_interactive');
              if (slotsMsg && slotsMsg.contentPayload && Array.isArray(slotsMsg.contentPayload.buttons)) {
                const btn = slotsMsg.contentPayload.buttons.find(b => b.buttonId === clickedButtonId);
                if (btn) slotTitle = btn.title;
              }

              await bookingService.createPendingBooking(message.from, { bookingTime: slotTitle, meta: { slotTitle } });
              if (result.nextMessage) {
                // If the next message is the confirm appointment, inject doctor name when possible
                if (result.nextMessage.messageId === 'msg_confirm_appointment') {
                  try {
                    const confirmMsg = result.nextMessage;
                    let doctorName = null;
                    const pending = await bookingService.getPendingBookingForUser(message.from).catch(() => null);
                    if (pending && pending.meta && pending.meta.doctorName) doctorName = pending.meta.doctorName;
                    if (!doctorName) {
                      // try infer from trigger if present
                      if (trigger && trigger.triggerType === 'list_selection' && trigger.triggerValue) {
                        const doc = await doctorService.getDoctorById(trigger.triggerValue).catch(() => null);
                        if (doc) doctorName = doc.name;
                      }
                    }
                    const confirmToSend = JSON.parse(JSON.stringify(confirmMsg));
                    if (doctorName) {
                      confirmToSend.contentPayload = confirmToSend.contentPayload || {};
                      confirmToSend.contentPayload.header = 'Appointment Confirmation';
                      if (confirmToSend.contentPayload.body) {
                        try {
                          if (/Dr\.?\s+[^\n\r]*/i.test(String(confirmToSend.contentPayload.body))) {
                            confirmToSend.contentPayload.body = confirmToSend.contentPayload.body.replace(/Dr\.?\s+[^\n\r]*/i, doctorName);
                          } else {
                            confirmToSend.contentPayload.body = `${doctorName}\n${String(confirmToSend.contentPayload.body)}`;
                          }
                        } catch (e) { /* ignore */ }
                      }
                    }
                    await messageLibraryService.sendLibraryMessage(confirmToSend, message.from);
                  } catch (e) {
                    console.error('Failed to send confirm message with injected doctor name (fallback path):', e);
                    await messageLibraryService.sendLibraryMessage(result.nextMessage, message.from);
                  }
                } else {
                  await messageLibraryService.sendLibraryMessage(result.nextMessage, message.from);
                }
              }
              console.log('✅ Pending booking created for slot selection:', slotTitle);
              return;
            } catch (err) {
              console.error('Error creating pending booking from slot selection:', err);
            }
          }

        } catch (err) {
          console.error('Unexpected error in interactive booking helper:', err);
        }
        // --- end interactive booking helpers ---

      // If trigger asks to mark arrived (button or keyword)
      if (trigger.nextAction === 'mark_arrived') {
        console.log(`🔔 Mark arrived requested for ${message.from}`);
        try {
          const phone = message.from;
          const patient = await patientService.getPatientByPhone(phone);
          if (!patient) {
            // Prompt to select existing patient or register
            const msg = messageLibraryService.getMessageById('msg_existing_patient_select');
            if (msg) await messageLibraryService.sendLibraryMessage(msg, phone);
            return;
          }

          // Find scheduled bookings for this patient
          const snaps = await require('../config/firebase').db.collection('bookings').where('patientId', '==', patient.id).where('status', '==', 'scheduled').get();
          const candidates = [];
          const now = new Date();
          const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          const windowEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);

          snaps.forEach(d => {
            const b = d.data();
            const bt = (b.bookingTime && b.bookingTime.toDate) ? b.bookingTime.toDate() : new Date(b.bookingTime);
            if (bt >= windowStart && bt <= windowEnd) {
              candidates.push({ id: d.id, ...b, bookingTimeObj: bt });
            }
          });

          // If none in window, include all scheduled and pick soonest
          if (candidates.length === 0) {
            snaps.forEach(d => {
              const b = d.data();
              const bt = (b.bookingTime && b.bookingTime.toDate) ? b.bookingTime.toDate() : new Date(b.bookingTime);
              candidates.push({ id: d.id, ...b, bookingTimeObj: bt });
            });
          }

          if (candidates.length === 0) {
            // No bookings found
            try {
              await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'We could not find any upcoming bookings for you. Please check at reception.' } }, phone);
            } catch (sendErr) {
              console.error('Failed to send WhatsApp message, saving message record instead:', sendErr?.message || sendErr);
              await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'text', content: 'We could not find any upcoming bookings for you. Please check at reception.', isResponse: false });
            }
            return;
          }

          if (candidates.length === 1) {
            // Single booking: mark arrived
            const chosen = candidates[0];
            await bookingService.markArrived(chosen.id, { arrivalLocation: null, checkedInBy: 'whatsapp' });
            try {
              await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `Thanks ${patient.name || ''}, we have recorded your arrival for ${chosen.bookingTimeObj.toLocaleString()}. Please proceed to reception.` } }, phone);
            } catch (sendErr) {
              console.error('Failed to send WhatsApp message, saving message record instead:', sendErr?.message || sendErr);
              await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'text', content: `Thanks ${patient.name || ''}, we have recorded your arrival for ${chosen.bookingTimeObj.toLocaleString()}. Please proceed to reception.`, isResponse: false });
            }

            // notify doctor
            if (chosen.doctorId) {
              const doctor = await doctorService.getDoctorById(chosen.doctorId);
              await flowService.createMessageWithFlow({ userPhone: doctor?.phoneNumber || null, messageType: 'text', content: `Patient ${patient.name || ''} has checked in for booking ${chosen.id}.`, isResponse: false, doctorId: doctor?.id });
            }
            return;
          }

          // Multiple candidates: build interactive list so user selects which booking to check in for
          const rows = [];
          const truncate = (s, n) => {
            if (!s) return '';
            const str = String(s);
            if (str.length <= n) return str;
            return str.slice(0, Math.max(0, n - 1)) + '…';
          };

          for (const c of candidates) {
            const doctor = c.doctorId ? await doctorService.getDoctorById(c.doctorId) : null;
            const doctorName = (c.meta && c.meta.doctorName) ? c.meta.doctorName : (doctor?.name || 'Doctor');
            const slotTitle = (c.meta && c.meta.slotTitle) ? c.meta.slotTitle : (c.bookingTimeObj ? c.bookingTimeObj.toLocaleString() : '');
            const rawTitle = `${doctorName} — ${slotTitle}`;
            const safeTitle = truncate(rawTitle, 24);
            const safeDesc = `${doctorName} · ${slotTitle}`;
            rows.push({ rowId: c.id, title: safeTitle, description: safeDesc, triggerId: `trigger_booking_${c.id}` });
            // register a list-selection trigger for this booking
            const existing = messageLibraryService.triggers.find(t => t.triggerType === 'list_selection' && t.triggerValue === c.id);
            if (!existing) {
              messageLibraryService.addTrigger({ triggerId: `trigger_booking_${c.id}`, triggerType: 'list_selection', triggerValue: c.id, nextAction: 'mark_arrived_selected', targetId: c.id, messageId: null });
            }
          }

          const listMessage = {
            messageId: `msg_booking_select_${Date.now()}`,
            name: 'Select Booking to Check-in',
            type: 'interactive_list',
            status: 'published',
            contentPayload: {
              header: 'Which booking are you checking in for?',
              body: 'Select the booking you have arrived for:',
              footer: 'Choose from the list',
              buttonText: 'Select Booking',
              sections: [{ title: 'Upcoming bookings', rows }]
            }
          };

          try {
            await messageLibraryService.sendLibraryMessage(listMessage, phone);
          } catch (sendErr) {
            console.error('Failed to send interactive list via WhatsApp, saving message record instead:', sendErr?.message || sendErr);
            await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'interactive', content: listMessage.contentPayload, isResponse: false });
          }
          return;
        } catch (err) {
          console.error('❌ Failed to handle mark_arrived:', err);
          await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'Sorry, we could not process your check-in. Please try at reception.' } }, message.from);
        }
      }

      // If trigger asks to start a WhatsApp Flow
      if (trigger.nextAction === 'start_flow' && trigger.targetId) {
        try {
          console.log(`🔄 Trigger requests starting flow ${trigger.targetId} for ${message.from}`);
          await sendFlowMessage(message.from, trigger.targetId, 'Please complete this form:');
          console.log(`✅ Started flow ${trigger.targetId} for ${message.from}`);
        } catch (err) {
          console.error('❌ Failed to start flow from interactive trigger:', err.message || err);
        }
        return;
      }

      // If trigger is a booking selection to mark arrived
      if (trigger.nextAction === 'mark_arrived_selected' && trigger.triggerType === 'list_selection') {
        try {
          const bookingId = trigger.triggerValue || result.trigger.triggerValue || result.trigger.targetId || result.trigger.targetId;
          if (!bookingId) {
            console.error('No booking id found on selection trigger');
            return;
          }

          // find patient by phone
          const patient = await patientService.getPatientByPhone(message.from);
          await bookingService.markArrived(bookingId, { arrivalLocation: null, checkedInBy: 'whatsapp' });

          await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `Thanks ${patient?.name || ''}, we've marked you as arrived for booking ${bookingId}. Please proceed to reception.` } }, message.from);

          // notify doctor
          const bookingDoc = (await require('../config/firebase').db.collection('bookings').doc(bookingId).get()).data();
          if (bookingDoc && bookingDoc.doctorId) {
            const doctor = await doctorService.getDoctorById(bookingDoc.doctorId);
            await flowService.createMessageWithFlow({ userPhone: doctor?.phoneNumber || null, messageType: 'text', content: `Patient ${patient?.name || ''} checked in for booking ${bookingId}.`, isResponse: false, doctorId: doctor?.id });
          }
        } catch (err) {
          console.error('Failed to process mark_arrived_selected:', err);
        }
        return;
      }

      // Handle Confirm & Pay button (mark pending as awaiting payment)
      if (trigger.triggerId === 'trigger_confirm_pay' || trigger.triggerValue === 'btn_confirm_pay') {
        try {
          const pending = await bookingService.getPendingBookingForUser(message.from);
          if (pending) {
            await bookingService.createPendingBooking(message.from, { ...pending, meta: { ...(pending.meta||{}), status: 'awaiting_payment' } });
          }
        } catch (err) {
          console.error('Error marking pending booking awaiting payment:', err);
        }
        return;
      }

      // Handle Proceed button after payment processing: finalize booking
      // We intentionally do NOT finalize on raw payment-done button clicks to avoid collisions.
      // Finalization occurs only when a dedicated 'proceed' button is clicked.
      if (
        (trigger.triggerId && trigger.triggerId.startsWith && trigger.triggerId.startsWith('trigger_proceed_')) ||
        (trigger.triggerValue && trigger.triggerValue.startsWith && trigger.triggerValue.startsWith('btn_proceed_')) ||
        (trigger.triggerId && trigger.triggerId.startsWith && trigger.triggerId.startsWith('trigger_payment_done_')) ||
        (trigger.triggerValue && trigger.triggerValue.startsWith && trigger.triggerValue.startsWith('btn_payment_done_'))
      ) {
        try {
          const pending = await bookingService.getPendingBookingForUser(message.from);
          if (!pending) {
            await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'No pending booking found. Please start booking again.' } }, message.from);
            return;
          }

          // Ensure patient exists
          let patient = await patientService.getPatientByPhone(message.from);
          if (!patient) {
            patient = await patientService.createPatient({ name: pending.meta?.patientName || 'Unknown', phoneNumber: message.from });
          }

          const bookingTime = pending.bookingTime || new Date().toISOString();
          const booking = await bookingService.createBooking({ patientId: patient.id, doctorId: pending.doctorId, bookingTime, meta: pending.meta || {} });
          await bookingService.deletePendingBooking(message.from);

          await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: `✅ Your appointment is confirmed. Booking ID: ${booking.id}` } }, message.from);
          await flowService.createMessageWithFlow({ userPhone: message.from, messageType: 'text', content: `Appointment created: ${booking.id}`, patientId: patient.id, doctorId: booking.doctorId, bookingId: booking.id, isResponse: false });
        } catch (err) {
          console.error('Error finalizing booking after proceed:', err);
          await messageLibraryService.sendLibraryMessage({ type: 'standard_text', contentPayload: { body: 'We could not finalize your booking. Please contact reception.' } }, message.from);
        }
        return;
      }
    }

    console.log(`📝 No matching trigger found for interactive response from ${message.from}`);
    // Send a fallback message
    const fallbackMessage = messageLibraryService.getMessageById('msg_welcome_interactive');
    if (fallbackMessage) {
      console.log(`🔄 Sending fallback welcome message to ${message.from}`);
      await messageLibraryService.sendLibraryMessage(fallbackMessage, message.from);
    }
  } catch (error) {
    console.error('❌ Error handling interactive response:', error);
  }
}

/**
 * Handle flow completion responses
 */
async function handleFlowResponse(message) {
  try {
    if (message.interactive?.nfm_reply) {
      const response = message.interactive.nfm_reply;
      
      console.log('📋 Flow response received:', {
        from: message.from,
        flowName: response.name,
        responseData: response.response_json,
        body: response.body
      });
      
      // Parse form data
      let formData = {};
      try {
        formData = JSON.parse(response.response_json);
        console.log('📊 Parsed form data:', formData);
      } catch (parseError) {
        console.log('⚠️  Could not parse flow response JSON:', response.response_json);
        return;
      }

      // Attempt to map this response to a tracking record (by token or by latest sent)
      let matchedFlowId = null;
      try {
        // Try to parse token from the response JSON/body (some flows include flow_token)
        let possibleToken = null;
        try {
          const parsed = formData || {};
          if (parsed.flow_token) possibleToken = parsed.flow_token;
        } catch (e) {
          // ignore
        }

        // If not found, try to inspect response.body for a token string
        if (!possibleToken && response.body) {
          const m = String(response.body).match(/flow_token_[0-9a-zA-Z_\-]*/i);
          if (m) possibleToken = m[0];
        }

        let trackingQuery = null;
        if (possibleToken) {
          trackingQuery = (await flowService.flowTrackingsCollection.where('flowToken', '==', possibleToken).limit(1).get());
        }

        if (trackingQuery && trackingQuery.size === 1) {
          matchedFlowId = trackingQuery.docs[0].data().flowId;
        } else {
          // fallback: fetch latest tracking for this user
          const q = await flowService.flowTrackingsCollection.where('userPhone', '==', message.from).orderBy('createdAt', 'desc').limit(1).get();
          if (!q.empty) matchedFlowId = q.docs[0].data().flowId;
        }
      } catch (err) {
        console.error('❌ Error matching flow response to tracking:', err.message || err);
      }

      // Store flow response in Firebase (include matched flowId if found)
      const flowResponseData = {
        userPhone: message.from,
        flowName: response.name,
        flowId: matchedFlowId,
        response: formData,
        responseType: 'flow_completion',
        rawResponse: response.response_json,
        messageId: message.id
      };

      try {
        // Persist raw webhook message for audit
        try {
          await flowService.createWebhookMessage({ rawMessage: message });
        } catch (err) {
          console.error('⚠️  Failed to persist raw webhook message:', err.message || err);
        }

        const savedResponse = await flowService.createFlowResponse(flowResponseData);
        console.log('✅ Flow response saved to Firebase:', savedResponse.id, 'mappedFlowId:', matchedFlowId);

        // If we matched a flow tracking record, mark it completed
        try {
          // find the tracking doc used (by token or latest for user)
          let trackingDoc = null;
          if (flowResponseData.response && flowResponseData.response.flow_token) {
            const tq = await flowService.flowTrackingsCollection.where('flowToken', '==', flowResponseData.response.flow_token).limit(1).get();
            if (!tq.empty) trackingDoc = tq.docs[0];
          }

          if (!trackingDoc) {
            const tq2 = await flowService.flowTrackingsCollection.where('userPhone', '==', message.from).orderBy('createdAt', 'desc').limit(1).get();
            if (!tq2.empty) trackingDoc = tq2.docs[0];
          }

          if (trackingDoc) {
            await flowService.completeFlowTracking(trackingDoc.id, { status: 'completed', responseId: savedResponse.id });
          }
        } catch (err) {
          console.error('⚠️  Failed to mark flow tracking completed:', err.message || err);
        }

        // Send interactive confirmation with a deterministic Next button that routes to welcome
        try {
          const phone = message.from;

          // Build an interactive 'Thanks — Next' message (deterministic ids)
          const btnId = 'btn_next_welcome';
          const messageObj = {
            // messageId will be assigned by addMessage; keep name for readability
            name: 'Response Saved - Next',
            type: 'interactive_button',
            status: 'published',
            contentPayload: {
              header: 'Thank you',
              body: 'Thanks — we received your response and saved it. Click Next to continue to Hospital Services.',
              footer: 'We are here to help',
              buttons: [
                {
                  buttonId: btnId,
                  title: 'Next',
                  triggerId: 'trigger_next_welcome',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_welcome_interactive'
                }
              ]
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Add message to library (in-memory) and get saved entry
          let savedMsg;
          try {
            savedMsg = messageLibraryService.addMessage(messageObj);
          } catch (e) {
            // Fallback: if addMessage fails, create a minimal object
            savedMsg = { messageId: `msg_response_saved_${Date.now()}`, ...messageObj };
            if (!messageLibraryService.messages) messageLibraryService.messages = [];
            messageLibraryService.messages.push(savedMsg);
          }

          // Register deterministic trigger if not present
          try {
            const exists = (messageLibraryService.triggers || []).find(t => t.triggerId === 'trigger_next_welcome' || t.triggerValue === btnId);
            if (!exists) {
              const newTrig = {
                triggerId: 'trigger_next_welcome',
                triggerType: 'button_click',
                triggerValue: btnId,
                nextAction: 'send_message',
                targetId: 'msg_welcome_interactive',
                messageId: savedMsg.messageId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              if (!messageLibraryService.triggers) messageLibraryService.triggers = [];
              messageLibraryService.triggers.push(newTrig);
            }
          } catch (e) {
            console.error('⚠️ Failed to register next-welcome trigger:', e.message || e);
          }

          // Try to send the interactive message via library
          try {
            await messageLibraryService.sendLibraryMessage(savedMsg, phone);
            console.log('📤 Welcome/Next interactive message sent to', phone);
          } catch (sendErr) {
            console.error('⚠️ Failed to send welcome-next interactive message, persisting instead:', sendErr?.message || sendErr);
            await flowService.createMessageWithFlow({ userPhone: phone, messageType: 'interactive', content: savedMsg.contentPayload, isResponse: false });
          }
        } catch (err) {
          console.error('⚠️  Failed to send interactive Next message to user:', err.message || err);
        }
      } catch (error) {
        console.error('❌ Failed to save flow response:', error);
      }

      // Upsert patient from flow data if possible (map fields)
      try {
        const form = formData || {};
        const possibleName = form.name || form.full_name || form.text_input || form.patient_name || form['text_input'];
        const possibleGenderRaw = form.Choose_one || form.choose_one || form.gender || form.sex;
        let gender;
        if (possibleGenderRaw) {
          const s = String(possibleGenderRaw).toLowerCase();
          // Your rule: "0_Yes" means male, otherwise female. Also accept 'male'/'m'/'yes'
          if (s.includes('0_') || s.includes('yes') || s.includes('male') || s === 'm') {
            gender = 'male';
          } else {
            gender = 'female';
          }
        }

        if (possibleName || gender) {
          const phone = message.from || form.userPhone || form.user_phone;
          try {
            let patient = await patientService.getPatientByPhone(phone);
            const updateData = {};
            if (possibleName) updateData.name = possibleName;
            if (gender) updateData.gender = gender;
            if (form.email) updateData.email = form.email;
            if (form.date_of_birth || form.dob) updateData.dob = form.date_of_birth || form.dob;

            if (Object.keys(updateData).length > 0) {
              if (patient) {
                await patientService.updatePatient(patient.id, updateData);
                console.log('✅ Updated patient from flow:', patient.id);
              } else {
                const created = await patientService.createPatient({ ...updateData, phoneNumber: phone });
                console.log('✅ Created patient from flow:', created.id);

                // After creating a new patient, send the welcome interactive message
                try {
                  const welcomeMsg = messageLibraryService.getMessageById('msg_welcome_interactive');
                  if (welcomeMsg && welcomeMsg.status === 'published') {
                    try {
                      const sendResult = await messageLibraryService.sendLibraryMessage(welcomeMsg, phone);
                      console.log('📤 Welcome interactive message sent to new patient:', phone, 'response:', sendResult.data || sendResult);
                    } catch (sendErr) {
                      console.error('⚠️ Failed to send welcome message to new patient. Error detail:', sendErr.response?.data || sendErr.message || sendErr);
                    }
                  }
                } catch (err) {
                  console.error('⚠️ Failed to send welcome message to new patient:', err.message || err);
                }
              }
            }
          } catch (err) {
            console.error('⚠️ Failed to upsert patient from flow data:', err.message || err);
          }
        }
      } catch (err) {
        console.error('⚠️ Error processing patient upsert from flow:', err.message || err);
      }

      // Process specific flow types
      await processFlowByType(response.name, formData, message.from);
      
    }
  } catch (error) {
    console.error('❌ Error handling flow response:', error);
  }
}

/**
 * Process flow responses based on flow type
 */
async function processFlowByType(flowName, formData, userPhone) {
  try {
    console.log(`🔄 Processing flow type: ${flowName}`);

    if (flowName.toLowerCase().includes('appointment')) {
      await processAppointmentFlow(formData, userPhone);
    } else if (flowName.toLowerCase().includes('symptom')) {
      await processSymptomFlow(formData, userPhone);
    } else if (flowName.toLowerCase().includes('registration')) {
      await processRegistrationFlow(formData, userPhone);
    } else {
      console.log(`📝 No specific processor for flow: ${flowName}`);
    }
  } catch (error) {
    console.error('❌ Error processing flow by type:', error);
  }
}

/**
 * Process appointment booking flow
 */
async function processAppointmentFlow(formData, userPhone) {
  try {
    console.log('📅 Processing appointment booking flow');

    // Extract appointment data
    const specialization = formData.specialization || 'general';
    const patientName = formData.name || formData.patient_name;
    const preferredDate = formData.date || formData.preferred_date;

    // Find or create patient
    let patient = await patientService.getPatientByPhone(userPhone);
    if (!patient && patientName) {
      patient = await patientService.createPatient({
        name: patientName,
        phoneNumber: userPhone
      });
      console.log('✅ Created new patient:', patient.name);
    }

    // Find available doctor
    const doctors = await doctorService.getDoctorsBySpecialization(specialization);
    if (doctors.length > 0) {
      const assignedDoctor = doctors[0]; // Simple assignment logic
      // Create booking record
      try {
        const bookingTime = preferredDate || new Date().toISOString();
        const booking = await bookingService.createBooking({ patientId: patient?.id, doctorId: assignedDoctor.id, bookingTime });
        console.log('✅ Booking created:', booking.id);

        // Create message with appointment details and booking reference
        const appointmentMessage = {
          userPhone: userPhone,
          messageType: 'text',
          content: `🏥 Appointment Booked!\n\n👤 Patient: ${patientName}\n👨‍⚕️ Doctor: ${assignedDoctor.name}\n🏥 Department: ${assignedDoctor.specialization}\n📞 Contact: ${assignedDoctor.phoneNumber}\n📅 Time: ${new Date(booking.bookingTime).toLocaleString()}\n\nYour booking reference: ${booking.id}\nThe doctor will contact you soon.`,
          patientId: patient?.id,
          doctorId: assignedDoctor.id,
          bookingId: booking.id,
          isResponse: false
        };

        await flowService.createMessageWithFlow(appointmentMessage);
        console.log('✅ Appointment confirmation message and booking created');
      } catch (bkErr) {
        console.error('❌ Failed to create booking or appointment message:', bkErr);
      }
    } else {
      // No doctors available
      const noDocMessage = {
        userPhone: userPhone,
        messageType: 'text',
        content: `⚠️ Sorry, no doctors are currently available for ${specialization}. Please try again later or contact our reception.`,
        patientId: patient?.id,
        isResponse: false
      };

      await flowService.createMessageWithFlow(noDocMessage);
    }
  } catch (error) {
    console.error('❌ Error processing appointment flow:', error);
  }
}

/**
 * Process symptom checker flow
 */
async function processSymptomFlow(formData, userPhone) {
  try {
    console.log('🩺 Processing symptom checker flow');

    const symptoms = formData.symptoms || [];
    const urgency = formData.urgency || 'normal';

    // Find or get patient
    let patient = await patientService.getPatientByPhone(userPhone);
    
    // Add symptoms to medical history if patient exists
    if (patient && symptoms.length > 0) {
      const historyEntry = {
        type: 'symptom_report',
        symptoms: symptoms,
        urgency: urgency,
        reportedVia: 'whatsapp_flow',
        needsFollowUp: urgency === 'urgent'
      };

      await patientService.addMedicalHistory(patient.id, historyEntry);
      console.log('✅ Symptoms added to patient medical history');
    }

    // Determine response based on urgency
    let responseMessage = '';
    if (urgency === 'urgent') {
      responseMessage = `🚨 URGENT: Based on your symptoms, please seek immediate medical attention. Call emergency services or visit the nearest hospital.\n\n📞 Emergency: 911\n🏥 Hospital: [Hospital Address]`;
    } else {
      responseMessage = `🩺 Thank you for reporting your symptoms. Based on your input:\n\n${symptoms.map(s => `• ${s}`).join('\n')}\n\nWe recommend scheduling an appointment with a doctor. Would you like to book an appointment now?`;
    }

    const symptomResponseMessage = {
      userPhone: userPhone,
      messageType: 'text',
      content: responseMessage,
      patientId: patient?.id,
      isResponse: false
    };

    await flowService.createMessageWithFlow(symptomResponseMessage);
    console.log('✅ Symptom response message created');
  } catch (error) {
    console.error('❌ Error processing symptom flow:', error);
  }
}

/**
 * Process patient registration flow
 */
async function processRegistrationFlow(formData, userPhone) {
  try {
    console.log('📝 Processing patient registration flow');

    const patientData = {
      name: formData.name || formData.full_name,
      phoneNumber: userPhone,
      email: formData.email,
      dateOfBirth: formData.date_of_birth || formData.dob,
      gender: formData.gender,
      address: formData.address,
      emergencyContact: {
        name: formData.emergency_contact_name,
        phoneNumber: formData.emergency_contact_phone,
        relationship: formData.emergency_contact_relationship
      }
    };

    // Check if patient already exists
    let patient = await patientService.getPatientByPhone(userPhone);
    
    if (patient) {
      // Update existing patient
      patient = await patientService.updatePatient(patient.id, patientData);
      console.log('✅ Updated existing patient:', patient.name);
    } else {
      // Create new patient
      patient = await patientService.createPatient(patientData);
      console.log('✅ Created new patient:', patient.name);
    }

    const registrationMessage = {
      userPhone: userPhone,
      messageType: 'text',
      content: `✅ Registration Complete!\n\n👤 Name: ${patient.name}\n📞 Phone: ${patient.phoneNumber}\n📧 Email: ${patient.email || 'Not provided'}\n\nYour patient profile has been ${patient.id ? 'updated' : 'created'}. You can now book appointments and access our services.`,
      patientId: patient.id,
      isResponse: false
    };

    await flowService.createMessageWithFlow(registrationMessage);
    console.log('✅ Registration confirmation message created');
    // Send welcome interactive menu after registration completes
    try {
      const welcomeMsg = messageLibraryService.getMessageById('msg_welcome_interactive');
      if (welcomeMsg && welcomeMsg.status === 'published') {
        try {
          const sendResult = await messageLibraryService.sendLibraryMessage(welcomeMsg, userPhone);
          console.log('📤 Sent welcome interactive message after registration to', userPhone, 'response:', sendResult.data || sendResult);
        } catch (sendErr) {
          console.error('⚠️ Failed to send welcome message after registration. Error detail:', sendErr.response?.data || sendErr.message || sendErr);
        }
      }
    } catch (err) {
      console.error('⚠️ Failed to send welcome message after registration:', err.message || err);
    }
  } catch (error) {
    console.error('❌ Error processing registration flow:', error);
  }
}

/**
 * Handle message status updates (delivery, read, etc.)
 */
function handleMessageStatus(status) {
  console.log('📊 Message status update:', {
    messageId: status.id,
    recipientId: status.recipient_id,
    status: status.status,
    timestamp: status.timestamp
  });
}

/**
 * Simulate webhook for testing
 */
async function simulateWebhook(testMessage, phoneNumber) {
  const mockPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-entry',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: process.env.WHATSAPP_PHONE_NUMBER_ID || '15550617327',
            phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '158282837372377'
          },
          messages: [{
            id: `test-message-${Date.now()}`,
            from: phoneNumber,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: { body: testMessage },
            type: 'text'
          }]
        }
      }]
    }]
  };

  console.log('🧪 Simulating webhook with test payload');
  await processWebhookPayload(mockPayload);
  
  return {
    success: true,
    message: 'Test webhook processed successfully',
    testMessage,
    phoneNumber,
    timestamp: new Date().toISOString()
  };
}

/**
 * Simulate interactive webhook for testing button/list responses
 */
async function simulateInteractiveWebhook(interactiveData, phoneNumber) {
  const mockPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-entry',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: process.env.WHATSAPP_PHONE_NUMBER_ID || '15550617327',
            phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '158282837372377'
          },
          messages: [{
            id: `test-interactive-${Date.now()}`,
            from: phoneNumber,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'interactive',
            interactive: interactiveData
          }]
        }
      }]
    }]
  };

  console.log('🧪 Simulating interactive webhook with test payload');
  await processWebhookPayload(mockPayload);
  
  return {
    success: true,
    message: 'Test interactive webhook processed successfully',
    interactiveData,
    phoneNumber,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  processWebhookPayload,
  handleIncomingMessage,
  handleInteractiveResponse,
  handleFlowResponse,
  handleMessageStatus,
  simulateWebhook,
  simulateInteractiveWebhook,
  processFlowByType,
  processAppointmentFlow,
  processSymptomFlow,
  processRegistrationFlow
};