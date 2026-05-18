// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDBF3IUvgFteuwhsmwU2MqI4iipOi0mViA",
  authDomain: "graegonx.firebaseapp.com",
  projectId: "graegonx",
  storageBucket: "graegonx.firebasestorage.app",
  messagingSenderId: "753221572418",
  appId: "1:753221572418:web:ede4c1e64fc3b606a4dadb",
  measurementId: "G-M2SM1B9KMW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);