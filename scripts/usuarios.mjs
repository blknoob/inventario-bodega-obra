// ─────────────────────────────────────────────────────────────────────────────
// Cuentas y roles — se corre a mano desde la máquina de bodega, NUNCA en el
// navegador (usa la clave de administrador del proyecto).
// ─────────────────────────────────────────────────────────────────────────────
// Uso (desde esta carpeta, con la clave de cuenta de servicio FUERA del repo):
//
//   npm install
//   GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/clave-admin.json node usuarios.mjs
//
// Qué hace (se puede correr las veces que haga falta):
//   - A cada cuenta de CUENTAS le asigna su rol (custom claim "rol").
//   - Si la cuenta no existe, la crea con una clave temporal (se imprime una
//     sola vez) y el claim "claveInicial": en su primer ingreso la app la
//     obliga a crear su propia clave (ver public/cambiar-clave.html).
//   - A una cuenta que ya existe NO le cambia la clave.
//
//   node usuarios.mjs --reiniciar-clave correo@dpc.cl
//     Le pone una clave temporal nueva y la vuelve a obligar a cambiarla.
//
// Después de cambiar el rol de alguien, esa persona lo ve al volver a entrar
// (o a más tardar en 1 hora, cuando su sesión renueva el token).
// ─────────────────────────────────────────────────────────────────────────────

import { randomInt } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROYECTO = "inventario-bodega-obra";

// Rol: bodega | capataz | supervisor | prevencionista (ver public/js/auth.js/ROLES).
const CUENTAS = [
  { email: "bodegacclp2@dpc.com", rol: "bodega" },
  { email: "carlosurbina@dpc.cl", nombre: "Carlos Urbina", rol: "capataz" },
  { email: "alejandropastrian@dpc.cl", nombre: "Alejandro Pastrian", rol: "supervisor" },
  { email: "intihenriquez@dpc.cl", nombre: "Inti Henriquez", rol: "prevencionista" },
];

initializeApp({ credential: applicationDefault(), projectId: PROYECTO });
const auth = getAuth();
const db = getFirestore();

// 10 caracteres sin letras/números que se confunden (l/1, O/0), con al
// menos una letra y un número, para dictarla o mandarla por WhatsApp.
function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const todos = letras + numeros;
  let clave = letras[randomInt(letras.length)] + numeros[randomInt(numeros.length)];
  while (clave.length < 10) clave += todos[randomInt(todos.length)];
  return [...clave].sort(() => randomInt(3) - 1).join("");
}

async function buscar(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  }
}

async function exigirCambioDeClave(user, claims) {
  const clave = claveTemporal();
  await auth.updateUser(user.uid, { password: clave });
  await auth.setCustomUserClaims(user.uid, { ...claims, claveInicial: true });
  await db.doc(`usuarios/${user.uid}`).delete();
  await auth.revokeRefreshTokens(user.uid); // cierra sus sesiones abiertas
  return clave;
}

async function sincronizar() {
  const claves = [];
  for (const cuenta of CUENTAS) {
    let user = await buscar(cuenta.email);
    if (!user) {
      const clave = claveTemporal();
      user = await auth.createUser({ email: cuenta.email, password: clave, displayName: cuenta.nombre, emailVerified: true });
      await auth.setCustomUserClaims(user.uid, { rol: cuenta.rol, claveInicial: true });
      claves.push({ email: cuenta.email, clave });
      console.log(`+ creada   ${cuenta.email}  (${cuenta.rol})`);
      continue;
    }
    if (cuenta.nombre && user.displayName !== cuenta.nombre) {
      await auth.updateUser(user.uid, { displayName: cuenta.nombre });
    }
    // Se conserva "claveInicial" si ya lo tenía (sigue pendiente de cambiarla).
    const actuales = user.customClaims || {};
    if (actuales.rol !== cuenta.rol) {
      await auth.setCustomUserClaims(user.uid, { ...actuales, rol: cuenta.rol });
      console.log(`~ rol      ${cuenta.email}  ${actuales.rol || "(sin rol)"} -> ${cuenta.rol}`);
    } else {
      console.log(`= sin cambios ${cuenta.email}  (${cuenta.rol})`);
    }
  }
  return claves;
}

async function main() {
  const i = process.argv.indexOf("--reiniciar-clave");
  let claves;
  if (i !== -1) {
    const email = process.argv[i + 1];
    const user = email && await buscar(email);
    if (!user) throw new Error(`No existe la cuenta ${email || "(falta el correo)"}.`);
    claves = [{ email, clave: await exigirCambioDeClave(user, user.customClaims || {}) }];
  } else {
    claves = await sincronizar();
  }
  if (claves.length) {
    console.log("\nClaves temporales (se piden cambiar en el primer ingreso; no quedan guardadas en ningún lado):");
    for (const { email, clave } of claves) console.log(`  ${email}  ->  ${clave}`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
