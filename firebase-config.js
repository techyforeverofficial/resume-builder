import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-functions.js";

// TODO: Replace with your actual Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDCZ7IsHnIYNSZ139lWTFY0kkXnxIZy9Q0",
    authDomain: "resume-builder-18af9.firebaseapp.com",
    projectId: "resume-builder-18af9",
    storageBucket: "resume-builder-18af9.firebasestorage.app",
    messagingSenderId: "447147710553",
    appId: "1:447147710553:web:94f7320b4db749f02d7948"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

export { auth, db, functions, app };
