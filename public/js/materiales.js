// ─────────────────────────────────────────────────────────────────────────────
// Materiales — capa de datos (Tramo 2)
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, MATERIALES_DEMO, bloquearEnDemo } from "./demo.js";

const materialesRef = collection(db, "materiales");
const movimientosRef = collection(db, "movimientos_materiales");
const contadorMaterialesDoc = doc(db, "contadores", "materiales");

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
 * Entrega un array ordenado por producto. Devuelve la función para desuscribirse.
 */
export function escucharMateriales(onCambio, onError) {
  if (MODO_DEMO) {
    onCambio([...MATERIALES_DEMO].sort((a, b) =>
      a.producto.localeCompare(b.producto, "es", { sensitivity: "base" })));
    return () => {};
  }
  return onSnapshot(
    materialesRef,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) =>
        (a.producto || "").localeCompare(b.producto || "", "es", { sensitivity: "base" }),
      );
      onCambio(items);
    },
    onError,
  );
}

/**
 * Crea un material nuevo (sin stock inicial: eso se hace con "registrar llegada").
 * El "item" es un correlativo automático (1, 2, 3…) asignado en una transacción
 * sobre contadores/materiales, para que no se repita aunque se creen varios a la vez.
 */
export async function crearMaterial({
  producto, categoria, unidad, cantidad, medida, centroGestion, centroCosto, stockMinimo, ubicacion, descripcion,
}) {
  if (MODO_DEMO) bloquearEnDemo();
  const email = usuarioActual()?.email ?? null;
  const nuevoDoc = doc(materialesRef);

  await runTransaction(db, async (tx) => {
    const contadorSnap = await tx.get(contadorMaterialesDoc);
    const item = (Number(contadorSnap.data()?.valor) || 0) + 1;

    tx.set(contadorMaterialesDoc, { valor: item }, { merge: true });
    tx.set(nuevoDoc, {
      item,
      producto: producto.trim(),
      categoria,
      unidad: unidad.trim(),
      cantidad: Number(cantidad) || 0,
      medida: medida?.trim() || "",
      centroGestion: centroGestion?.trim() || "",
      centroCosto: centroCosto?.trim() || "",
      stock: 0,
      stockMinimo: Number(stockMinimo) || 0,
      ubicacion: ubicacion?.trim() || "",
      descripcion: descripcion?.trim() || "",
      creadoPor: email,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    });
  });

  return nuevoDoc;
}

/**
 * Registra la llegada de material (entrada de stock) de forma atómica:
 * suma al stock del material y deja un movimiento en el historial.
 */
export async function registrarLlegada(materialId, { cantidad, proveedor, documento, motivo }) {
  if (MODO_DEMO) bloquearEnDemo();
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
      materialProducto: snap.data().producto,
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
