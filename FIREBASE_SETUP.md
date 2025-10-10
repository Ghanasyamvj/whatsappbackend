# Firebase Setup Guide

This guide will help you set up Firebase for the WhatsApp Hospital Backend system.

## Prerequisites

1. A Google account
2. Access to the Firebase Console
3. Node.js installed on your system

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter your project name (e.g., "whatsapp-hospital")
4. Choose whether to enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Set up Firestore Database

1. In your Firebase project console, click on "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (you can configure security rules later)
4. Select a location for your database (choose the closest to your users)
5. Click "Done"

## Step 3: Generate Service Account Key

1. In the Firebase console, go to Project Settings (gear icon)
2. Click on the "Service accounts" tab
3. Click "Generate new private key"
4. Download the JSON file and keep it secure
5. Extract the following values from the JSON file:
   - `project_id`
   - `private_key_id`
   - `private_key`
   - `client_email`
   - `client_id`
   - `client_x509_cert_url`

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in the Firebase configuration values:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id_from_json
FIREBASE_PRIVATE_KEY_ID=your_private_key_id_from_json
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_from_json\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_client_email_from_json
FIREBASE_CLIENT_ID=your_client_id_from_json
FIREBASE_CLIENT_CERT_URL=your_client_cert_url_from_json
```

**Important**: Make sure to wrap the private key in quotes and include the `\n` characters as shown above.

## Step 5: Install Dependencies

```bash
npm install firebase-admin
```

## Step 6: Firestore Collections Structure

The system will automatically create the following collections:

### Patients Collection (`patients`)
```javascript
{
  name: "John Doe",
  phoneNumber: "+1234567890",
  email: "john@example.com",
  dateOfBirth: "1990-01-01",
  gender: "male",
  address: "123 Main St, City, State",
  emergencyContact: {
    name: "Jane Doe",
    phoneNumber: "+1234567891",
    relationship: "spouse"
  },
  medicalHistory: [
    {
      id: "timestamp_id",
      condition: "Hypertension",
      diagnosis: "High blood pressure",
      treatment: "Medication",
      doctorId: "doctor_id",
      timestamp: "2023-01-01T00:00:00Z"
    }
  ],
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z",
  isActive: true
}
```

### Doctors Collection (`doctors`)
```javascript
{
  name: "Dr. Smith",
  phoneNumber: "+1234567892",
  email: "dr.smith@hospital.com",
  specialization: "Cardiology",
  licenseNumber: "MD123456",
  department: "Cardiology",
  experience: 10,
  qualifications: ["MD", "FACC"],
  schedule: [
    {
      id: "schedule_id",
      day: "Monday",
      startTime: "09:00",
      endTime: "17:00",
      createdAt: "2023-01-01T00:00:00Z"
    }
  ],
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z",
  isActive: true,
  isAvailable: true
}
```

### Flows Collection (`flows`)
```javascript
{
  name: "Appointment Booking Flow",
  description: "Flow for booking appointments",
  flowJson: {
    version: "3.0",
    screens: [
      {
        id: "WELCOME",
        title: "Welcome",
        data: {},
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "TextHeading",
              text: "Book an Appointment"
            }
          ]
        }
      }
    ]
  },
  category: "appointment",
  isActive: true,
  version: 1,
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z"
}
```

### Flow Responses Collection (`flowResponses`)
```javascript
{
  flowId: "flow_document_id",
  userPhone: "+1234567890",
  screenId: "WELCOME",
  response: "user_response_data",
  responseType: "button_click",
  patientId: "patient_document_id", // optional
  doctorId: "doctor_document_id", // optional
  status: "received",
  createdAt: "2023-01-01T00:00:00Z"
}
```

### Messages Collection (`messages`)
```javascript
{
  userPhone: "+1234567890",
  messageType: "interactive", // text, interactive, template
  content: "message_content_or_flow_json",
  flowId: "flow_document_id", // optional
  patientId: "patient_document_id", // optional
  doctorId: "doctor_document_id", // optional
  status: "sent", // sent, delivered, read, failed
  isResponse: false, // true if this is a response to a flow
  createdAt: "2023-01-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z"
}
```

## Step 7: Security Rules (Optional)

For production, set up proper Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to authenticated users
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Or more specific rules for each collection
    match /patients/{patientId} {
      allow read, write: if request.auth != null;
    }
    
    match /doctors/{doctorId} {
      allow read, write: if request.auth != null;
    }
    
    match /flows/{flowId} {
      allow read, write: if request.auth != null;
    }
    
    match /flowResponses/{responseId} {
      allow read, write: if request.auth != null;
    }
    
    match /messages/{messageId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 8: Test the Connection

Start your server and check if Firebase is connected:

```bash
npm start
```

Visit `http://localhost:3000/health` to see if the server is running properly.

## API Endpoints

Once set up, you'll have access to these endpoints:

### Patients
- `POST /api/patients` - Create patient
- `GET /api/patients/:id` - Get patient by ID
- `GET /api/patients/phone/:phoneNumber` - Get patient by phone
- `PUT /api/patients/:id` - Update patient
- `GET /api/patients` - Get all patients
- `DELETE /api/patients/:id` - Delete patient

### Doctors
- `POST /api/doctors` - Create doctor
- `GET /api/doctors/:id` - Get doctor by ID
- `GET /api/doctors/phone/:phoneNumber` - Get doctor by phone
- `GET /api/doctors/specialization/:specialization` - Get doctors by specialization
- `PUT /api/doctors/:id` - Update doctor
- `GET /api/doctors` - Get all doctors
- `GET /api/doctors/available/list` - Get available doctors
- `PATCH /api/doctors/:id/availability` - Set doctor availability

### Flows
- `POST /api/flows` - Create flow
- `GET /api/flows/:id` - Get flow by ID
- `PUT /api/flows/:id` - Update flow
- `GET /api/flows` - Get all flows
- `POST /api/flows/responses` - Create flow response
- `GET /api/flows/:id/responses` - Get flow responses
- `POST /api/flows/messages` - Create message with flow
- `GET /api/flows/:id/messages` - Get messages by flow

## Troubleshooting

1. **Authentication Error**: Make sure your service account key is correctly formatted in the `.env` file
2. **Permission Denied**: Check your Firestore security rules
3. **Connection Error**: Verify your project ID and network connection
4. **Private Key Error**: Ensure the private key includes proper line breaks (`\n`)

## Next Steps

1. Set up proper authentication for your API endpoints
2. Configure Firestore security rules for production
3. Set up monitoring and logging
4. Implement data backup strategies
