// ─────────────────────────────────────────────────────────────────────────────
// Fletes — capa de datos
// ─────────────────────────────────────────────────────────────────────────────
// Un flete es un traslado hecho por una empresa externa: puede ser una
// llegada de materiales/herramientas a bodega, o un retiro (escombros,
// herramientas que se van a otra obra...). Como lo hace un tercero, siempre
// debería venir con su factura (foto o PDF).
//
// Un flete puede quedar asociado a un ingreso puntual del historial (se elige
// desde "Material entrante", ver materiales.js/registrarEntrada), pero no es
// obligatorio -- un retiro de escombros, por ejemplo, no mueve stock de
// ningún material y el flete queda solo, sin ingreso asociado.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, FLETES_DEMO, bloquearEnDemo } from "./demo.js";

const fletesRef = collection(db, "fletes");

export const TIPOS_FLETE = [
  { valor: "entrada", etiqueta: "Llegada de material" },
  { valor: "salida", etiqueta: "Retiro (escombros, herramientas...)" },
];

export function etiquetaTipoFlete(valor) {
  return TIPOS_FLETE.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

/** Escucha en tiempo real todos los fletes, más recientes primero. */
export function escucharFletes(onCambio, onError) {
  if (MODO_DEMO) {
    onCambio([...FLETES_DEMO].sort((a, b) => b.creadoEn.toDate() - a.creadoEn.toDate()));
    return () => {};
  }
  return onSnapshot(
    fletesRef,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.creadoEn?.toDate?.() || 0) - (a.creadoEn?.toDate?.() || 0));
      onCambio(items);
    },
    onError,
  );
}

function conTope(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}

async function subirFactura(fleteId, archivo) {
  if (!archivo) return null;
  const path = `fletes/${fleteId}/${archivo.name}`;
  const archivoRef = ref(storage, path);
  await conTope(
    uploadBytes(archivoRef, archivo),
    20000,
    "No se pudo subir la factura (se demoró demasiado). Revisa que Firebase Storage esté activado para este proyecto.",
  );
  const url = await getDownloadURL(archivoRef);
  return { nombre: archivo.name, url, path };
}

/** Crea un nuevo flete: empresa, tipo (entrada/salida), qué se trasladó y su factura. */
export async function crearFlete({ empresa, tipo, detalle, observacion, factura }) {
  if (MODO_DEMO) bloquearEnDemo();
  if (!empresa?.trim()) throw new Error("Indica la empresa que hizo el traslado.");
  if (!TIPOS_FLETE.some((t) => t.valor === tipo)) throw new Error("Elige el tipo de flete.");

  const email = usuarioActual()?.email ?? null;
  const fleteDoc = doc(fletesRef);
  const facturaInfo = await subirFactura(fleteDoc.id, factura);

  await setDoc(fleteDoc, {
    empresa: empresa.trim(),
    tipo,
    detalle: detalle?.trim() || "",
    observacion: observacion?.trim() || "",
    factura: facturaInfo,
    creadoPor: email,
    creadoEn: serverTimestamp(),
  });
  return fleteDoc.id;
}

/** Elimina un flete (y su factura del Storage, si tenía). */
export async function eliminarFlete(flete) {
  if (MODO_DEMO) bloquearEnDemo();
  if (flete.factura?.path) {
    try { await deleteObject(ref(storage, flete.factura.path)); } catch { /* ya no existe */ }
  }
  await deleteDoc(doc(db, "fletes", flete.id));
}
