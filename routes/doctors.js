const express = require('express');
const router = express.Router();
const doctorService = require('../services/doctorService');

// Create a new doctor
router.post('/', async (req, res) => {
  try {
    const doctorData = req.body;
    
    // Validate required fields
    if (!doctorData.name || !doctorData.phoneNumber || !doctorData.specialization) {
      return res.status(400).json({
        error: 'Name, phone number, and specialization are required'
      });
    }

    // Check if doctor already exists
    const existingDoctor = await doctorService.getDoctorByPhone(doctorData.phoneNumber);
    if (existingDoctor) {
      return res.status(409).json({
        error: 'Doctor with this phone number already exists',
        doctor: existingDoctor
      });
    }

    const doctor = await doctorService.createDoctor(doctorData);
    res.status(201).json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({
      error: 'Failed to create doctor',
      details: error.message
    });
  }
});

// Get doctor by ID
router.get('/:id', async (req, res) => {
  try {
    const doctor = await doctorService.getDoctorById(req.params.id);
    if (!doctor) {
      return res.status(404).json({
        error: 'Doctor not found'
      });
    }

    res.json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Error getting doctor:', error);
    res.status(500).json({
      error: 'Failed to get doctor',
      details: error.message
    });
  }
});

// Get doctor by phone number
router.get('/phone/:phoneNumber', async (req, res) => {
  try {
    const doctor = await doctorService.getDoctorByPhone(req.params.phoneNumber);
    if (!doctor) {
      return res.status(404).json({
        error: 'Doctor not found'
      });
    }

    res.json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Error getting doctor by phone:', error);
    res.status(500).json({
      error: 'Failed to get doctor',
      details: error.message
    });
  }
});

// Get doctors by specialization
router.get('/specialization/:specialization', async (req, res) => {
  try {
    const doctors = await doctorService.getDoctorsBySpecialization(req.params.specialization);
    res.json({
      success: true,
      doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('Error getting doctors by specialization:', error);
    res.status(500).json({
      error: 'Failed to get doctors',
      details: error.message
    });
  }
});

// Update doctor
router.put('/:id', async (req, res) => {
  try {
    const doctor = await doctorService.updateDoctor(req.params.id, req.body);
    if (!doctor) {
      return res.status(404).json({
        error: 'Doctor not found'
      });
    }

    res.json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({
      error: 'Failed to update doctor',
      details: error.message
    });
  }
});

// Get all doctors
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const startAfter = req.query.startAfter || null;

    const doctors = await doctorService.getAllDoctors(limit, startAfter);
    res.json({
      success: true,
      doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('Error getting doctors:', error);
    res.status(500).json({
      error: 'Failed to get doctors',
      details: error.message
    });
  }
});

// Get available doctors
router.get('/available/list', async (req, res) => {
  try {
    const doctors = await doctorService.getAvailableDoctors();
    res.json({
      success: true,
      doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('Error getting available doctors:', error);
    res.status(500).json({
      error: 'Failed to get available doctors',
      details: error.message
    });
  }
});

// Set doctor availability
router.patch('/:id/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        error: 'isAvailable must be a boolean value'
      });
    }

    const doctor = await doctorService.setDoctorAvailability(req.params.id, isAvailable);
    res.json({
      success: true,
      doctor
    });
  } catch (error) {
    console.error('Error setting doctor availability:', error);
    res.status(500).json({
      error: 'Failed to set doctor availability',
      details: error.message
    });
  }
});

// Add schedule for doctor
router.post('/:id/schedule', async (req, res) => {
  try {
    const schedule = await doctorService.addSchedule(req.params.id, req.body);
    res.json({
      success: true,
      schedule
    });
  } catch (error) {
    console.error('Error adding doctor schedule:', error);
    res.status(500).json({
      error: 'Failed to add doctor schedule',
      details: error.message
    });
  }
});

// Delete doctor (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await doctorService.deleteDoctor(req.params.id);
    res.json({
      success: result,
      message: 'Doctor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({
      error: 'Failed to delete doctor',
      details: error.message
    });
  }
});

module.exports = router;
