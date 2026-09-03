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
import {
  getAuth,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore,
  connectFirestoreEmulator,
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

// Modo emulador local: abre cualquier página con ?emu (queda recordado).
// Requiere `firebase emulators:start`. Sirve para probar sin tocar datos reales.
const USAR_EMULADOR = (() => {
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("emu")) localStorage.setItem("usarEmulador", "1");
    if (url.searchParams.has("noemu")) localStorage.removeItem("usarEmulador");
    return localStorage.getItem("usarEmulador") === "1" &&
      ["localhost", "127.0.0.1"].includes(location.hostname);
  } catch {
    return false;
  }
})();

const app = initializeApp(
  USAR_EMULADOR ? { ...firebaseConfig, projectId: "demo-inventario", apiKey: "demo" } : firebaseConfig,
);

export const auth = getAuth(app);

export const db = initializeFirestore(
  app,
  USAR_EMULADOR
    ? {}
    : {
        // Cache local: el inventario sigue visible sin conexión (bodega en obra)
        // y se sincroniza al recuperar señal.
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
);

if (USAR_EMULADOR) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  console.info("[firebase] Conectado a los emuladores locales (proyecto demo-inventario).");
}
