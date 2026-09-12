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
  runTransaction,
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

/** Días sin llegar completo a bodega a partir de los cuales un ítem entra en alerta. */
export const DIAS_ALERTA_SIN_LLEGAR = 10;

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
    .map((it) => ({ pmItemId: it.pmItemId, glosa: it.glosa, cantidad: Number(it.cantidad) || 0, recibido: 0 }));
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

/**
 * Anota la orden de compra que trajo un ítem que se está recibiendo, sin
 * checklist ni ceremonia: busca (por pmId + número, sin importar mayúsculas)
 * una orden que ya se haya anotado antes para ese pedido; si existe pero no
 * incluía este ítem, se lo agrega, y si no existe todavía, la crea con solo
 * este ítem. `ordenes` es la lista de órdenes ya cargada en la página (no
 * hace falta volver a leerla de Firestore). Devuelve la orden con su id
 * definitivo, lista para usar en registrarEntrada.
 *
 * El N.º de orden de compra puede venir vacío -- hay materiales, equipos o
 * herramientas que llegan sin OC (caja chica, casa matriz). En ese caso se
 * agrupan igual bajo una orden "sin número" propia de cada pedido, para
 * que se sigan descontando de lo solicitado en el PM y no queden como
 * "sin llegar" para siempre; en Seguimiento de Compras y el Historial esa
 * orden se ve con su N.º en blanco ("—" / "Sin OC").
 */
export async function anotarOrdenDeCompra(ordenes, { pmId, numero, proveedor, item }) {
  if (MODO_DEMO) bloquearEnDemo();
  const numeroLimpio = (numero || "").trim();

  const existente = ordenes.find(
    (o) => o.pmId === pmId && (o.numero || "").trim().toLowerCase() === numeroLimpio.toLowerCase(),
  );
  const itemNuevo = { pmItemId: item.id, glosa: item.glosa, cantidad: Number(item.cantidad) || 0, recibido: 0 };

  if (existente) {
    // Se agrega el ítem dentro de una transacción (no con un updateDoc
    // suelto sobre `existente`, que puede venir del caché local ya
    // desactualizado) porque al registrar varios productos de un mismo
    // pedido de una vez, esta función se llama en cascada varias veces
    // seguidas sobre la MISMA orden: si cada llamada escribe el arreglo
    // completo a partir de una copia que no alcanzó a refrescarse, pisa lo
    // que la llamada anterior (o su registrarEntrada) acababa de guardar,
    // incluido lo ya recibido de otro ítem.
    const ordenDoc = doc(db, "ordenes_compra", existente.id);
    const itemsCubiertos = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ordenDoc);
      const actuales = snap.exists() ? (snap.data().itemsCubiertos || []) : existente.itemsCubiertos;
      if (actuales.some((it) => it.pmItemId === item.id)) return actuales;
      const nuevos = [...actuales, itemNuevo];
      tx.update(ordenDoc, { itemsCubiertos: nuevos });
      return nuevos;
    });
    return { ...existente, itemsCubiertos };
  }

  const nuevaId = await crearOrdenCompra({
    pmId, numero: numeroLimpio, proveedor,
    itemsCubiertos: [{ ...itemNuevo, incluido: true }],
    archivo: null,
  });
  return { id: nuevaId, pmId, numero: numeroLimpio, proveedor: proveedor?.trim() || "", itemsCubiertos: [itemNuevo], recibida: false };
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
 * Cuánto ha llegado a bodega de un ítem del pedido: suma el "recibido" de
 * ese ítem en todas las órdenes de compra que lo cubren (normalmente una
 * sola, pero por si acaso se dividió en más de una).
 */
export function cantidadRecibidaDe(ordenes, pedidoId, pmItemId) {
  return ordenes
    .filter((o) => o.pmId === pedidoId)
    .flatMap((o) => o.itemsCubiertos)
    .filter((it) => it.pmItemId === pmItemId)
    .reduce((suma, it) => suma + (Number(it.recibido) || 0), 0);
}

/**
 * Cruza pedidos + órdenes y devuelve los ítems de PM que llevan
 * DIAS_ALERTA_SIN_LLEGAR días o más sin llegar completos a bodega (tengan
 * o no una orden de compra generada). Cada resultado trae el pedido, el
 * ítem, cuánto falta por llegar y los días transcurridos desde el pedido.
 */
export function itemsSinLlegar(pedidos, ordenes) {
  const ahora = Date.now();
  const resultado = [];
  for (const pedido of pedidos) {
    const fecha = pedido.creadoEn?.toDate?.();
    if (!fecha) continue;
    const dias = Math.floor((ahora - fecha.getTime()) / 86400000);
    if (dias < DIAS_ALERTA_SIN_LLEGAR) continue;
    for (const item of pedido.items || []) {
      const recibido = cantidadRecibidaDe(ordenes, pedido.id, item.id);
      const pendiente = Math.round(((Number(item.cantidad) || 0) - recibido) * 1000) / 1000;
      if (pendiente > 0) resultado.push({ pedido, item, dias, pendiente, recibido });
    }
  }
  return resultado.sort((a, b) => b.dias - a.dias);
}
