// ─────────────────────────────────────────────────────────────────────────────
// Herramientas — arriendos (capa de datos)
// ─────────────────────────────────────────────────────────────────────────────
// Una herramienta que llega a bodega puede ser comprada o arrendada. Eso se
// elige y queda guardado en el propio movimiento de "Material entrante" (ver
// materiales.js/registrarEntrada, campos tipoAdquisicion/empresaArriendo).
//
// Si es arrendada, además hay que poder tenerla presente hasta que se
// devuelva a la empresa arrendadora -- para eso se crea acá, aparte, un
// registro en "arriendos_herramienta" (un préstamo pendiente), vinculado al
// movimiento de entrada que lo originó. Al devolverla se cierra ese registro
// y se descuenta el stock con un movimiento de salida (la herramienta deja
// de estar en bodega).
//
// No se admiten devoluciones parciales por ahora: se devuelve completo lo
// que quedó pendiente en ese arriendo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, ARRIENDOS_DEMO, bloquearEnDemo } from "./demo.js";
import { ACTIVIDAD_DEVOLUCION_HERRAMIENTA } from "./constantes.js";

const arriendosRef = collection(db, "arriendos_herramienta");
const materialesRef = collection(db, "materiales");
const movimientosRef = collection(db, "movimientos_materiales");

/** Escucha en tiempo real todos los arriendos (pendientes y ya devueltos), más recientes primero. */
export function escucharArriendos(onCambio, onError) {
  if (MODO_DEMO) {
    onCambio([...ARRIENDOS_DEMO].sort((a, b) => b.creadoEn.toDate() - a.creadoEn.toDate()));
    return () => {};
  }
  return onSnapshot(
    arriendosRef,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.creadoEn?.toDate?.() || 0) - (a.creadoEn?.toDate?.() || 0));
      onCambio(items);
    },
    onError,
  );
}

/**
 * Deja registrado que una herramienta recién ingresada es arrendada (queda
 * pendiente por devolver). Se llama aparte, después de registrarEntrada --
 * no en la misma transacción, igual que la factura/flete asociados.
 */
export async function crearArriendo({ materialId, materialProducto, cantidad, empresa, movimientoEntradaId, observacion, obra }) {
  if (MODO_DEMO) bloquearEnDemo();
  const cant = Number(cantidad);
  if (!(cant > 0)) throw new Error("La cantidad arrendada debe ser mayor que cero.");
  if (!empresa?.trim()) throw new Error("Indica la empresa arrendadora.");

  const email = usuarioActual()?.email ?? null;
  const arriendoDoc = doc(arriendosRef);
  await setDoc(arriendoDoc, {
    materialId,
    materialProducto,
    obra: obra || "",
    cantidad: cant,
    empresa: empresa.trim(),
    movimientoEntradaId: movimientoEntradaId || null,
    observacion: observacion?.trim() || "",
    devuelto: false,
    fechaDevolucion: null,
    movimientoSalidaId: null,
    creadoPor: email,
    creadoEn: serverTimestamp(),
  });
  return arriendoDoc.id;
}

/**
 * Marca un arriendo como devuelto: descuenta del stock lo arrendado (con un
 * movimiento de salida, como cualquier otra salida de material) y cierra el
 * registro. Si el producto ya no existe en el catálogo (se eliminó), igual
 * se cierra el arriendo, solo que sin tocar stock.
 *
 * `facturas` son las fotos de la guía de devolución (subidas antes con
 * subirFacturasEntrada(archivos, "devoluciones"), igual que en Material
 * entrante) -- quedan en el movimiento de salida para poder verlas después
 * en Guías, junto con las demás.
 */
export async function devolverHerramienta(arriendo, { observacion, facturas } = {}) {
  if (MODO_DEMO) bloquearEnDemo();
  if (arriendo.devuelto) throw new Error("Este arriendo ya está marcado como devuelto.");

  const email = usuarioActual()?.email ?? null;
  const arriendoDoc = doc(db, "arriendos_herramienta", arriendo.id);
  const materialDoc = doc(db, "materiales", arriendo.materialId);
  const nuevoMovRef = doc(movimientosRef);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(materialDoc);

    if (snap.exists()) {
      const actual = Number(snap.data().stock) || 0;
      const resultante = Math.max(0, Math.round((actual - arriendo.cantidad) * 1000) / 1000);
      tx.update(materialDoc, { stock: resultante, actualizadoEn: serverTimestamp() });
      tx.set(nuevoMovRef, {
        materialId: arriendo.materialId,
        materialProducto: snap.data().producto,
        categoria: snap.data().categoria,
        obra: snap.data().obra || arriendo.obra || "",
        tipo: "salida",
        cantidad: arriendo.cantidad,
        stockResultante: resultante,
        supervisor: "",
        actividad: ACTIVIDAD_DEVOLUCION_HERRAMIENTA,
        zona: "",
        personaRetira: arriendo.empresa,
        numeroVale: "",
        observacion: observacion?.trim() || "",
        facturas: facturas || [],
        responsable: email,
        fecha: serverTimestamp(),
      });
    }

    tx.update(arriendoDoc, {
      devuelto: true,
      fechaDevolucion: serverTimestamp(),
      movimientoSalidaId: snap.exists() ? nuevoMovRef.id : null,
      observacionDevolucion: observacion?.trim() || "",
      // También quedan acá (no solo en el movimiento de salida): si el
      // producto ya no existe en el catálogo (se eliminó), no se crea
      // movimiento -- sin esto, la foto ya subida a Storage quedaría sin
      // ninguna referencia en Firestore, imposible de encontrar después.
      facturas: facturas || [],
    });
  });
}
