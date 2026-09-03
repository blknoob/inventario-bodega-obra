// ─────────────────────────────────────────────────────────────────────────────
// Autenticación — cuenta única de bodega
// ─────────────────────────────────────────────────────────────────────────────
// - Solo bodega inicia sesión (email/contraseña).
// - El resto del personal (supervisores, jefes de terreno, administración) ve
//   el inventario sin cuenta: la lectura es pública.
// ─────────────────────────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

/** Ejecuta el callback cada vez que cambia el estado de sesión (o null). */
export function observarSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Devuelve el usuario actual o null (sin esperar). */
export function usuarioActual() {
  return auth.currentUser;
}

/** Inicia sesión de bodega. Lanza error con mensaje en español si falla. */
export async function iniciarSesion(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (error) {
    throw new Error(traducirErrorAuth(error.code));
  }
}

/** Cierra la sesión de bodega. */
export async function cerrarSesion() {
  await signOut(auth);
}

/**
 * Protege una página que requiere sesión de bodega.
 * Si no hay sesión, redirige a login.html.
 * Llama a `onListo(user)` cuando confirma que hay sesión.
 */
export function requerirBodega(onListo) {
  observarSesion((user) => {
    if (!user) {
      const destino = encodeURIComponent(location.pathname);
      location.replace(`login.html?volver=${destino}`);
      return;
    }
    onListo?.(user);
  });
}

function traducirErrorAuth(code) {
  switch (code) {
    case "auth/invalid-email":
      return "El email no tiene un formato válido.";
    case "auth/user-disabled":
      return "La cuenta de bodega está deshabilitada.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
    case "auth/network-request-failed":
      return "Sin conexión. Revisa tu internet.";
    default:
      return "No se pudo iniciar sesión. Intenta nuevamente.";
  }
}
