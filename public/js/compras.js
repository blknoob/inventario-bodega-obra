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

/**
 * Corre `promesa` con un tope de tiempo: si no resuelve antes de `ms`,
 * rechaza con `mensaje` en vez de dejar la operación colgada para siempre
 * (el SDK de Storage reintenta solo y nunca falla si, por ejemplo, el
 * proyecto no tiene Storage activado: sin este tope el botón de guardar
 * queda pegado en "Guardando…" sin ningún aviso).
 */
function conTope(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}

async function subirArchivo(carpeta, id, archivo) {
  if (!archivo) return null;
  const path = `${carpeta}/${id}/${archivo.name}`;
  const archivoRef = ref(storage, path);
  await conTope(
    uploadBytes(archivoRef, archivo),
    20000,
    "No se pudo subir el archivo (se demoró demasiado). Revisa que Firebase Storage esté activado para este proyecto.",
  );
  const url = await getDownloadURL(archivoRef);
  return { nombre: archivo.name, url, path };
}

/**
 * Crea un nuevo Pedido de Materiales (PM): número/folio, quién lo solicita, el
 * Excel del pedido (obligatorio: es la única forma de cargar un PM) y la
 * lista de ítems que trae ese Excel (línea, centro de gestión, centro de
 * costo, cantidad, unidad, glosa). Los ítems son texto libre: no requieren
 * existir todavía en el catálogo de Materiales/EPPs.
 */
export async function crearPedido({ numero, solicitante, observacion, items, archivo }) {
  if (MODO_DEMO) bloquearEnDemo();
  if (!archivo) throw new Error("Sube el Excel del pedido: es la única forma de cargar un PM.");
  const itemsLimpios = (items || [])
    .map((it) => ({
      id: it.id || crypto.randomUUID(),
      linea: (it.linea ?? "").toString().trim(),
      centroGestion: (it.centroGestion || "").trim(),
      centroCosto: (it.centroCosto || "").trim(),
      cantidad: Number(it.cantidad) || 0,
      unidad: (it.unidad || "").trim(),
      glosa: (it.glosa || "").trim(),
    }))
    .filter((it) => it.glosa);
  if (!itemsLimpios.length) throw new Error("El Excel no tiene ítems reconocibles (revisa la columna 'glosa').");

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
    .map((it) => ({ pmItemId: it.pmItemId, glosa: it.glosa, cantidad: Number(it.cantidad) || 0 }));
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

// Nombres de columna esperados en el Excel del pedido, normalizados (sin
// tildes, minúscula). La plantilla real de Carlos usa: LÍNEA, CENTRO
// GESTION, CENTRO COSTO, CANTIDAD*, unidad*, GLOSA* (encabezados en
// mayúscula, con asterisco, y "centro de gestión" sin el "de").
const ALIAS_COLUMNAS = {
  linea: ["linea"],
  centroGestion: ["centro de gestion", "centro gestion"],
  centroCosto: ["centro de costo", "centro costo"],
  cantidad: ["cantidad", "cant"],
  unidad: ["unidad", "und"],
  glosa: ["glosa", "descripcion", "detalle", "producto"],
};

// Algunas plantillas marcan los campos obligatorios con un asterisco u otro
// símbolo pegado al título ("glosa*", "cantidad*"...): se quita para que
// igual calce con el alias.
const normalizarEncabezado = (s) => String(s ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, "").trim();

function mapearColumnas(filaTitulos) {
  const mapa = {};
  for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
    const idx = filaTitulos.findIndex((celda) => alias.includes(normalizarEncabezado(celda)));
    mapa[campo] = idx >= 0 ? idx : null;
  }
  return mapa;
}

const valorColumna = (fila, idx) => (idx == null || fila[idx] == null) ? "" : String(fila[idx]).trim();

/**
 * Lee el Excel de un pedido y extrae sus ítems (línea, centro de gestión,
 * centro de costo, cantidad, unidad, glosa). Busca esas columnas por su
 * encabezado, sin importar el orden ni en qué fila estén: la plantilla real
 * trae datos del pedido (fecha, nombre del PM...) arriba de la tabla, así
 * que se recorre fila por fila hasta encontrar la que trae los títulos
 * (identificada por tener una celda que calce con 'glosa'). Requiere que
 * SheetJS (window.XLSX) esté cargado en la página.
 */
export async function leerItemsDeExcel(archivo) {
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel. Recarga la página e intenta de nuevo.");
  const buffer = await archivo.arrayBuffer();
  const libro = window.XLSX.read(buffer, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  // header: 1 -> filas como arrays crudos, no como objetos por título de
  // la primera fila (la fila de títulos real no siempre es la primera).
  const filas = window.XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
  if (!filas.length) throw new Error("El Excel no tiene filas de datos.");

  let mapa = null;
  let indiceTitulos = -1;
  for (let i = 0; i < filas.length; i++) {
    const candidato = mapearColumnas(filas[i]);
    if (candidato.glosa != null) { mapa = candidato; indiceTitulos = i; break; }
  }
  if (!mapa) throw new Error("No se encontró la columna 'glosa' (nombre del ítem) en el Excel.");

  const items = filas.slice(indiceTitulos + 1)
    .map((fila) => ({
      linea: valorColumna(fila, mapa.linea),
      centroGestion: valorColumna(fila, mapa.centroGestion),
      centroCosto: valorColumna(fila, mapa.centroCosto),
      cantidad: valorColumna(fila, mapa.cantidad),
      unidad: valorColumna(fila, mapa.unidad),
      glosa: valorColumna(fila, mapa.glosa),
    }))
    .filter((it) => it.glosa);
  if (!items.length) throw new Error("No se reconoció ningún ítem con glosa en el Excel.");

  return items;
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
