const express = require('express');
const router = express.Router();
const patientService = require('../services/patientService');

// Create a new patient
router.post('/', async (req, res) => {
  try {
    const patientData = req.body;
    
    // Validate required fields
    if (!patientData.name || !patientData.phoneNumber) {
      return res.status(400).json({
        error: 'Name and phone number are required'
      });
    }

    // Check if patient already exists
    const existingPatient = await patientService.getPatientByPhone(patientData.phoneNumber);
    if (existingPatient) {
      return res.status(409).json({
        error: 'Patient with this phone number already exists',
        patient: existingPatient
      });
    }

    const patient = await patientService.createPatient(patientData);
    res.status(201).json({
      success: true,
      patient
    });
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({
      error: 'Failed to create patient',
      details: error.message
    });
  }
});

// Get patient by ID
router.get('/:id', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    res.json({
      success: true,
      patient
    });
  } catch (error) {
    console.error('Error getting patient:', error);
    res.status(500).json({
      error: 'Failed to get patient',
      details: error.message
    });
  }
});

// Get patient by phone number
router.get('/phone/:phoneNumber', async (req, res) => {
  try {
    const patient = await patientService.getPatientByPhone(req.params.phoneNumber);
    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    res.json({
      success: true,
      patient
    });
  } catch (error) {
    console.error('Error getting patient by phone:', error);
    res.status(500).json({
      error: 'Failed to get patient',
      details: error.message
    });
  }
});

// Update patient
router.put('/:id', async (req, res) => {
  try {
    const patient = await patientService.updatePatient(req.params.id, req.body);
    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    res.json({
      success: true,
      patient
    });
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({
      error: 'Failed to update patient',
      details: error.message
    });
  }
});

// Get all patients
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const startAfter = req.query.startAfter || null;

    const patients = await patientService.getAllPatients(limit, startAfter);
    res.json({
      success: true,
      patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Error getting patients:', error);
    res.status(500).json({
      error: 'Failed to get patients',
      details: error.message
    });
  }
});

// Search patients by name
router.get('/search/:searchTerm', async (req, res) => {
  try {
    const patients = await patientService.searchPatientsByName(req.params.searchTerm);
    res.json({
      success: true,
      patients,
      count: patients.length
    });
  } catch (error) {
    console.error('Error searching patients:', error);
    res.status(500).json({
      error: 'Failed to search patients',
      details: error.message
    });
  }
});

// Add medical history
router.post('/:id/medical-history', async (req, res) => {
  try {
    const medicalHistory = await patientService.addMedicalHistory(req.params.id, req.body);
    res.json({
      success: true,
      medicalHistory
    });
  } catch (error) {
    console.error('Error adding medical history:', error);
    res.status(500).json({
      error: 'Failed to add medical history',
      details: error.message
    });
  }
});

// Delete patient (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await patientService.deletePatient(req.params.id);
    res.json({
      success: result,
      message: 'Patient deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting patient:', error);
    res.status(500).json({
      error: 'Failed to delete patient',
      details: error.message
    });
  }
});

module.exports = router;
