const axios = require('axios');

/**
 * WhatsApp Business API Service
 */
class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    
    if (!this.accessToken) {
      console.warn('⚠️  WhatsApp access token not configured');
    }
    if (!this.phoneNumberId) {
      console.warn('⚠️  WhatsApp phone number ID not configured');
    }
  }

  /**
   * Test WhatsApp API connection
   */
  async testConnection() {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
    }

    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return {
        success: true,
        phoneNumber: response.data.display_phone_number,
        verifiedName: response.data.verified_name,
        status: 'connected'
      };
    } catch (error) {
      console.error('WhatsApp connection test failed:', error.response?.data || error.message);
      throw new Error(`WhatsApp API connection failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Send flow message to a phone number - FIXED VERSION
   */
  async sendFlowMessage(phoneNumber, flowId, message = 'Please complete this form:', flowToken = null) {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
    }

    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
      
      // Determine flow token up-front to avoid referencing payload during construction
      const effectiveFlowToken = flowToken || `flow_token_${Date.now()}`;

      // CORRECTED WhatsApp Flow message format
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: {
            type: 'text',
            text: 'Complete Form'
          },
          body: {
            text: message
          },
          footer: {
            text: 'Powered by WhatsApp Flows'
          },
              action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
                  flow_token: effectiveFlowToken,
                  flow_id: flowId,
              flow_cta: 'Open Form',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'RECOMMEND',
                data: {
                  user_name: '',
                  user_phone: phoneNumber,
                  form_type: 'registration',
                      flow_id: flowId,
                      flow_token: effectiveFlowToken,
                  timestamp: new Date().toISOString()
                }
              }
            }
          }
        }
      };

      console.log(`📤 Sending flow message to ${phoneNumber}:`, {
        flowId,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Flow message sent successfully:', {
        messageId: response.data.messages?.[0]?.id,
        phoneNumber,
        flowId
      });

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        phoneNumber,
        flowId,
        flowToken: effectiveFlowToken,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error sending flow message:', error.response?.data || error.message);
      
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;
      
      throw new Error(`Failed to send flow message: ${errorMessage} (Code: ${errorCode})`);
    }
  }

  /**
   * Send simple text message
   */
  async sendTextMessage(phoneNumber, text) {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
    }

    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: text
        }
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        phoneNumber,
        text,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error sending text message:', error.response?.data || error.message);
      throw new Error(`Failed to send text message: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

// Create service instance
const whatsappService = new WhatsAppService();

/**
 * Send flow message (exported function)
 */
async function sendFlowMessage(phoneNumber, flowId, message) {
  // allow optional fourth parameter flowToken
  const flowToken = arguments.length > 3 ? arguments[3] : null;
  return await whatsappService.sendFlowMessage(phoneNumber, flowId, message, flowToken);
}

/**
 * Send text message (exported function)
 */
async function sendTextMessage(phoneNumber, text) {
  return await whatsappService.sendTextMessage(phoneNumber, text);
}

/**
 * Test WhatsApp connection (exported function)
 */
async function testWhatsAppConnection() {
  return await whatsappService.testConnection();
}

module.exports = {
  WhatsAppService,
  sendFlowMessage,
  sendTextMessage,
  testWhatsAppConnection,
  whatsappService
};