const axios = require('axios');
const doctorService = require('./doctorService');
const { db } = require('../config/firebase');

// Message Library Integration Service
class MessageLibraryService {
  constructor() {
    // This should point to your frontend's message library API
    // For now, we'll use in-memory storage similar to triggers
    this.messages = [
      // Interactive Button Messages
      {
        messageId: 'msg_welcome_interactive',
        name: 'Welcome - Interactive Menu',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Welcome to Hospital Services! 🏥',
          body: 'Hello! How can we assist you today? Please choose an option below:',
          footer: 'Powered by Hospital Management System',
          buttons: [
            {
              buttonId: 'btn_book_appointment',
              title: '📅 Book Appointment',
              triggerId: 'trigger_book_appointment',
              nextAction: 'send_message',
              targetMessageId: 'msg_book_interactive'
            },
            {
              buttonId: 'btn_lab_tests',
              title: '🧪 Lab Tests',
              triggerId: 'trigger_lab_tests',
              nextAction: 'send_message',
              targetMessageId: 'msg_lab_interactive'
            },
            {
              buttonId: 'btn_emergency',
              title: '🚨 Emergency',
              triggerId: 'trigger_emergency',
              nextAction: 'send_message',
              targetMessageId: 'msg_emergency'
            }
            ,
            {
              buttonId: 'btn_checkin',
              title: "📍 I've arrived",
              triggerId: 'trigger_checkin',
              nextAction: 'mark_arrived',
              targetMessageId: null
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // New or Existing selection shown when user says hi
      {
        messageId: 'msg_new_or_existing',
        name: 'New or Existing Patient?',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Welcome!',
          body: 'Are you a new patient or an existing patient? Please choose:',
          footer: 'We will help you accordingly',
          buttons: [
            {
              buttonId: 'btn_new_patient',
              title: 'New Patient',
              triggerId: 'trigger_new_patient',
              nextAction: 'send_message',
              targetMessageId: 'msg_new_patient_form'
            },
            {
              buttonId: 'btn_existing_patient',
              title: 'Existing Patient',
              triggerId: 'trigger_existing_patient',
              nextAction: 'send_message',
              targetMessageId: 'msg_existing_patient_select'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_new_patient_form',
        name: 'New Patient - Form',
        type: 'standard_text',
        status: 'published',
        contentPayload: {
          body: 'To register as a new patient please fill this form. Form ID: 1366099374850695'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_existing_patient_select',
        name: 'Select Existing Patient',
        type: 'interactive_list',
        status: 'published',
        contentPayload: {
          header: 'Existing Patients',
          body: 'Select your name from the list:',
          footer: 'Your details will be loaded',
          buttonText: 'Choose Name',
          sections: [
            {
              title: 'Patients',
              rows: [
                // rows will be populated dynamically from Firestore
              ]
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_book_interactive',
        name: 'Book Appointment - Interactive',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Book Your Appointment 📅',
          body: 'Which type of appointment would you like to book?',
          footer: 'Select your preferred option',
          buttons: [
            {
              buttonId: 'btn_general_checkup',
              title: '👩‍⚕️ General Checkup',
              triggerId: 'trigger_general_checkup',
              nextAction: 'send_message',
              targetMessageId: 'msg_doctor_selection'
            },
            // Specialist option removed per request
            {
              buttonId: 'btn_back_main',
              title: '⬅️ Back to Main',
              triggerId: 'trigger_back_main',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_doctor_selection',
        name: 'Doctor Selection - Interactive',
        type: 'interactive_list',
        status: 'published',
        contentPayload: {
          header: 'Available Doctors 👩‍⚕️',
          body: 'Please select a doctor for your appointment:',
          footer: 'All doctors are available for booking',
          buttonText: 'Choose Doctor',
          sections: [
            {
              title: 'General Physicians',
              rows: [
                {
                  rowId: 'dr_sharma',
                  title: 'Dr. Sharma',
                  description: 'General Physician - Available Mon-Fri',
                  triggerId: 'trigger_dr_sharma',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_sharma_slots_interactive'
                },
                {
                  rowId: 'dr_patel',
                  title: 'Dr. Patel',
                  description: 'General Physician - Available Tue-Sat',
                  triggerId: 'trigger_dr_patel',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_patel_slots_interactive'
                }
              ]
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_sharma_slots_interactive',
        name: 'doctor selected',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Dr. Sharma - Available Slots 📅',
          body: 'Please select your preferred time slot:',
          footer: 'Consultation fee: ₹750',
          buttons: [
            {
              buttonId: 'btn_slot_930',
              title: '🕘 Mon 9:30 AM',
              triggerId: 'trigger_slot_930',
              nextAction: 'send_message',
              targetMessageId: 'msg_confirm_appointment'
            },
            {
              buttonId: 'btn_slot_4pm',
              title: '🕐 Wed 4:00 PM',
              triggerId: 'trigger_slot_4pm',
              nextAction: 'send_message',
              targetMessageId: 'msg_confirm_appointment'
            },
            {
              buttonId: 'btn_back_doctors',
              title: '⬅️ Back to Doctors',
              triggerId: 'trigger_back_doctors',
              nextAction: 'send_message',
              targetMessageId: 'msg_doctor_selection'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_confirm_appointment',
        name: 'Confirm Appointment - Interactive',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Confirm Your Appointment ✅',
          body: 'Appointment Details:\n👨‍⚕️ Dr. Sharma\n📅 Monday, Oct 14\n🕘 9:30 AM\n💰 Fee: ₹750\n\nWould you like to confirm and proceed to payment?',
          footer: 'You can reschedule if needed',
          buttons: [
            {
              buttonId: 'btn_confirm_pay',
              title: '✅ Confirm & Pay',
              triggerId: 'trigger_confirm_pay',
              nextAction: 'send_message',
              targetMessageId: 'msg_payment_link'
            },
            {
              buttonId: 'btn_reschedule',
              title: '🔄 Reschedule',
              triggerId: 'trigger_reschedule',
              nextAction: 'send_message',
              targetMessageId: 'msg_sharma_slots_interactive'
            },
            {
              buttonId: 'btn_cancel',
              title: '❌ Cancel',
              triggerId: 'trigger_cancel',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_payment_link',
        name: 'Payment Link - Interactive',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Payment Required 💳',
          body: 'Please complete your payment to confirm the appointment:\n\n💰 Amount: ₹750\n🏥 Dr. Sharma Consultation\n📅 Monday, Oct 14, 9:30 AM\n\n[Payment Link: https://pay.hospital.com/abc123]',
          footer: 'Secure payment powered by Razorpay',
          buttons: [
            {
              buttonId: 'btn_payment_done',
              title: '✅ Payment Completed',
              triggerId: 'trigger_payment_done',
              nextAction: 'send_message',
              targetMessageId: 'msg_appointment_confirmed'
            },
            {
              buttonId: 'btn_payment_help',
              title: '❓ Payment Help',
              triggerId: 'trigger_payment_help',
              nextAction: 'send_message',
              targetMessageId: 'msg_payment_support'
            },
            {
              buttonId: 'btn_cancel_payment',
              title: '❌ Cancel',
              triggerId: 'trigger_cancel_payment',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_appointment_confirmed',
        name: 'Appointment Confirmed - Interactive',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: 'Appointment Confirmed! 🎉',
          body: 'Your appointment has been successfully booked:\n\n🎫 Token: GM-015\n👨‍⚕️ Dr. Sharma\n📅 Monday, Oct 14\n🕘 9:30 AM\n🏥 Room 201, 2nd Floor\n\nPlease arrive 15 minutes early.',
          footer: 'Thank you for choosing our hospital',
          buttons: [
            {
              buttonId: 'btn_add_calendar',
              title: '📅 Add to Calendar',
              triggerId: 'trigger_add_calendar',
              nextAction: 'send_message',
              targetMessageId: 'msg_calendar_added'
            },
            {
              buttonId: 'btn_book_another',
              title: '➕ Book Another',
              triggerId: 'trigger_book_another',
              nextAction: 'send_message',
              targetMessageId: 'msg_book_interactive'
            },
            {
              buttonId: 'btn_main_menu',
              title: '🏠 Main Menu',
              triggerId: 'trigger_main_menu',
              nextAction: 'send_message',
              targetMessageId: 'msg_welcome_interactive'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_lab_interactive',
        name: 'Lab Tests - Interactive',
        type: 'interactive_list',
        status: 'published',
        contentPayload: {
          header: 'Laboratory Services 🧪',
          body: 'Choose the type of lab test you need:',
          footer: 'All tests include home collection option',
          buttonText: 'Select Test',
          sections: [
            {
              title: 'Common Tests',
              rows: [
                {
                  rowId: 'test_blood_sugar',
                  title: 'Blood Sugar Test',
                  description: 'Fasting & Random - ₹200',
                  triggerId: 'trigger_blood_sugar',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_blood_sugar_booking'
                },
                {
                  rowId: 'test_full_body',
                  title: 'Full Body Checkup',
                  description: 'Complete health screening - ₹1200',
                  triggerId: 'trigger_full_body',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_full_body_booking'
                }
              ]
            },
            {
              title: 'Specialized Tests',
              rows: [
                {
                  rowId: 'test_cardiac',
                  title: 'Cardiac Profile',
                  description: 'Heart health assessment - ₹800',
                  triggerId: 'trigger_cardiac',
                  nextAction: 'send_message',
                  targetMessageId: 'msg_cardiac_booking'
                }
              ]
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        messageId: 'msg_emergency',
        name: 'Emergency Services - Interactive',
        type: 'interactive_button',
        status: 'published',
        contentPayload: {
          header: '🚨 Emergency Services',
          body: 'This is for medical emergencies only. If this is a life-threatening situation, please call 108 immediately.\n\nFor non-emergency urgent care, choose an option:',
          footer: 'Emergency helpline: 108',
          buttons: [
            {
              buttonId: 'btn_urgent_care',
              title: '🏥 Urgent Care',
              triggerId: 'trigger_urgent_care',
              nextAction: 'send_message',
              targetMessageId: 'msg_urgent_care_info'
            },
            {
              buttonId: 'btn_ambulance',
              title: '🚑 Book Ambulance',
              triggerId: 'trigger_ambulance',
              nextAction: 'send_message',
              targetMessageId: 'msg_ambulance_booking'
            },
            {
              buttonId: 'btn_call_emergency',
              title: '📞 Call Emergency',
              triggerId: 'trigger_call_emergency',
              nextAction: 'send_message',
              targetMessageId: 'msg_emergency_contact'
            }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    // Enhanced triggers with button support
    this.triggers = [
      // Button-based triggers for interactive messages
      {
        triggerId: 'trigger_book_appointment',
        triggerType: 'button_click',
        triggerValue: 'btn_book_appointment',
        nextAction: 'send_message',
        targetId: 'msg_book_interactive',
        messageId: 'msg_book_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_lab_tests',
        triggerType: 'button_click',
        triggerValue: 'btn_lab_tests',
        nextAction: 'send_message',
        targetId: 'msg_lab_interactive',
        messageId: 'msg_lab_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_emergency',
        triggerType: 'button_click',
        triggerValue: 'btn_emergency',
        nextAction: 'send_message',
        targetId: 'msg_emergency',
        messageId: 'msg_emergency',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_general_checkup',
        triggerType: 'button_click',
        triggerValue: 'btn_general_checkup',
        nextAction: 'send_message',
        targetId: 'msg_doctor_selection',
        messageId: 'msg_doctor_selection',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_dr_sharma',
        triggerType: 'list_selection',
        triggerValue: 'dr_sharma',
        nextAction: 'send_message',
        targetId: 'msg_sharma_slots_interactive',
        messageId: 'msg_sharma_slots_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_slot_930',
        triggerType: 'button_click',
        triggerValue: 'btn_slot_930',
        nextAction: 'send_message',
        targetId: 'msg_confirm_appointment',
        messageId: 'msg_confirm_appointment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_slot_4pm',
        triggerType: 'button_click',
        triggerValue: 'btn_slot_4pm',
        nextAction: 'send_message',
        targetId: 'msg_confirm_appointment',
        messageId: 'msg_confirm_appointment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_reschedule',
        triggerType: 'button_click',
        triggerValue: 'btn_reschedule',
        nextAction: 'send_message',
        targetId: 'msg_sharma_slots_interactive',
        messageId: 'msg_sharma_slots_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Back to Doctors button mapping - resend the doctor selection list
      {
        triggerId: 'trigger_back_doctors',
        triggerType: 'button_click',
        triggerValue: 'btn_back_doctors',
        nextAction: 'send_message',
        targetId: 'msg_doctor_selection',
        messageId: 'msg_doctor_selection',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_confirm_pay',
        triggerType: 'button_click',
        triggerValue: 'btn_confirm_pay',
        nextAction: 'send_message',
        targetId: 'msg_payment_link',
        messageId: 'msg_payment_link',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_payment_done',
        triggerType: 'button_click',
        triggerValue: 'btn_payment_done',
        nextAction: 'send_message',
        targetId: 'msg_appointment_confirmed',
        messageId: 'msg_appointment_confirmed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_main_menu',
        triggerType: 'button_click',
        triggerValue: 'btn_main_menu',
        nextAction: 'send_message',
        targetId: 'msg_welcome_interactive',
        messageId: 'msg_welcome_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // New / Existing patient button triggers
      {
        triggerId: 'trigger_new_patient',
        triggerType: 'button_click',
        triggerValue: 'btn_new_patient',
        // Start the WhatsApp Flow when user chooses New Patient
        nextAction: 'start_flow',
        // Use the flow id you requested
        targetId: '1366099374850695',
        messageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_existing_patient',
        triggerType: 'button_click',
        triggerValue: 'btn_existing_patient',
        nextAction: 'send_message',
        targetId: 'msg_existing_patient_select',
        messageId: 'msg_existing_patient_select',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Keyword-based triggers - Updated to use interactive messages
      {
        triggerId: 'trigger_hi',
        triggerType: 'keyword_match',
        triggerValue: ['hi', 'hello', 'hey', 'start', 'menu'],
        nextAction: 'send_message',
        targetId: 'msg_new_or_existing',
        messageId: 'msg_new_or_existing',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Check-in button trigger
      {
        triggerId: 'trigger_checkin',
        triggerType: 'button_click',
        triggerValue: 'btn_checkin',
        nextAction: 'mark_arrived',
        targetId: null,
        messageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Keyword fallback: user can type 'arrived' or similar
      {
        triggerId: 'trigger_arrived',
        triggerType: 'keyword_match',
        triggerValue: ['arrived', 'i arrived', 'here', 'i am here'],
        nextAction: 'mark_arrived',
        targetId: null,
        messageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      ,
      {
        triggerId: 'trigger_help',
        triggerType: 'keyword_match',
        triggerValue: ['help', 'support', 'assist'],
        nextAction: 'send_message',
        targetId: 'msg_welcome_interactive',
        messageId: 'msg_welcome_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      ,
      // Prescription payment buttons
      {
        triggerId: 'trigger_prescription_pay_now',
        triggerType: 'button_click',
        triggerValue: 'btn_prescription_pay_now',
        nextAction: 'send_message',
        targetId: 'msg_payment_link',
        messageId: 'msg_payment_link',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        triggerId: 'trigger_prescription_pay_later',
        triggerType: 'button_click',
        triggerValue: 'btn_prescription_pay_later',
        nextAction: 'send_message',
        targetId: 'msg_welcome_interactive',
        messageId: 'msg_welcome_interactive',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }

  // Get all published messages
  getPublishedMessages() {
    return this.messages.filter(msg => msg.status === 'published');
  }

  // Get message by ID
  getMessageById(messageId) {
    return this.messages.find(msg => msg.messageId === messageId);
  }

  // Find matching triggers for a message
  findMatchingTriggers(messageText) {
    const normalizedText = messageText.toLowerCase().trim();
    
    return this.triggers.filter(trigger => {
      if (trigger.triggerType === 'keyword_match') {
        const keywords = Array.isArray(trigger.triggerValue) 
          ? trigger.triggerValue 
          : [trigger.triggerValue];
        
        return keywords.some(keyword => 
          normalizedText.includes(keyword.toLowerCase())
        );
      }
      return false;
    });
  }

  // Find matching triggers for button interactions
  findButtonTrigger(buttonId) {
    // Debug: list candidate triggers that are button_click
    try {
      const candidates = this.triggers.filter(t => t.triggerType === 'button_click');
      const sample = candidates.slice(0, 10).map(c => ({ triggerId: c.triggerId, triggerValue: c.triggerValue }));
      console.log('🔍 findButtonTrigger - buttonId:', buttonId, 'candidatesSample:', sample.length ? sample : 'none');
    } catch (e) {
      console.warn('🔍 findButtonTrigger debug failed:', e?.message || e);
    }

    const found = this.triggers.find(trigger => 
      trigger.triggerType === 'button_click' && 
      trigger.triggerValue === buttonId
    );

    if (found) {
      console.log('🔍 findButtonTrigger - matched:', { triggerId: found.triggerId, triggerValue: found.triggerValue });
    } else {
      console.log('🔍 findButtonTrigger - no exact match for buttonId:', buttonId);
    }

    return found;
  }

  // Find matching triggers for list selections
  findListTrigger(listItemId) {
    return this.triggers.find(trigger => 
      trigger.triggerType === 'list_selection' && 
      trigger.triggerValue === listItemId
    );
  }

  // Process interactive message response
  processInteractiveResponse(interactiveData) {
    let matchingTrigger = null;
    
    if (interactiveData.type === 'button_reply') {
      matchingTrigger = this.findButtonTrigger(interactiveData.button_reply.id);
    } else if (interactiveData.type === 'list_reply') {
      matchingTrigger = this.findListTrigger(interactiveData.list_reply.id);
    }
    
    if (matchingTrigger) {
      console.log(`🎯 Found interactive trigger: ${matchingTrigger.triggerId} for ${interactiveData.type}`);
      return {
        trigger: matchingTrigger,
        nextMessage: this.getMessageById(matchingTrigger.targetId)
      };
    }
    
    console.log(`📝 No matching trigger found for interactive response:`, interactiveData);
    return null;
  }

  // Get button information from a message
  getMessageButtons(messageId) {
    const message = this.getMessageById(messageId);
    if (!message || !message.contentPayload.buttons) {
      return [];
    }
    
    return message.contentPayload.buttons.map(button => ({
      buttonId: button.buttonId,
      title: button.title,
      triggerId: button.triggerId,
      nextAction: button.nextAction,
      targetMessageId: button.targetMessageId
    }));
  }

  // Get list options from a message
  getMessageListOptions(messageId) {
    const message = this.getMessageById(messageId);
    if (!message || !message.contentPayload.sections) {
      return [];
    }
    
    const options = [];
    message.contentPayload.sections.forEach(section => {
      section.rows.forEach(row => {
        options.push({
          rowId: row.rowId,
          title: row.title,
          description: row.description,
          triggerId: row.triggerId,
          nextAction: row.nextAction,
          targetMessageId: row.targetMessageId
        });
      });
    });
    
    return options;
  }

  // Send message using WhatsApp API
  async sendLibraryMessage(messageEntry, recipientPhone) {
    // Allow dynamic enrichment of certain messages from Firestore
    try {
      messageEntry = await this.buildDynamicMessage(messageEntry);
    } catch (err) {
      console.error('Error enriching messageEntry with dynamic data:', err);
    }
    // If this is the confirm appointment template, force the header to the static confirm header
    try {
      if (messageEntry && messageEntry.messageId === 'msg_confirm_appointment') {
        messageEntry.contentPayload = messageEntry.contentPayload || {};
        messageEntry.contentPayload.header = 'Confirm Your Appointment ✅';
      }
    } catch (e) {
      console.warn('Failed to enforce static confirm header:', e?.message || e);
    }
    // If this is a confirm-appointment style message and header is set, ensure the body reflects the header
    try {
      if (messageEntry && messageEntry.contentPayload && messageEntry.contentPayload.header && messageEntry.contentPayload.body) {
        const nameHeader = String(messageEntry.contentPayload.header).trim();
        const bodyStr = String(messageEntry.contentPayload.body);
          // Only perform replacement when header itself appears to contain a doctor's name (contains 'Dr')
          if (nameHeader && /Dr\.?\s*/i.test(nameHeader) && /Dr\.?\s+[^\n\r]*/i.test(bodyStr)) {
          try {
            // If header contains extra suffix (e.g., 'Dr. X - Available Slots 📅'), extract only the doctor portion
            let doctorOnly = nameHeader;
            if (doctorOnly.includes(' - ')) {
              doctorOnly = doctorOnly.split(' - ')[0].trim();
            } else if (doctorOnly.includes('\n')) {
              doctorOnly = doctorOnly.split('\n')[0].trim();
            }
            const replaced = bodyStr.replace(/Dr\.?\s+[^\n\r]*/i, doctorOnly);
            messageEntry.contentPayload.body = replaced;
            console.log('ℹ️ Confirm body doctor name replaced with header (doctor-only):', doctorOnly);
          } catch (e) {
            console.warn('Could not replace doctor name in confirm body:', e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn('Error during confirm-body injection:', e?.message || e);
    }
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      throw new Error('Missing WhatsApp API credentials');
    }

    const apiUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    
    let messagePayload;

    switch (messageEntry.type) {
      case 'standard_text':
        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: messageEntry.contentPayload.body
          }
        };
        break;

      case 'interactive_button':
        const payload = messageEntry.contentPayload;
        const interactive = {
          type: 'button',
          body: { text: payload.body || '' },
          action: {
            buttons: (payload.buttons || []).slice(0, 3).map(btn => ({
              type: 'reply',
              reply: {
                id: btn.buttonId || btn.id,
                title: btn.title
              }
            }))
          }
        };

        if (payload.header) {
          interactive.header = { type: 'text', text: payload.header };
        }
        if (payload.footer) {
          interactive.footer = { text: payload.footer };
        }

        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'interactive',
          interactive
        };
        break;

      case 'interactive_list':
        const listPayload = messageEntry.contentPayload;
        const listInteractive = {
          type: 'list',
          body: { text: listPayload.body || '' },
          action: {
            button: listPayload.buttonText || 'View Options',
            sections: (listPayload.sections || []).map(section => ({
              title: section.title,
              rows: (section.rows || []).map(row => ({
                id: row.rowId || row.id,
                title: row.title,
                description: row.description
              }))
            }))
          }
        };

        if (listPayload.header) {
          listInteractive.header = { type: 'text', text: listPayload.header };
        }
        if (listPayload.footer) {
          listInteractive.footer = { text: listPayload.footer };
        }

        messagePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'interactive',
          interactive: listInteractive
        };
        break;

      default:
        throw new Error(`Unsupported message type: ${messageEntry.type}`);
    }

    try {
      console.log('📤 Sending message via WhatsApp API:', {
        type: messageEntry.type,
        to: recipientPhone,
        messageId: messageEntry.messageId
      });
      // Detailed payload preview for debugging (avoid logging sensitive tokens)
      try {
        // Deep-clone the payload for logging so we don't accidentally mutate the real payload
        const preview = JSON.parse(JSON.stringify(messagePayload));
        if (preview.interactive && preview.interactive.body && typeof preview.interactive.body === 'object') {
          // keep only the text property preview
          if (preview.interactive.body.text) preview.interactive.body.text = String(preview.interactive.body.text).slice(0, 800);
        } else if (preview.interactive && preview.interactive.body) {
          preview.interactive.body = String(preview.interactive.body).slice(0, 800);
        }
        if (preview.text && preview.text.body) preview.text.body = String(preview.text.body).slice(0, 800);
        console.log('📦 WhatsApp API payload preview:', preview);
      } catch (e) {
        console.warn('Could not log WhatsApp payload preview:', e?.message || e);
      }

      // Final safety: if this is an interactive payload and header/body mismatch exists,
      // prefer the header as the source-of-truth and replace the first 'Dr. <name>' occurrence in the body.
      try {
        if (messagePayload && messagePayload.type === 'interactive' && messagePayload.interactive) {
          const headerText = messagePayload.interactive.header?.text || (messageEntry && messageEntry.contentPayload && messageEntry.contentPayload.header) || null;
          const bodyText = messagePayload.interactive.body && (typeof messagePayload.interactive.body === 'object' ? messagePayload.interactive.body.text : messagePayload.interactive.body);
          // Only normalize when header appears to contain a doctor's name (e.g., 'Dr. Smith')
          if (headerText && /Dr\.?\s+/i.test(String(headerText)) && bodyText && /Dr\.?\s+/i.test(bodyText)) {
              const replacedBody = String(bodyText).replace(/Dr\.?\s+[^\n\r]*/i, String(headerText));
            if (messagePayload.interactive.body && typeof messagePayload.interactive.body === 'object') {
              messagePayload.interactive.body.text = replacedBody;
            } else {
              messagePayload.interactive.body = replacedBody;
            }
            console.log('🔧 Normalized interactive body to match header before send:', { header: headerText });
          }
        }
      } catch (e) {
        console.warn('Could not normalize interactive body to header:', e?.message || e);
      }

      const response = await axios.post(apiUrl, messagePayload, {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Message sent successfully:', response.data);
      return { success: true, data: response.data };

    } catch (error) {
      console.error('❌ Failed to send message:', error.response?.data || error.message);
      throw new Error(`Failed to send message: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Add a new message (for API integration)
  addMessage(messageData) {
    const newMessage = {
      messageId: `msg_${Date.now()}`,
      ...messageData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.messages.push(newMessage);
    return newMessage;
  }

  // Add a new trigger (for API integration)
  addTrigger(triggerData) {
    const newTrigger = {
      triggerId: `trigger_${Date.now()}`,
      ...triggerData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.triggers.push(newTrigger);
    return newTrigger;
  }

  // Build dynamic message content by fetching from Firestore where applicable
  async buildDynamicMessage(messageEntry) {
    // Clone to avoid mutating original
    const entry = JSON.parse(JSON.stringify(messageEntry));

    // If this is the doctor selection list, fetch doctors from Firestore
    if (entry.messageId === 'msg_doctor_selection' || entry.name?.toLowerCase().includes('doctor')) {
      try {
        // seed script may not set isActive; fetch all and filter out explicit false
        const doctorsSnapshot = await db.collection('doctors').get();
        const rows = [];
        doctorsSnapshot.forEach(doc => {
          const d = doc.data();
          // include if isActive is missing or truthy
          if (d.hasOwnProperty('isActive') && d.isActive === false) return;
          rows.push({
            rowId: doc.id,
            title: d.name || 'Unknown',
            description: d.specialization ? `${d.specialization}` : (d.description || ''),
            triggerId: `trigger_dr_${doc.id}`,
            nextAction: 'send_message',
            targetMessageId: 'msg_sharma_slots_interactive'
          });
        });

        if (entry.contentPayload && entry.contentPayload.sections && entry.contentPayload.sections.length) {
          entry.contentPayload.sections[0].rows = rows;
        } else {
          entry.contentPayload = entry.contentPayload || {};
          entry.contentPayload.sections = [{ title: 'Doctors', rows }];
        }

        // Register corresponding list-selection triggers for each doctor row so selections are handled
        try {
          rows.forEach(r => {
            const existing = this.triggers.find(t => t.triggerType === 'list_selection' && t.triggerValue === r.rowId);
            if (!existing) {
              const newTrig = {
                triggerId: `trigger_${r.rowId}`,
                triggerType: 'list_selection',
                triggerValue: r.rowId,
                nextAction: r.nextAction || 'send_message',
                targetId: r.targetMessageId || r.targetMessageId,
                messageId: r.targetMessageId || r.targetMessageId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              this.triggers.push(newTrig);
            }
          });
        } catch (err) {
          console.error('Failed to register dynamic triggers for doctors:', err);
        }
      } catch (err) {
        console.error('Failed to load doctors from Firestore:', err.message || err);
      }
    }

    // If this is the lab list, fetch labs
    if (entry.messageId === 'msg_lab_interactive' || entry.name?.toLowerCase().includes('lab')) {
      try {
        const labsSnapshot = await db.collection('labs').get();
        const rows = [];
        labsSnapshot.forEach(doc => {
          const l = doc.data();
          rows.push({
            rowId: doc.id,
            title: l.name || 'Lab Test',
            description: l.description || '',
            triggerId: `trigger_lab_${doc.id}`,
            nextAction: 'send_message',
            targetMessageId: 'msg_blood_sugar_booking'
          });
        });

        entry.contentPayload = entry.contentPayload || {};
        entry.contentPayload.sections = [{ title: 'Lab Tests', rows }];
      } catch (err) {
        console.error('Failed to load labs from Firestore:', err.message || err);
      }
    }

    // If this is the existing patient selection, fetch patients and register triggers
    if (entry.messageId === 'msg_existing_patient_select' || entry.name?.toLowerCase().includes('existing patient')) {
      try {
        const patientsSnapshot = await db.collection('patients').get();
        const rows = [];
        patientsSnapshot.forEach(doc => {
          const p = doc.data();
          // skip if marked inactive
          if (p.hasOwnProperty('isActive') && p.isActive === false) return;
          rows.push({
            rowId: doc.id,
            title: p.name || 'Unknown',
            description: p.phoneNumber || '',
            triggerId: `trigger_patient_${doc.id}`,
            nextAction: 'send_message',
            targetMessageId: 'msg_welcome_interactive'
          });
        });

        if (entry.contentPayload && entry.contentPayload.sections && entry.contentPayload.sections.length) {
          entry.contentPayload.sections[0].rows = rows;
        } else {
          entry.contentPayload = entry.contentPayload || {};
          entry.contentPayload.sections = [{ title: 'Patients', rows }];
        }

        // register triggers for patient selection
        try {
          rows.forEach(r => {
            const existing = this.triggers.find(t => t.triggerType === 'list_selection' && t.triggerValue === r.rowId);
            if (!existing) {
              const newTrig = {
                triggerId: `trigger_patient_${r.rowId}`,
                triggerType: 'list_selection',
                triggerValue: r.rowId,
                nextAction: 'send_message',
                targetId: r.targetMessageId,
                messageId: r.targetMessageId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              this.triggers.push(newTrig);
            }
          });
        } catch (err) {
          console.error('Failed to register patient selection triggers:', err);
        }
      } catch (err) {
        console.error('Failed to load patients from Firestore:', err.message || err);
      }
    }

    return entry;
  }
}

module.exports = new MessageLibraryService();
