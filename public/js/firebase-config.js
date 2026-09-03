// ─────────────────────────────────────────────────────────────────────────────
// Configuración de Firebase
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza estos valores por los de TU proyecto:
//   Firebase Console → ⚙ Configuración del proyecto → Tus apps → App web → Config
//
// Estos datos NO son secretos: es normal que estén en el código del navegador.
// La seguridad real la dan las reglas de Firestore (firestore.rules).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Cache local: el inventario sigue visible sin conexión (bodega en obra) y se
// sincroniza al recuperar señal. persistentMultipleTabManager permite varias pestañas.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
