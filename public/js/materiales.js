// ─────────────────────────────────────────────────────────────────────────────
// Materiales — capa de datos (Tramo 2)
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, MATERIALES_DEMO, MOVIMIENTOS_DEMO, bloquearEnDemo } from "./demo.js";

const materialesRef = collection(db, "materiales");
const movimientosRef = collection(db, "movimientos_materiales");
const contadorMaterialesDoc = doc(db, "contadores", "materiales");

export const CATEGORIAS = [
  { valor: "consumible", etiqueta: "Consumible" },
  { valor: "epp", etiqueta: "EPP" },
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
 * Registra material entrante: si `materialId` viene vacío, crea el producto
 * (con correlativo automático "item") con el stock inicial recibido; si viene
 * un id existente, solo suma esa cantidad a su stock. En ambos casos deja un
 * movimiento de tipo "entrada" en el historial. Todo en una sola transacción.
 */
export async function registrarEntrada({ materialId, nuevoMaterial, cantidadRecibida, proveedor, documento, motivo }) {
  if (MODO_DEMO) bloquearEnDemo();
  const cant = Number(cantidadRecibida);
  if (!(cant > 0)) throw new Error("La cantidad recibida debe ser mayor que cero.");

  const email = usuarioActual()?.email ?? null;

  await runTransaction(db, async (tx) => {
    let materialDoc, productoNombre, categoriaMovimiento, resultante;

    if (materialId) {
      materialDoc = doc(db, "materiales", materialId);
      const snap = await tx.get(materialDoc);
      if (!snap.exists()) throw new Error("El material ya no existe.");
      productoNombre = snap.data().producto;
      categoriaMovimiento = snap.data().categoria;
      const actual = Number(snap.data().stock) || 0;
      resultante = Math.round((actual + cant) * 1000) / 1000;
      tx.update(materialDoc, { stock: resultante, actualizadoEn: serverTimestamp() });
    } else {
      if (!nuevoMaterial?.producto?.trim()) throw new Error("Indica el nombre del producto.");
      const contadorSnap = await tx.get(contadorMaterialesDoc);
      const item = (Number(contadorSnap.data()?.valor) || 0) + 1;
      tx.set(contadorMaterialesDoc, { valor: item }, { merge: true });

      materialDoc = doc(materialesRef);
      productoNombre = nuevoMaterial.producto.trim();
      categoriaMovimiento = nuevoMaterial.categoria;
      resultante = cant;
      tx.set(materialDoc, {
        item,
        producto: productoNombre,
        categoria: nuevoMaterial.categoria,
        unidad: nuevoMaterial.unidad.trim(),
        medida: nuevoMaterial.medida?.trim() || "",
        centroGestion: nuevoMaterial.centroGestion?.trim() || "",
        centroCosto: nuevoMaterial.centroCosto?.trim() || "",
        stock: cant,
        stockMinimo: Number(nuevoMaterial.stockMinimo) || 0,
        ubicacion: nuevoMaterial.ubicacion?.trim() || "",
        descripcion: nuevoMaterial.descripcion?.trim() || "",
        creadoPor: email,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
    }

    const nuevoMov = doc(movimientosRef);
    tx.set(nuevoMov, {
      materialId: materialDoc.id,
      materialProducto: productoNombre,
      categoria: categoriaMovimiento,
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

/**
 * Registra la salida de material de un producto existente: descuenta stock
 * (no deja bajar de 0) y deja un movimiento de tipo "salida" con la
 * trazabilidad de a quién/para qué se entregó.
 */
export async function registrarSalida(materialId, {
  cantidad, supervisor, actividad, zona, personaRetira, numeroVale, observacion,
}) {
  if (MODO_DEMO) bloquearEnDemo();
  const cant = Number(cantidad);
  if (!(cant > 0)) throw new Error("La cantidad debe ser mayor que cero.");
  if (!personaRetira?.trim()) throw new Error("Indica quién retira el material.");

  const email = usuarioActual()?.email ?? null;
  const materialDoc = doc(db, "materiales", materialId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(materialDoc);
    if (!snap.exists()) throw new Error("El material ya no existe.");

    const actual = Number(snap.data().stock) || 0;
    if (cant > actual) throw new Error(`No hay stock suficiente (disponible: ${actual}).`);
    const resultante = Math.round((actual - cant) * 1000) / 1000;

    tx.update(materialDoc, { stock: resultante, actualizadoEn: serverTimestamp() });

    const nuevoMov = doc(movimientosRef);
    tx.set(nuevoMov, {
      materialId,
      materialProducto: snap.data().producto,
      categoria: snap.data().categoria,
      tipo: "salida",
      cantidad: cant,
      stockResultante: resultante,
      supervisor: supervisor?.trim() || "",
      actividad: actividad?.trim() || "",
      zona: zona?.trim() || "",
      personaRetira: personaRetira.trim(),
      numeroVale: numeroVale?.trim() || "",
      observacion: observacion?.trim() || "",
      responsable: email,
      fecha: serverTimestamp(),
    });
  });
}

/**
 * Elimina un material del catálogo. No borra su historial de movimientos
 * (son un registro inmutable: quedan con el nombre del producto igual, aunque
 * ya no exista la ficha).
 */
export async function eliminarMaterial(materialId) {
  if (MODO_DEMO) bloquearEnDemo();
  await deleteDoc(doc(db, "materiales", materialId));
}

/**
 * Escucha en tiempo real el historial de movimientos (entradas y salidas),
 * más recientes primero. Devuelve la función para desuscribirse.
 */
export function escucharMovimientos(onCambio, onError, { max = 300 } = {}) {
  if (MODO_DEMO) {
    onCambio([...MOVIMIENTOS_DEMO].sort((a, b) => b.fecha.toDate() - a.fecha.toDate()));
    return () => {};
  }
  const q = query(movimientosRef, orderBy("fecha", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => onCambio(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

/** Devuelve el estado del stock frente al mínimo: 'ok' | 'bajo' | 'cero'. */
export function nivelStock(material) {
  const stock = Number(material.stock) || 0;
  const min = Number(material.stockMinimo) || 0;
  if (stock <= 0) return "cero";
  if (min > 0 && stock <= min) return "bajo";
  return "ok";
}
