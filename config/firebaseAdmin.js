const admin = require('firebase-admin');
const path = require('path');

// Try to load service account from environment variable first (recommended)
let serviceAccount = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    // If the env var points to a file path, require it
    serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } catch (e) {
    // ignore - admin SDK will still try to use application default credentials
  }
}

// Fallback to local service account file for development (not recommended for production)
if (!serviceAccount) {
  try {
    serviceAccount = require(path.join(__dirname, '..', 'prac-cdte-firebase-adminsdk-fbsvc-2952dcad04.json'));
  } catch (e) {
    // file not found or invalid; we'll let admin.initializeApp() use default creds
  }
}

if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
  } else {
    // Use application default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS env var or GCP environment)
    admin.initializeApp();
  }
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };
