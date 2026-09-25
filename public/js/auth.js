// ─────────────────────────────────────────────────────────────────────────────
// Autenticación — cuentas con rol
// ─────────────────────────────────────────────────────────────────────────────
// - Bodega (rol "bodega") carga ingresos/salidas y entrega los vales.
// - Capataz, supervisor y prevencionista de riesgos inician sesión solo para
//   pedir vales de entrega (materiales o EPP) a bodega -- no pueden editar
//   el inventario (ver firestore.rules).
// - El resto del personal ve el inventario sin cuenta: la lectura es pública.
//
// El rol va como custom claim ("rol") en el token de Firebase Auth: solo se
// asigna desde el Admin SDK (ver scripts/usuarios.mjs), nunca desde el
// navegador. Las cuentas creadas con ese script llevan además el claim
// "claveInicial": hasta que la persona define su propia clave (queda anotado
// en usuarios/{uid}.claveDefinida), se le manda a cambiar-clave.html.
// ─────────────────────────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { MODO_DEMO } from "./demo.js";

// tipoVale: qué puede pedir cada rol en un vale (ver js/vales.js/TIPOS_VALE).
export const ROLES = {
  bodega: { etiqueta: "Bodega" },
  capataz: { etiqueta: "Capataz", tipoVale: "material" },
  supervisor: { etiqueta: "Supervisor", tipoVale: "material" },
  prevencionista: { etiqueta: "Prevencionista de riesgos", tipoVale: "epp" },
};

export function etiquetaRol(rol) {
  return ROLES[rol]?.etiqueta ?? rol ?? "";
}

/** Capataz, supervisor o prevencionista: piden vales, no editan inventario. */
export function esSolicitante(rol) {
  return !!ROLES[rol]?.tipoVale;
}

/** Ejecuta el callback cada vez que cambia el estado de sesión (o null). */
export function observarSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Devuelve el usuario actual o null (sin esperar). */
export function usuarioActual() {
  return auth.currentUser;
}

// En modo demo no hay sesión real: se simula un perfil para poder ver cada
// vista. ?rol=capataz (o supervisor/prevencionista/bodega) lo cambia y queda
// recordado, igual que ?demo.
function perfilDemo() {
  let rol = "bodega";
  try {
    const param = new URL(location.href).searchParams.get("rol");
    if (ROLES[param]) localStorage.setItem("demoRol", param);
    if (ROLES[localStorage.getItem("demoRol")]) rol = localStorage.getItem("demoRol");
  } catch {
    // sin localStorage: queda como bodega
  }
  const nombres = { bodega: "Bodega demo", capataz: "Carlos Urbina", supervisor: "Alejandro Pastrian", prevencionista: "Inti Henriquez" };
  return { user: { uid: `demo-${rol}`, email: `${rol}@demo.cl` }, rol, nombre: nombres[rol], email: `${rol}@demo.cl`, debeCambiarClave: false };
}

/**
 * Perfil de la sesión: { user, rol, nombre, email, debeCambiarClave }. Si el
 * token todavía no trae el claim "rol" (p. ej. una sesión abierta antes de
 * que se asignara), se fuerza a renovarlo una vez -- sin eso, bodega
 * quedaría sin permisos de escritura hasta que el token venza solo (1 h).
 */
async function cargarPerfil(user) {
  let token = await user.getIdTokenResult();
  if (!token.claims.rol) token = await user.getIdTokenResult(true);
  const rol = ROLES[token.claims.rol] ? token.claims.rol : null;
  let debeCambiarClave = false;
  if (token.claims.claveInicial) {
    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      debeCambiarClave = !snap.data()?.claveDefinida;
    } catch {
      // Sin poder leerlo, se asume que falta: peor sería dejar la clave temporal.
      debeCambiarClave = true;
    }
  }
  return { user, rol, nombre: user.displayName || user.email, email: user.email, debeCambiarClave };
}

// Un solo cargarPerfil por usuario aunque varias partes de la página
// (topbar, la propia página) pregunten a la vez.
let perfilPendiente = null;
let perfilUid = null;
function perfilDe(user) {
  if (perfilUid !== user.uid || !perfilPendiente) {
    perfilUid = user.uid;
    perfilPendiente = cargarPerfil(user);
  }
  return perfilPendiente;
}

/** Como observarSesion, pero entrega el perfil con rol (o null sin sesión). */
export function observarPerfil(callback) {
  if (MODO_DEMO) {
    callback(perfilDemo());
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { perfilPendiente = null; perfilUid = null; callback(null); return; }
    callback(await perfilDe(user));
  });
}

/** Inicia sesión. Lanza error con mensaje en español si falla. Devuelve el perfil. */
export async function iniciarSesion(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return await perfilDe(cred.user);
  } catch (error) {
    throw new Error(traducirErrorAuth(error.code));
  }
}

/** Cierra la sesión. */
export async function cerrarSesion() {
  perfilPendiente = null;
  perfilUid = null;
  await signOut(auth);
}

/** Página a la que va cada rol al iniciar sesión (si no pidió volver a otra). */
export function inicioDeRol(rol) {
  return rol === "bodega" ? "bodega.html" : "vales.html";
}

/**
 * Protege una página que requiere sesión con uno de `roles`.
 * - Sin sesión: redirige a login.html (y vuelve acá después).
 * - Con clave temporal: redirige a cambiar-clave.html.
 * - Con otro rol: lo manda a su propia página de inicio.
 * Llama a `onListo(perfil)` cuando confirma que puede quedarse.
 */
export function requerirRol(roles, onListo) {
  observarPerfil((perfil) => {
    const destino = encodeURIComponent(location.pathname.split("/").pop() + location.search);
    if (!perfil) {
      location.replace(`login.html?volver=${destino}`);
      return;
    }
    if (perfil.debeCambiarClave) {
      location.replace(`cambiar-clave.html?volver=${destino}`);
      return;
    }
    if (!roles.includes(perfil.rol)) {
      location.replace(perfil.rol ? inicioDeRol(perfil.rol) : "index.html");
      return;
    }
    onListo?.(perfil);
  });
}

/** Protege una página que requiere sesión de bodega. */
export function requerirBodega(onListo) {
  requerirRol(["bodega"], onListo);
}

// Mínimo 8 caracteres, con al menos una letra y un número.
export function validarClaveNueva(clave) {
  if (clave.length < 8) return "La clave debe tener al menos 8 caracteres.";
  if (!/[a-zA-ZñÑ]/.test(clave) || !/\d/.test(clave)) return "La clave debe tener letras y números.";
  return null;
}

/** Cambia la clave de la sesión actual y deja anotado que ya no es la temporal. */
export async function cambiarClave(nueva) {
  const error = validarClaveNueva(nueva);
  if (error) throw new Error(error);
  const user = auth.currentUser;
  if (!user) throw new Error("La sesión se cerró. Vuelve a iniciar sesión.");
  try {
    await updatePassword(user, nueva);
  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      throw new Error("Por seguridad, vuelve a iniciar sesión (con tu clave actual) y cámbiala de inmediato.");
    }
    if (err.code === "auth/weak-password") throw new Error("La clave es demasiado débil.");
    throw new Error("No se pudo cambiar la clave. Intenta nuevamente.");
  }
  await setDoc(doc(db, "usuarios", user.uid), { claveDefinida: true, definidaEn: serverTimestamp() });
  perfilPendiente = null; // que el próximo perfil ya no pida cambiarla
}

function traducirErrorAuth(code) {
  switch (code) {
    case "auth/invalid-email":
      return "El email no tiene un formato válido.";
    case "auth/user-disabled":
      return "La cuenta está deshabilitada.";
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
