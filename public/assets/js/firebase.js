/* ==========================================================================
   TokoKu — Firebase (Auth + Cloud Firestore, offline-first)
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, updateProfile, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache,
  persistentMultipleTabManager, collection, doc, addDoc, setDoc, getDoc,
  getDocs, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
  Timestamp, serverTimestamp, writeBatch, increment, arrayUnion,
  enableNetwork, disableNetwork, documentId
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const cfg = window.FIREBASE_CONFIG || {};
export const isConfigured = Boolean(cfg.apiKey && cfg.projectId && !String(cfg.apiKey).includes('GANTI'));
export const googleEnabled = cfg.googleSignIn === true && isConfigured;

let app = null;
let auth = null;
let db = null;

if (isConfigured) {
  app = initializeApp(cfg);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    console.warn('[TokoKu] Cache offline tidak tersedia, memakai mode standar.', e);
    db = getFirestore(app);
  }
  try { setPersistence(auth, browserLocalPersistence).catch(() => {}); } catch (e) {}
}

export { app, auth, db };

export const fb = {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, Timestamp, serverTimestamp,
  writeBatch, increment, arrayUnion, enableNetwork, disableNetwork, documentId,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult
};

export function authErrorMessage(error) {
  const code = String(error && (error.code || error.message) || '');
  const map = {
    'auth/invalid-credential': 'Email atau password salah. Silakan periksa kembali.',
    'auth/user-not-found': 'Akun dengan email ini belum terdaftar.',
    'auth/wrong-password': 'Password salah. Silakan coba lagi.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar. Silakan masuk.',
    'auth/weak-password': 'Password terlalu lemah. Gunakan minimal 6 karakter.',
    'auth/missing-password': 'Password wajib diisi.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
    'auth/network-request-failed': 'Tidak ada koneksi internet. Periksa jaringan Anda.',
    'auth/operation-not-allowed': 'Metode login ini belum diaktifkan di Firebase Console.',
    'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase Authentication.',
    'auth/popup-closed-by-user': 'Jendela login ditutup sebelum selesai.',
    'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup lalu coba lagi.',
    'auth/account-exists-with-different-credential': 'Email sudah terdaftar dengan metode login lain.'
  };
  return map[code] || (error && error.message) || 'Terjadi kesalahan. Silakan coba lagi.';
}
