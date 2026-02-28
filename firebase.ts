// Initialize Firebase with modular SDK (v9+)
// Fix: Import initializeApp correctly from the 'firebase/app' module to resolve TypeScript member resolution errors.
import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCUYJvIAUUpuNFzpbfhaHfgWTrO6AbvmA0",
  authDomain: "vista-e-coupon-database.firebaseapp.com",
  projectId: "vista-e-coupon-database",
  storageBucket: "vista-e-coupon-database.firebasestorage.app",
  messagingSenderId: "687679334753",
  appId: "1:687679334753:web:563fd52000610c33113d20",
  measurementId: "G-SY5NK30FLZ"
};

// Initialize the Firebase app instance
const app = initializeApp(firebaseConfig);
// Export Firestore database instance for use in the application services
// Force long polling to avoid connection issues in some network environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const auth = getAuth(app);