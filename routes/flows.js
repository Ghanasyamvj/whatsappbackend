const express = require('express');
const router = express.Router();
const flowService = require('../services/flowService');

// Create a new flow
router.post('/', async (req, res) => {
  try {
    const flowData = req.body;
    
    // Validate required fields
    if (!flowData.name || !flowData.flowJson) {
      return res.status(400).json({
        error: 'Name and flowJson are required'
      });
    }

    const flow = await flowService.createFlow(flowData);
    res.status(201).json({
      success: true,
      flow
    });
  } catch (error) {
    console.error('Error creating flow:', error);
    res.status(500).json({
      error: 'Failed to create flow',
      details: error.message
    });
  }
});

// Get flow by ID
router.get('/:id', async (req, res) => {
  try {
    const flow = await flowService.getFlowById(req.params.id);
    if (!flow) {
      return res.status(404).json({
        error: 'Flow not found'
      });
    }

    res.json({
      success: true,
      flow
    });
  } catch (error) {
    console.error('Error getting flow:', error);
    res.status(500).json({
      error: 'Failed to get flow',
      details: error.message
    });
  }
});

// Update flow
router.put('/:id', async (req, res) => {
  try {
    const flow = await flowService.updateFlow(req.params.id, req.body);
    if (!flow) {
      return res.status(404).json({
        error: 'Flow not found'
      });
    }

    res.json({
      success: true,
      flow
    });
  } catch (error) {
    console.error('Error updating flow:', error);
    res.status(500).json({
      error: 'Failed to update flow',
      details: error.message
    });
  }
});

// Get all flows
router.get('/', async (req, res) => {
  try {
    const flows = await flowService.getAllFlows();
    res.json({
      success: true,
      flows,
      count: flows.length
    });
  } catch (error) {
    console.error('Error getting flows:', error);
    res.status(500).json({
      error: 'Failed to get flows',
      details: error.message
    });
  }
});

// Create flow response
router.post('/responses', async (req, res) => {
  try {
    const responseData = req.body;
    
    // Validate required fields
    if (!responseData.flowId || !responseData.userPhone || !responseData.response) {
      return res.status(400).json({
        error: 'flowId, userPhone, and response are required'
      });
    }

    const flowResponse = await flowService.processFlowResponse(responseData);
    res.status(201).json({
      success: true,
      flowResponse
    });
  } catch (error) {
    console.error('Error creating flow response:', error);
    res.status(500).json({
      error: 'Failed to create flow response',
      details: error.message
    });
  }
});

// Get flow responses by flow ID
router.get('/:id/responses', async (req, res) => {
  try {
    const responses = await flowService.getFlowResponsesByFlowId(req.params.id);
    res.json({
      success: true,
      responses,
      count: responses.length
    });
  } catch (error) {
    console.error('Error getting flow responses:', error);
    res.status(500).json({
      error: 'Failed to get flow responses',
      details: error.message
    });
  }
});

// Get flow responses by user phone
router.get('/responses/user/:phoneNumber', async (req, res) => {
  try {
    const responses = await flowService.getFlowResponsesByUser(req.params.phoneNumber);
    res.json({
      success: true,
      responses,
      count: responses.length
    });
  } catch (error) {
    console.error('Error getting user flow responses:', error);
    res.status(500).json({
      error: 'Failed to get user flow responses',
      details: error.message
    });
  }
});

// Create message with flow connection
router.post('/messages', async (req, res) => {
  try {
    const messageData = req.body;
    
    // Validate required fields
    if (!messageData.userPhone || !messageData.messageType || !messageData.content) {
      return res.status(400).json({
        error: 'userPhone, messageType, and content are required'
      });
    }

    const message = await flowService.createMessageWithFlow(messageData);
    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error creating message with flow:', error);
    res.status(500).json({
      error: 'Failed to create message with flow',
      details: error.message
    });
  }
});

// Get messages by flow ID
router.get('/:id/messages', async (req, res) => {
  try {
    const messages = await flowService.getMessagesByFlowId(req.params.id);
    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error getting messages by flow ID:', error);
    res.status(500).json({
      error: 'Failed to get messages by flow ID',
      details: error.message
    });
  }
});

// Get messages by user phone
router.get('/messages/user/:phoneNumber', async (req, res) => {
  try {
    const messages = await flowService.getMessagesByUser(req.params.phoneNumber);
    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error getting messages by user:', error);
    res.status(500).json({
      error: 'Failed to get messages by user',
      details: error.message
    });
  }
});

// Delete flow (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await flowService.deleteFlow(req.params.id);
    res.json({
      success: result,
      message: 'Flow deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting flow:', error);
    res.status(500).json({
      error: 'Failed to delete flow',
      details: error.message
    });
  }
});

module.exports = router;
