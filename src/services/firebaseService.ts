import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import {
  AuditSettings,
  EmployeeMapping,
  EmployeeQuotaRecord,
  HROverrideRecord,
  LeaveFormRecord,
} from '../types/attendance';

export interface FirebaseConfigData {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface PersistedHRState {
  employeeMappings: EmployeeMapping[];
  quotaRecords: EmployeeQuotaRecord[];
  leaveRecords: LeaveFormRecord[];
  hrOverrides: Record<string, HROverrideRecord>;
  settings: AuditSettings;
  updatedAt: string;
}

const LOCAL_STORAGE_STATE_KEY = 'jcw_hr_attendance_state_v4';
const LOCAL_STORAGE_FIREBASE_CONFIG_KEY = 'jcw_hr_firebase_config_v4';
const FIRESTORE_WORKSPACE_DOC_ID = 'workspace_main';

let firestoreDb: Firestore | null = null;
let currentApp: FirebaseApp | null = null;

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfigData = {
  apiKey: 'AIzaSyBQWneN1EJsssNOcIMEgIn_oTideOOSagk',
  authDomain: 'timeattendencejcw.firebaseapp.com',
  projectId: 'timeattendencejcw',
  storageBucket: 'timeattendencejcw.firebasestorage.app',
  messagingSenderId: '1071683652942',
  appId: '1:1071683652942:web:8689d2d96d71ee6d54e21f',
};

/**
 * โหลดค่าตั้งค่า Firebase จาก Environment Variables (Vercel), LocalStorage หรือค่าเริ่มต้นของโปรเจกต์ timeattendenceJCW
 */
export function getSavedFirebaseConfig(): FirebaseConfigData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_FIREBASE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as FirebaseConfigData;
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.VITE_FIREBASE_APP_ID || '',
    };
  }

  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfigToLocal(config: FirebaseConfigData | null): void {
  if (!config) {
    localStorage.removeItem(LOCAL_STORAGE_FIREBASE_CONFIG_KEY);
    firestoreDb = null;
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_FIREBASE_CONFIG_KEY, JSON.stringify(config));
  initFirebaseConnection(config);
}

export function initFirebaseConnection(config?: FirebaseConfigData | null): Firestore | null {
  const cfg = config ?? getSavedFirebaseConfig();
  if (!cfg || !cfg.apiKey || !cfg.projectId) {
    firestoreDb = null;
    return null;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      currentApp = existingApps[0];
    } else {
      currentApp = initializeApp(cfg);
    }
    firestoreDb = getFirestore(currentApp);
    return firestoreDb;
  } catch (err) {
    console.error('Firebase initialization error:', err);
    firestoreDb = null;
    return null;
  }
}

export function isFirebaseConnected(): boolean {
  return firestoreDb !== null || getSavedFirebaseConfig() !== null;
}

/**
 * บันทึกข้อมูล HR Overrides, ใบลา, สิทธิคงเหลือ และตารางผูก ID ลง LocalStorage และซิงก์ขึ้น Firebase Firestore
 */
export async function saveHRState(state: PersistedHRState): Promise<{
  savedLocal: boolean;
  savedFirebase: boolean;
  error?: string;
}> {
  let savedLocal = false;
  let savedFirebase = false;

  const cleanState = JSON.parse(JSON.stringify(state)) as PersistedHRState;

  try {
    localStorage.setItem(LOCAL_STORAGE_STATE_KEY, JSON.stringify(cleanState));
    savedLocal = true;
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }

  const db = firestoreDb || initFirebaseConnection();
  if (!db) {
    return { savedLocal, savedFirebase: false };
  }

  try {
    const docRef = doc(db, 'jcw_hr_attendance', FIRESTORE_WORKSPACE_DOC_ID);
    await setDoc(docRef, cleanState, { merge: true });
    savedFirebase = true;
    return { savedLocal, savedFirebase };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { savedLocal, savedFirebase: false, error: msg };
  }
}

/**
 * โหลดข้อมูลที่บันทึกไว้จาก Firebase Firestore หรือ LocalStorage
 */
export async function loadHRState(): Promise<{
  state: Partial<PersistedHRState> | null;
  source: 'firebase' | 'local' | 'seed';
}> {
  const db = firestoreDb || initFirebaseConnection();
  if (db) {
    try {
      const docRef = doc(db, 'jcw_hr_attendance', FIRESTORE_WORKSPACE_DOC_ID);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Partial<PersistedHRState>;
        return { state: data, source: 'firebase' };
      }
    } catch (err) {
      console.warn('Could not load from Firebase, falling back to LocalStorage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedHRState>;
      return { state: parsed, source: 'local' };
    }
  } catch {
    // ignore
  }

  return { state: null, source: 'seed' };
}

export function clearLocalHRState(): void {
  localStorage.removeItem(LOCAL_STORAGE_STATE_KEY);
}
