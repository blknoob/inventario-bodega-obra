// ─────────────────────────────────────────────────────────────────────────────
// Materiales — capa de datos (Tramo 2)
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";

const materialesRef = collection(db, "materiales");
const movimientosRef = collection(db, "movimientos_materiales");

export const CATEGORIAS = [
  { valor: "consumible", etiqueta: "Consumible" },
  { valor: "epp", etiqueta: "EPP (protección personal)" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "otro", etiqueta: "Otro" },
];

export function etiquetaCategoria(valor) {
  return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

/**
 * Escucha en tiempo real toda la colección de materiales.
 * Entrega un array ordenado por nombre. Devuelve la función para desuscribirse.
 */
export function escucharMateriales(onCambio, onError) {
  return onSnapshot(
    materialesRef,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) =>
        (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" }),
      );
      onCambio(items);
    },
    onError,
  );
}

/** Crea un material nuevo (sin stock inicial: eso se hace con "registrar llegada"). */
export async function crearMaterial({ nombre, categoria, unidad, stockMinimo, ubicacion, descripcion }) {
  const email = usuarioActual()?.email ?? null;
  return addDoc(materialesRef, {
    nombre: nombre.trim(),
    categoria,
    unidad: unidad.trim(),
    stock: 0,
    stockMinimo: Number(stockMinimo) || 0,
    ubicacion: ubicacion?.trim() || "",
    descripcion: descripcion?.trim() || "",
    creadoPor: email,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Registra la llegada de material (entrada de stock) de forma atómica:
 * suma al stock del material y deja un movimiento en el historial.
 */
export async function registrarLlegada(materialId, { cantidad, proveedor, documento, motivo }) {
  const cant = Number(cantidad);
  if (!(cant > 0)) throw new Error("La cantidad debe ser mayor que cero.");

  const email = usuarioActual()?.email ?? null;
  const materialDoc = doc(db, "materiales", materialId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(materialDoc);
    if (!snap.exists()) throw new Error("El material ya no existe.");

    const actual = Number(snap.data().stock) || 0;
    const resultante = Math.round((actual + cant) * 1000) / 1000;

    tx.update(materialDoc, { stock: resultante, actualizadoEn: serverTimestamp() });

    const nuevoMov = doc(movimientosRef);
    tx.set(nuevoMov, {
      materialId,
      materialNombre: snap.data().nombre,
      tipo: "entrada",
      cantidad: cant,
      stockResultante: resultante,
      proveedor: proveedor?.trim() || "",
      documento: documento?.trim() || "",
      motivo: motivo?.trim() || "Llegada de material",
      responsable: email,
      fecha: serverTimestamp(),
    });
  });
}

/** Devuelve el estado del stock frente al mínimo: 'ok' | 'bajo' | 'cero'. */
export function nivelStock(material) {
  const stock = Number(material.stock) || 0;
  const min = Number(material.stockMinimo) || 0;
  if (stock <= 0) return "cero";
  if (min > 0 && stock <= min) return "bajo";
  return "ok";
}
