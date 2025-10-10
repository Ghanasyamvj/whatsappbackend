const patientService = require('../services/patientService');
const doctorService = require('../services/doctorService');
const flowService = require('../services/flowService');

// Sample data for seeding the database
const samplePatients = [
  {
    name: "John Doe",
    phoneNumber: "+1234567890",
    email: "john.doe@email.com",
    dateOfBirth: "1990-05-15",
    gender: "male",
    address: "123 Main St, New York, NY 10001",
    emergencyContact: {
      name: "Jane Doe",
      phoneNumber: "+1234567891",
      relationship: "spouse"
    }
  },
  {
    name: "Sarah Johnson",
    phoneNumber: "+1234567892",
    email: "sarah.johnson@email.com",
    dateOfBirth: "1985-08-22",
    gender: "female",
    address: "456 Oak Ave, Los Angeles, CA 90210",
    emergencyContact: {
      name: "Mike Johnson",
      phoneNumber: "+1234567893",
      relationship: "husband"
    }
  }
];

const sampleDoctors = [
  {
    name: "Dr. Emily Smith",
    phoneNumber: "+1234567894",
    email: "dr.smith@hospital.com",
    specialization: "Cardiology",
    licenseNumber: "MD123456",
    department: "Cardiology",
    experience: 12,
    qualifications: ["MD", "FACC", "Board Certified Cardiologist"],
    schedule: [
      {
        day: "Monday",
        startTime: "09:00",
        endTime: "17:00"
      },
      {
        day: "Wednesday",
        startTime: "09:00",
        endTime: "17:00"
      },
      {
        day: "Friday",
        startTime: "09:00",
        endTime: "17:00"
      }
    ]
  },
  {
    name: "Dr. Michael Brown",
    phoneNumber: "+1234567895",
    email: "dr.brown@hospital.com",
    specialization: "Orthopedics",
    licenseNumber: "MD789012",
    department: "Orthopedics",
    experience: 8,
    qualifications: ["MD", "Orthopedic Surgery Specialist"],
    schedule: [
      {
        day: "Tuesday",
        startTime: "08:00",
        endTime: "16:00"
      },
      {
        day: "Thursday",
        startTime: "08:00",
        endTime: "16:00"
      }
    ]
  },
  {
    name: "Dr. Lisa Wilson",
    phoneNumber: "+1234567896",
    email: "dr.wilson@hospital.com",
    specialization: "General Medicine",
    licenseNumber: "MD345678",
    department: "General Medicine",
    experience: 15,
    qualifications: ["MD", "Internal Medicine", "Family Medicine"],
    schedule: [
      {
        day: "Monday",
        startTime: "08:00",
        endTime: "18:00"
      },
      {
        day: "Tuesday",
        startTime: "08:00",
        endTime: "18:00"
      },
      {
        day: "Wednesday",
        startTime: "08:00",
        endTime: "18:00"
      },
      {
        day: "Thursday",
        startTime: "08:00",
        endTime: "18:00"
      },
      {
        day: "Friday",
        startTime: "08:00",
        endTime: "16:00"
      }
    ]
  }
];

const sampleFlows = [
  {
    name: "Appointment Booking Flow",
    description: "Interactive flow for patients to book appointments",
    category: "appointment",
    flowJson: {
      version: "3.0",
      screens: [
        {
          id: "WELCOME",
          title: "Book Appointment",
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Welcome to Hospital Appointment Booking"
              },
              {
                type: "TextBody",
                text: "Please select the type of appointment you need:"
              },
              {
                type: "Footer",
                label: "Continue",
                on_click_action: {
                  name: "complete",
                  payload: {
                    screen: "SPECIALIZATION"
                  }
                }
              }
            ]
          }
        },
        {
          id: "SPECIALIZATION",
          title: "Select Specialization",
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Select Medical Specialization"
              },
              {
                type: "RadioButtonsGroup",
                required: true,
                data_source: [
                  {
                    id: "cardiology",
                    title: "Cardiology"
                  },
                  {
                    id: "orthopedics",
                    title: "Orthopedics"
                  },
                  {
                    id: "general",
                    title: "General Medicine"
                  }
                ]
              },
              {
                type: "Footer",
                label: "Next",
                on_click_action: {
                  name: "complete",
                  payload: {
                    screen: "CONTACT_INFO"
                  }
                }
              }
            ]
          }
        },
        {
          id: "CONTACT_INFO",
          title: "Contact Information",
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Your Contact Information"
              },
              {
                type: "TextInput",
                required: true,
                label: "Full Name",
                input_type: "text"
              },
              {
                type: "TextInput",
                required: true,
                label: "Phone Number",
                input_type: "phone"
              },
              {
                type: "Footer",
                label: "Book Appointment",
                on_click_action: {
                  name: "complete",
                  payload: {
                    screen: "CONFIRMATION"
                  }
                }
              }
            ]
          }
        }
      ]
    }
  },
  {
    name: "Symptom Checker Flow",
    description: "Interactive flow to help patients describe their symptoms",
    category: "consultation",
    flowJson: {
      version: "3.0",
      screens: [
        {
          id: "SYMPTOMS_START",
          title: "Symptom Checker",
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "TextHeading",
                text: "Symptom Checker"
              },
              {
                type: "TextBody",
                text: "Please describe your main symptoms:"
              },
              {
                type: "CheckboxGroup",
                required: true,
                data_source: [
                  {
                    id: "fever",
                    title: "Fever"
                  },
                  {
                    id: "cough",
                    title: "Cough"
                  },
                  {
                    id: "headache",
                    title: "Headache"
                  },
                  {
                    id: "chest_pain",
                    title: "Chest Pain"
                  },
                  {
                    id: "shortness_breath",
                    title: "Shortness of Breath"
                  }
                ]
              },
              {
                type: "Footer",
                label: "Continue",
                on_click_action: {
                  name: "complete",
                  payload: {
                    screen: "URGENCY"
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Seed patients
    console.log('📋 Seeding patients...');
    for (const patientData of samplePatients) {
      try {
        const existingPatient = await patientService.getPatientByPhone(patientData.phoneNumber);
        if (!existingPatient) {
          const patient = await patientService.createPatient(patientData);
          console.log(`✅ Created patient: ${patient.name}`);
        } else {
          console.log(`⏭️  Patient already exists: ${existingPatient.name}`);
        }
      } catch (error) {
        console.error(`❌ Error creating patient ${patientData.name}:`, error.message);
      }
    }

    // Seed doctors
    console.log('👨‍⚕️ Seeding doctors...');
    for (const doctorData of sampleDoctors) {
      try {
        const existingDoctor = await doctorService.getDoctorByPhone(doctorData.phoneNumber);
        if (!existingDoctor) {
          const doctor = await doctorService.createDoctor(doctorData);
          console.log(`✅ Created doctor: ${doctor.name}`);
        } else {
          console.log(`⏭️  Doctor already exists: ${existingDoctor.name}`);
        }
      } catch (error) {
        console.error(`❌ Error creating doctor ${doctorData.name}:`, error.message);
      }
    }

    // Seed flows
    console.log('🔄 Seeding flows...');
    for (const flowData of sampleFlows) {
      try {
        const flow = await flowService.createFlow(flowData);
        console.log(`✅ Created flow: ${flow.name}`);
      } catch (error) {
        console.error(`❌ Error creating flow ${flowData.name}:`, error.message);
      }
    }

    console.log('🎉 Database seeding completed successfully!');
    
    // Display summary
    const patients = await patientService.getAllPatients(10);
    const doctors = await doctorService.getAllDoctors(10);
    const flows = await flowService.getAllFlows();
    
    console.log('\n📊 Database Summary:');
    console.log(`👥 Patients: ${patients.length}`);
    console.log(`👨‍⚕️ Doctors: ${doctors.length}`);
    console.log(`🔄 Flows: ${flows.length}`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
