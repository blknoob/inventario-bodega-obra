// ─────────────────────────────────────────────────────────────────────────────
// Seguimiento de compra — capa de datos
// ─────────────────────────────────────────────────────────────────────────────
// Flujo: Pedido de Materiales (PM) -> una o varias Órdenes de Compra (por
// distintos proveedores) -> el material llega a bodega con la guía/factura
// de la orden de compra (ese último paso se registra como siempre en
// "Material entrante", en materiales.js).
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, PEDIDOS_DEMO, ORDENES_DEMO, bloquearEnDemo } from "./demo.js";

const pedidosRef = collection(db, "pedidos_materiales");
const ordenesRef = collection(db, "ordenes_compra");

/** Días sin orden de compra a partir de los cuales un ítem entra en alerta. */
export const DIAS_ALERTA_SIN_COMPRA = 7;

/** Escucha en tiempo real todos los Pedidos de Materiales (PM). */
export function escucharPedidos(onCambio, onError) {
  if (MODO_DEMO) {
    onCambio([...PEDIDOS_DEMO].sort((a, b) => b.creadoEn.toDate() - a.creadoEn.toDate()));
    return () => {};
  }
  return onSnapshot(
    pedidosRef,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.creadoEn?.toDate?.() ?? 0) - (a.creadoEn?.toDate?.() ?? 0));
      onCambio(items);
    },
    onError,
  );
}

/** Escucha en tiempo real todas las Órdenes de Compra (de todos los pedidos). */
export function escucharOrdenes(onCambio, onError) {
  if (MODO_DEMO) {
    onCambio([...ORDENES_DEMO].sort((a, b) => b.creadoEn.toDate() - a.creadoEn.toDate()));
    return () => {};
  }
  return onSnapshot(
    ordenesRef,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.creadoEn?.toDate?.() ?? 0) - (a.creadoEn?.toDate?.() ?? 0));
      onCambio(items);
    },
    onError,
  );
}

async function subirArchivo(carpeta, id, archivo) {
  if (!archivo) return null;
  const path = `${carpeta}/${id}/${archivo.name}`;
  const archivoRef = ref(storage, path);
  await uploadBytes(archivoRef, archivo);
  const url = await getDownloadURL(archivoRef);
  return { nombre: archivo.name, url, path };
}

/**
 * Crea un nuevo Pedido de Materiales (PM): número/folio, quién lo solicita,
 * la lista de ítems pedidos (texto libre: no requieren existir todavía en el
 * catálogo de Materiales/EPPs) y, opcionalmente, el Excel del pedido.
 */
export async function crearPedido({ numero, solicitante, observacion, items, archivo }) {
  if (MODO_DEMO) bloquearEnDemo();
  const itemsLimpios = (items || [])
    .map((it) => ({
      id: it.id || crypto.randomUUID(),
      nombre: (it.nombre || "").trim(),
      cantidad: Number(it.cantidad) || 0,
      unidad: (it.unidad || "").trim(),
    }))
    .filter((it) => it.nombre);
  if (!itemsLimpios.length) throw new Error("Agrega al menos un ítem al pedido.");

  const email = usuarioActual()?.email ?? null;
  const pedidoDoc = doc(pedidosRef);
  const archivoInfo = await subirArchivo("pedidos", pedidoDoc.id, archivo);

  await setDoc(pedidoDoc, {
    numero: numero?.trim() || "",
    solicitante: solicitante?.trim() || "",
    observacion: observacion?.trim() || "",
    items: itemsLimpios,
    archivo: archivoInfo,
    creadoPor: email,
    creadoEn: serverTimestamp(),
  });
  return pedidoDoc.id;
}

/** Elimina un Pedido de Materiales (no elimina sus órdenes de compra ya creadas). */
export async function eliminarPedido(pedido) {
  if (MODO_DEMO) bloquearEnDemo();
  if (pedido.archivo?.path) {
    try { await deleteObject(ref(storage, pedido.archivo.path)); } catch { /* ya no existe */ }
  }
  await deleteDoc(doc(db, "pedidos_materiales", pedido.id));
}

/**
 * Crea una Orden de Compra (OC) para un Pedido de Materiales: proveedor,
 * número/folio, qué ítems del pedido cubre (con su cantidad) y,
 * opcionalmente, el PDF de la orden.
 */
export async function crearOrdenCompra({ pmId, numero, proveedor, itemsCubiertos, archivo }) {
  if (MODO_DEMO) bloquearEnDemo();
  if (!pmId) throw new Error("Falta el pedido al que pertenece esta orden.");
  const itemsLimpios = (itemsCubiertos || [])
    .filter((it) => it.incluido)
    .map((it) => ({ pmItemId: it.pmItemId, nombre: it.nombre, cantidad: Number(it.cantidad) || 0 }));
  if (!itemsLimpios.length) throw new Error("Selecciona al menos un ítem que cubra esta orden.");

  const email = usuarioActual()?.email ?? null;
  const ordenDoc = doc(ordenesRef);
  const archivoInfo = await subirArchivo("ordenes", ordenDoc.id, archivo);

  await setDoc(ordenDoc, {
    pmId,
    numero: numero?.trim() || "",
    proveedor: proveedor?.trim() || "",
    itemsCubiertos: itemsLimpios,
    archivo: archivoInfo,
    recibida: false,
    recibidaEn: null,
    creadoPor: email,
    creadoEn: serverTimestamp(),
  });
  return ordenDoc.id;
}

/** Marca (o desmarca) una orden de compra como recibida en bodega. */
export async function marcarOrdenRecibida(ordenId, recibida) {
  if (MODO_DEMO) bloquearEnDemo();
  await updateDoc(doc(db, "ordenes_compra", ordenId), {
    recibida: !!recibida,
    recibidaEn: recibida ? serverTimestamp() : null,
  });
}

/** Elimina una orden de compra. */
export async function eliminarOrdenCompra(orden) {
  if (MODO_DEMO) bloquearEnDemo();
  if (orden.archivo?.path) {
    try { await deleteObject(ref(storage, orden.archivo.path)); } catch { /* ya no existe */ }
  }
  await deleteDoc(doc(db, "ordenes_compra", orden.id));
}

/**
 * Cruza pedidos + órdenes y devuelve los ítems de PM que llevan
 * DIAS_ALERTA_SIN_COMPRA días o más sin estar cubiertos por ninguna orden de
 * compra. Cada resultado trae el pedido, el ítem y los días transcurridos.
 */
export function itemsSinComprar(pedidos, ordenes) {
  const ahora = Date.now();
  const resultado = [];
  for (const pedido of pedidos) {
    const fecha = pedido.creadoEn?.toDate?.();
    if (!fecha) continue;
    const dias = Math.floor((ahora - fecha.getTime()) / 86400000);
    if (dias < DIAS_ALERTA_SIN_COMPRA) continue;
    const cubiertos = new Set(
      ordenes.filter((o) => o.pmId === pedido.id).flatMap((o) => o.itemsCubiertos.map((it) => it.pmItemId)),
    );
    for (const item of pedido.items || []) {
      if (!cubiertos.has(item.id)) resultado.push({ pedido, item, dias });
    }
  }
  return resultado.sort((a, b) => b.dias - a.dias);
}
