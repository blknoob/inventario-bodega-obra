// ─────────────────────────────────────────────────────────────────────────────
// Vales de entrega — capataz/supervisor piden materiales, prevencionista pide
// EPP, para un trabajador; bodega los entrega (descuenta stock) o los rechaza.
// ─────────────────────────────────────────────────────────────────────────────
// Un vale nace "pendiente" (Por entregar) y NO toca el stock: el descuento
// ocurre recién cuando bodega lo marca "entregado", en una sola transacción
// que revisa el stock de todos sus productos, descuenta, deja un movimiento de
// salida por producto en el Historial (movimientos_materiales, con el número
// de vale) y cierra el vale. Si algo no alcanza, no se entrega nada.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { usuarioActual, ROLES, etiquetaRol } from "./auth.js";
import { MODO_DEMO, VALES_DEMO, bloquearEnDemo } from "./demo.js";
import { OBRAS } from "./obra.js";

const valesRef = collection(db, "vales");
const movimientosRef = collection(db, "movimientos_materiales");
const contadorValesDoc = doc(db, "contadores", "vales");

// "material" = todo lo que se ve en la página Materiales (sin EPP ni
// herramientas: las herramientas no se entregan por vale).
export const TIPOS_VALE = {
  material: { etiqueta: "Materiales", admite: (categoria) => !["epp", "herramienta"].includes(categoria) },
  epp: { etiqueta: "EPP", admite: (categoria) => categoria === "epp" },
};

export const ESTADOS_VALE = {
  pendiente: { etiqueta: "Por entregar", badge: "badge-warn" },
  entregado: { etiqueta: "Entregado", badge: "badge-ok" },
  rechazado: { etiqueta: "Rechazado", badge: "badge-danger" },
};

// Tope de productos por vale (también en firestore.rules).
export const MAX_ITEMS_VALE = 30;

export function numeroValeTexto(numero) {
  return `V-${String(numero ?? "").padStart(4, "0")}`;
}

/** Productos que un rol puede pedir, de un catálogo ya filtrado por obra. */
export function materialesParaVale(rol, materiales) {
  const tipo = TIPOS_VALE[ROLES[rol]?.tipoVale];
  return tipo ? materiales.filter((m) => tipo.admite(m.categoria)) : [];
}

const redondear = (n) => Math.round(n * 1000) / 1000;

/**
 * Crea un vale pendiente con correlativo automático (V-0001, V-0002...).
 * `items`: [{ materialId, producto, unidad, cantidad }]. Si el mismo producto
 * viene en dos filas, se juntan en una sola sumando la cantidad.
 */
export async function crearVale({ perfil, obra, trabajador, actividad, observacion, items }) {
  if (MODO_DEMO) bloquearEnDemo();
  const tipo = ROLES[perfil?.rol]?.tipoVale;
  if (!tipo) throw new Error("Tu cuenta no puede crear vales.");
  if (!trabajador?.trim()) throw new Error("Indica el nombre del trabajador.");
  if (!actividad?.trim()) throw new Error("Indica la actividad.");

  const porMaterial = new Map();
  for (const it of items || []) {
    const cant = Number(it.cantidad);
    if (!it.materialId) throw new Error("Selecciona un producto de la lista en cada fila.");
    if (!(cant > 0)) throw new Error(`${it.producto}: la cantidad debe ser mayor que cero.`);
    const previo = porMaterial.get(it.materialId);
    porMaterial.set(it.materialId, {
      materialId: it.materialId,
      producto: it.producto,
      unidad: it.unidad || "",
      cantidad: redondear((previo?.cantidad || 0) + cant),
    });
  }
  const itemsFinal = [...porMaterial.values()];
  if (!itemsFinal.length) throw new Error("Agrega al menos un producto.");
  if (itemsFinal.length > MAX_ITEMS_VALE) throw new Error(`Un vale admite hasta ${MAX_ITEMS_VALE} productos.`);

  const nuevoValeRef = doc(valesRef);
  const numero = await runTransaction(db, async (tx) => {
    const contadorSnap = await tx.get(contadorValesDoc);
    const siguiente = (Number(contadorSnap.data()?.valor) || 0) + 1;
    tx.set(contadorValesDoc, { valor: siguiente });
    tx.set(nuevoValeRef, {
      numero: siguiente,
      obra: obra || OBRAS[0].valor,
      tipo,
      trabajador: trabajador.trim(),
      actividad: actividad.trim(),
      observacion: observacion?.trim() || "",
      items: itemsFinal,
      solicitanteUid: perfil.user.uid,
      solicitanteNombre: perfil.nombre || "",
      solicitanteEmail: perfil.email || "",
      solicitanteRol: perfil.rol,
      estado: "pendiente",
      creadoEn: serverTimestamp(),
    });
    return siguiente;
  });
  return { id: nuevoValeRef.id, numero };
}

/**
 * Entrega un vale pendiente: descuenta el stock de cada producto y deja un
 * movimiento de salida por producto (con el N.º de vale) en el Historial.
 * Todo o nada: si a un solo producto no le alcanza el stock, no se entrega
 * ninguno y el error lista todos los que faltan.
 */
export async function entregarVale(valeId) {
  if (MODO_DEMO) bloquearEnDemo();
  const email = usuarioActual()?.email ?? null;
  const valeDoc = doc(db, "vales", valeId);

  await runTransaction(db, async (tx) => {
    const valeSnap = await tx.get(valeDoc);
    if (!valeSnap.exists()) throw new Error("El vale ya no existe.");
    const vale = valeSnap.data();
    if (vale.estado !== "pendiente") {
      throw new Error(`Este vale ya fue ${vale.estado === "entregado" ? "entregado" : "rechazado"}.`);
    }

    // Todas las lecturas antes de cualquier escritura (regla de las
    // transacciones de Firestore).
    const materialesSnap = await Promise.all(vale.items.map((it) => tx.get(doc(db, "materiales", it.materialId))));

    const faltantes = [];
    vale.items.forEach((it, i) => {
      const snap = materialesSnap[i];
      if (!snap.exists()) { faltantes.push(`${it.producto}: ya no existe en el catálogo`); return; }
      if (!TIPOS_VALE[vale.tipo]?.admite(snap.data().categoria)) {
        faltantes.push(`${it.producto}: no corresponde a un vale de ${TIPOS_VALE[vale.tipo]?.etiqueta ?? vale.tipo}`);
        return;
      }
      const stock = Number(snap.data().stock) || 0;
      if (Number(it.cantidad) > stock) {
        faltantes.push(`${it.producto}: se piden ${it.cantidad}, hay ${stock}`);
      }
    });
    if (faltantes.length) throw new Error(`No se puede entregar: ${faltantes.join("; ")}.`);

    const solicitadoPor = `${vale.solicitanteNombre} (${etiquetaRol(vale.solicitanteRol)})`;
    const movimientoIds = vale.items.map((it, i) => {
      const snap = materialesSnap[i];
      const resultante = redondear((Number(snap.data().stock) || 0) - Number(it.cantidad));
      tx.update(snap.ref, { stock: resultante, actualizadoEn: serverTimestamp() });
      const movRef = doc(movimientosRef);
      tx.set(movRef, {
        materialId: it.materialId,
        materialProducto: snap.data().producto,
        categoria: snap.data().categoria,
        obra: snap.data().obra || OBRAS[0].valor,
        tipo: "salida",
        cantidad: Number(it.cantidad),
        stockResultante: resultante,
        supervisor: vale.solicitanteRol === "supervisor" ? vale.solicitanteNombre : "",
        actividad: vale.actividad,
        zona: "",
        personaRetira: vale.trabajador,
        numeroVale: numeroValeTexto(vale.numero),
        valeId,
        solicitadoPor,
        observacion: vale.observacion || "",
        responsable: email,
        fecha: serverTimestamp(),
      });
      return movRef.id;
    });

    tx.update(valeDoc, {
      estado: "entregado",
      entregadoPor: email,
      entregadoEn: serverTimestamp(),
      movimientoIds,
    });
  });
}

/** Rechaza un vale pendiente, con el motivo (no toca el stock). */
export async function rechazarVale(valeId, motivo) {
  if (MODO_DEMO) bloquearEnDemo();
  if (!motivo?.trim()) throw new Error("Indica el motivo del rechazo.");
  const email = usuarioActual()?.email ?? null;
  const valeDoc = doc(db, "vales", valeId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(valeDoc);
    if (!snap.exists()) throw new Error("El vale ya no existe.");
    if (snap.data().estado !== "pendiente") throw new Error("Este vale ya no está pendiente.");
    tx.update(valeDoc, {
      estado: "rechazado",
      rechazadoPor: email,
      rechazadoEn: serverTimestamp(),
      motivoRechazo: motivo.trim(),
    });
  });
}

function suscribir(q, filtroDemo, onCambio, onError) {
  if (MODO_DEMO) {
    onCambio(VALES_DEMO.filter(filtroDemo).sort((a, b) => b.creadoEn.toDate() - a.creadoEn.toDate()));
    return () => {};
  }
  return onSnapshot(q, (snap) => onCambio(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Todos los vales de una obra, más recientes primero (vista de bodega). */
export function escucharValesObra(obra, onCambio, onError, { max = 300 } = {}) {
  const q = MODO_DEMO ? null : query(valesRef, where("obra", "==", obra), orderBy("creadoEn", "desc"), limit(max));
  return suscribir(q, (v) => v.obra === obra, onCambio, onError);
}

/**
 * Los vales que pidió una persona en una obra (vista de capataz/supervisor/
 * prevencionista). El filtro por uid va en la query a propósito: las reglas
 * solo le dejan leer los suyos, y una query que pudiera traer ajenos se
 * rechazaría entera.
 */
export function escucharMisVales(uid) {
  return (obra, onCambio, onError, { max = 100 } = {}) => {
    const q = MODO_DEMO ? null : query(valesRef, where("solicitanteUid", "==", uid), where("obra", "==", obra), orderBy("creadoEn", "desc"), limit(max));
    return suscribir(q, (v) => v.obra === obra && v.solicitanteUid === uid, onCambio, onError);
  };
}

/** Cantidad de vales por entregar en una obra (para el aviso en la barra superior). */
export function escucharValesPendientes(obra, onCambio, onError) {
  const q = MODO_DEMO ? null : query(valesRef, where("obra", "==", obra), where("estado", "==", "pendiente"));
  return suscribir(q, (v) => v.obra === obra && v.estado === "pendiente", (items) => onCambio(items.length), onError);
}
