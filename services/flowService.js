const { db } = require('../config/firebase');

class FlowService {
  constructor() {
    this.flowsCollection = db.collection('flows');
    this.flowResponsesCollection = db.collection('flowResponses');
    this.messagesCollection = db.collection('messages');
  }

  // Create a new flow
  async createFlow(flowData) {
    try {
      const flow = {
        ...flowData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        version: 1
      };

      const docRef = await this.flowsCollection.add(flow);
      return { id: docRef.id, ...flow };
    } catch (error) {
      console.error('Error creating flow:', error);
      throw error;
    }
  }

  // Get flow by ID
  async getFlowById(flowId) {
    try {
      const doc = await this.flowsCollection.doc(flowId).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting flow:', error);
      throw error;
    }
  }

  // Update flow
  async updateFlow(flowId, updateData) {
    try {
      const currentFlow = await this.getFlowById(flowId);
      if (!currentFlow) {
        throw new Error('Flow not found');
      }

      const updatePayload = {
        ...updateData,
        updatedAt: new Date(),
        version: currentFlow.version + 1
      };

      await this.flowsCollection.doc(flowId).update(updatePayload);
      return await this.getFlowById(flowId);
    } catch (error) {
      console.error('Error updating flow:', error);
      throw error;
    }
  }

  // Get all flows
  async getAllFlows() {
    try {
      const snapshot = await this.flowsCollection
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      const flows = [];
      snapshot.forEach(doc => {
        flows.push({ id: doc.id, ...doc.data() });
      });

      return flows;
    } catch (error) {
      console.error('Error getting all flows:', error);
      throw error;
    }
  }

  // Create flow response
  async createFlowResponse(responseData) {
    try {
      const flowResponse = {
        ...responseData,
        createdAt: new Date(),
        status: 'received'
      };

      const docRef = await this.flowResponsesCollection.add(flowResponse);
      return { id: docRef.id, ...flowResponse };
    } catch (error) {
      console.error('Error creating flow response:', error);
      throw error;
    }
  }

  // Get flow responses by flow ID
  async getFlowResponsesByFlowId(flowId) {
    try {
      const snapshot = await this.flowResponsesCollection
        .where('flowId', '==', flowId)
        .orderBy('createdAt', 'desc')
        .get();

      const responses = [];
      snapshot.forEach(doc => {
        responses.push({ id: doc.id, ...doc.data() });
      });

      return responses;
    } catch (error) {
      console.error('Error getting flow responses:', error);
      throw error;
    }
  }

  // Get flow responses by user phone
  async getFlowResponsesByUser(phoneNumber) {
    try {
      const snapshot = await this.flowResponsesCollection
        .where('userPhone', '==', phoneNumber)
        .orderBy('createdAt', 'desc')
        .get();

      const responses = [];
      snapshot.forEach(doc => {
        responses.push({ id: doc.id, ...doc.data() });
      });

      return responses;
    } catch (error) {
      console.error('Error getting user flow responses:', error);
      throw error;
    }
  }

  // Create message with flow connection
  async createMessageWithFlow(messageData) {
    try {
      const message = {
        ...messageData,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'sent'
      };

      const docRef = await this.messagesCollection.add(message);
      return { id: docRef.id, ...message };
    } catch (error) {
      console.error('Error creating message with flow:', error);
      throw error;
    }
  }

  // Get messages by flow ID
  async getMessagesByFlowId(flowId) {
    try {
      const snapshot = await this.messagesCollection
        .where('flowId', '==', flowId)
        .orderBy('createdAt', 'desc')
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });

      return messages;
    } catch (error) {
      console.error('Error getting messages by flow ID:', error);
      throw error;
    }
  }

  // Get messages by user phone
  async getMessagesByUser(phoneNumber) {
    try {
      const snapshot = await this.messagesCollection
        .where('userPhone', '==', phoneNumber)
        .orderBy('createdAt', 'desc')
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });

      return messages;
    } catch (error) {
      console.error('Error getting messages by user:', error);
      throw error;
    }
  }

  // Process flow response and trigger next action
  async processFlowResponse(responseData) {
    try {
      // Save the response
      const flowResponse = await this.createFlowResponse(responseData);

      // Get the flow to determine next action
      const flow = await this.getFlowById(responseData.flowId);
      if (!flow) {
        throw new Error('Flow not found');
      }

      // Process based on flow logic
      const nextAction = this.determineNextAction(flow, responseData);
      
      if (nextAction) {
        // Execute next action (send message, trigger another flow, etc.)
        await this.executeNextAction(nextAction, responseData);
      }

      return flowResponse;
    } catch (error) {
      console.error('Error processing flow response:', error);
      throw error;
    }
  }

  // Determine next action based on flow logic
  determineNextAction(flow, responseData) {
    try {
      const flowJson = flow.flowJson;
      const userResponse = responseData.response;

      // Simple flow logic - can be expanded based on your needs
      if (flowJson.screens && flowJson.screens.length > 0) {
        const currentScreen = flowJson.screens.find(screen => 
          screen.id === responseData.screenId
        );

        if (currentScreen && currentScreen.nextActions) {
          return currentScreen.nextActions.find(action => 
            action.condition === userResponse || action.condition === 'default'
          );
        }
      }

      return null;
    } catch (error) {
      console.error('Error determining next action:', error);
      return null;
    }
  }

  // Execute next action
  async executeNextAction(action, responseData) {
    try {
      switch (action.type) {
        case 'send_message':
          await this.createMessageWithFlow({
            userPhone: responseData.userPhone,
            messageType: 'text',
            content: action.message,
            flowId: responseData.flowId,
            isResponse: false
          });
          break;

        case 'trigger_flow':
          // Trigger another flow
          const nextFlow = await this.getFlowById(action.flowId);
          if (nextFlow) {
            await this.createMessageWithFlow({
              userPhone: responseData.userPhone,
              messageType: 'interactive',
              content: nextFlow.flowJson,
              flowId: action.flowId,
              isResponse: false
            });
          }
          break;

        case 'assign_doctor':
          // Logic to assign a doctor based on specialization
          const doctorService = require('./doctorService');
          const doctors = await doctorService.getDoctorsBySpecialization(action.specialization);
          if (doctors.length > 0) {
            // Assign first available doctor
            const assignedDoctor = doctors[0];
            await this.createMessageWithFlow({
              userPhone: responseData.userPhone,
              messageType: 'text',
              content: `You have been assigned to Dr. ${assignedDoctor.name}. Contact: ${assignedDoctor.phoneNumber}`,
              flowId: responseData.flowId,
              doctorId: assignedDoctor.id,
              isResponse: false
            });
          }
          break;

        default:
          console.log('Unknown action type:', action.type);
      }
    } catch (error) {
      console.error('Error executing next action:', error);
      throw error;
    }
  }

  // Delete flow (soft delete)
  async deleteFlow(flowId) {
    try {
      await this.flowsCollection.doc(flowId).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });
      return true;
    } catch (error) {
      console.error('Error deleting flow:', error);
      throw error;
    }
  }
}

module.exports = new FlowService();
