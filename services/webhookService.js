const { sendFlowMessage } = require('./whatsappService');
const flowService = require('./flowService');
const { findMatchingTrigger } = require('./triggerService');
const messageLibraryService = require('./messageLibraryService');
const patientService = require('./patientService');
const doctorService = require('./doctorService');

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
    
    const result = messageLibraryService.processInteractiveResponse(message.interactive);

    if (result && result.trigger) {
      const trigger = result.trigger;
      // If trigger asks to send a library message
      if (trigger.nextAction === 'send_message' && result.nextMessage) {
        console.log(`📤 Sending next message: "${result.nextMessage.name}" to ${message.from}`);
        try {
          await messageLibraryService.sendLibraryMessage(result.nextMessage, message.from);
          console.log(`✅ Successfully sent interactive response message to ${message.from}`);
        } catch (error) {
          console.error(`❌ Failed to send interactive response message:`, error.message);
        }
        return;
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

        // Send confirmation text to user
        try {
          const { sendTextMessage } = require('./whatsappService');
          await sendTextMessage(message.from, 'Thanks — we received your response and saved it.');
        } catch (err) {
          console.error('⚠️  Failed to send confirmation message to user:', err.message || err);
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
      
      // Create message with appointment details
      const appointmentMessage = {
        userPhone: userPhone,
        messageType: 'text',
        content: `🏥 Appointment Booked!\n\n👤 Patient: ${patientName}\n👨‍⚕️ Doctor: ${assignedDoctor.name}\n🏥 Department: ${assignedDoctor.specialization}\n📞 Contact: ${assignedDoctor.phoneNumber}\n\nYour appointment has been scheduled. The doctor will contact you soon.`,
        patientId: patient?.id,
        doctorId: assignedDoctor.id,
        isResponse: false
      };

      await flowService.createMessageWithFlow(appointmentMessage);
      console.log('✅ Appointment confirmation message created');
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