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
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { usuarioActual } from "./auth.js";
import { MODO_DEMO, MATERIALES_DEMO, MOVIMIENTOS_DEMO, bloquearEnDemo } from "./demo.js";
import { OBRAS } from "./obra.js";

const materialesRef = collection(db, "materiales");
const movimientosRef = collection(db, "movimientos_materiales");
const contadorMaterialesDoc = doc(db, "contadores", "materiales");

export const CATEGORIAS = [
  { valor: "consumible", etiqueta: "Consumible" },
  { valor: "epp", etiqueta: "EPP" },
  { valor: "herramienta", etiqueta: "Herramienta" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "otro", etiqueta: "Otro" },
];

export function etiquetaCategoria(valor) {
  return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

// Solo aplica a herramientas (ver materiales.html, bloque "e-nuevo-campos").
export const TIPOS_HERRAMIENTA = [
  { valor: "manual", etiqueta: "Manual" },
  { valor: "electrica", etiqueta: "Eléctrica" },
  { valor: "inalambrica", etiqueta: "Inalámbrica" },
];

export function etiquetaTipoHerramienta(valor) {
  return TIPOS_HERRAMIENTA.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

/**
 * Escucha en tiempo real los materiales de una obra. Entrega un array
 * ordenado por producto. Devuelve la función para desuscribirse.
 */
export function escucharMateriales(obra, onCambio, onError) {
  if (MODO_DEMO) {
    onCambio(MATERIALES_DEMO.filter((m) => m.obra === obra).sort((a, b) =>
      a.producto.localeCompare(b.producto, "es", { sensitivity: "base" })));
    return () => {};
  }
  return onSnapshot(
    query(materialesRef, where("obra", "==", obra)),
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

function conTope(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}

/**
 * Sube las fotos (o PDFs) de una guía a Storage y devuelve sus datos para
 * guardar junto al movimiento. Puede ser más de una (una guía suele traer
 * varias hojas, o factura + guía de despacho por separado). Se suben UNA vez
 * por lo que se registra en el diálogo correspondiente (aunque sean varios
 * productos a la vez: son las mismas fotos para todos), así que se llama
 * antes de crear el movimiento, no dentro de registrarEntrada/devolverHerramienta.
 *
 * `carpetaBase` separa las fotos de un ingreso ("entradas", el valor por
 * defecto) de las de una devolución de herramienta arrendada ("devoluciones",
 * ver js/herramientas.js) -- mismo mecanismo, distinta carpeta en Storage.
 */
export async function subirFacturasEntrada(archivos, carpetaBase = "entradas") {
  const lista = (archivos || []).filter(Boolean);
  if (!lista.length) return [];
  const carpeta = crypto.randomUUID(); // misma carpeta para todas las fotos de esta guía
  return Promise.all(lista.map(async (archivo, i) => {
    // El índice va en la ruta (no solo el nombre) porque dos fotos de la
    // misma guía pueden llegar con el mismo nombre de archivo (p. ej. la
    // cámara del celular nombra "image.jpg" a cada foto que toma): sin
    // esto, la segunda subida pisaría a la primera en Storage.
    const path = `${carpetaBase}/${carpeta}/${i}-${archivo.name}`;
    const archivoRef = ref(storage, path);
    await conTope(
      uploadBytes(archivoRef, archivo),
      20000,
      `No se pudo subir "${archivo.name}" (se demoró demasiado). Revisa que Firebase Storage esté activado para este proyecto.`,
    );
    const url = await getDownloadURL(archivoRef);
    return { nombre: archivo.name, url, path };
  }));
}

/**
 * Fotos de factura/guía de un movimiento, con compatibilidad hacia atrás:
 * los movimientos creados antes de admitir más de una foto traen una sola en
 * `factura` (objeto); los nuevos traen `facturas` (arreglo, puede ir vacío).
 */
export function facturasDe(movimiento) {
  if (movimiento.facturas?.length) return movimiento.facturas;
  return movimiento.factura ? [movimiento.factura] : [];
}

/**
 * Registra material entrante: si `materialId` viene vacío, crea el producto
 * (con correlativo automático "item") con el stock inicial recibido; si viene
 * un id existente, solo suma esa cantidad a su stock. En ambos casos deja un
 * movimiento de tipo "entrada" en el historial. Todo en una sola transacción.
 */
export async function registrarEntrada({ materialId, nuevoMaterial, cantidadRecibida, proveedor, documento, motivo, observacionRecepcion, ubicacion, ordenCompraId, ordenCompraNumero, pmItemId, fleteId, fleteEmpresa, facturas, tipoAdquisicion, empresaArriendo }) {
  if (MODO_DEMO) bloquearEnDemo();
  const cant = Number(cantidadRecibida);
  if (!(cant > 0)) throw new Error("La cantidad recibida debe ser mayor que cero.");

  const email = usuarioActual()?.email ?? null;
  const nuevoMovRef = doc(movimientosRef);

  const resultado = await runTransaction(db, async (tx) => {
    let materialDoc, productoNombre, categoriaMovimiento, obraMovimiento, resultante;

    // Si este ingreso viene de un ítem puntual de una orden de compra, hay
    // que leerla ANTES de cualquier escritura (regla de las transacciones
    // de Firestore: todas las lecturas van primero) para poder descontar
    // lo recibido de lo pedido en esa orden.
    let ordenDoc = null;
    let ordenSnap = null;
    if (ordenCompraId && pmItemId) {
      ordenDoc = doc(db, "ordenes_compra", ordenCompraId);
      ordenSnap = await tx.get(ordenDoc);
    }

    if (materialId) {
      materialDoc = doc(db, "materiales", materialId);
      const snap = await tx.get(materialDoc);
      if (!snap.exists()) throw new Error("El material ya no existe.");
      productoNombre = snap.data().producto;
      categoriaMovimiento = snap.data().categoria;
      obraMovimiento = snap.data().obra || OBRAS[0].valor;
      const actual = Number(snap.data().stock) || 0;
      resultante = Math.round((actual + cant) * 1000) / 1000;
      // La ubicación solo se toca si se indicó una -- si se deja en blanco
      // (p. ej. no se sabía en ese momento), no borra la que ya tenía.
      tx.update(materialDoc, {
        stock: resultante,
        actualizadoEn: serverTimestamp(),
        ...(ubicacion?.trim() ? { ubicacion: ubicacion.trim() } : {}),
      });
    } else {
      if (!nuevoMaterial?.producto?.trim()) throw new Error("Indica el nombre del producto.");
      const contadorSnap = await tx.get(contadorMaterialesDoc);
      const item = (Number(contadorSnap.data()?.valor) || 0) + 1;
      tx.set(contadorMaterialesDoc, { valor: item }, { merge: true });

      materialDoc = doc(materialesRef);
      productoNombre = nuevoMaterial.producto.trim();
      categoriaMovimiento = nuevoMaterial.categoria;
      obraMovimiento = nuevoMaterial.obra || OBRAS[0].valor;
      resultante = cant;
      tx.set(materialDoc, {
        item,
        producto: productoNombre,
        categoria: nuevoMaterial.categoria,
        obra: obraMovimiento,
        unidad: nuevoMaterial.unidad.trim(),
        medida: nuevoMaterial.medida?.trim() || "",
        centroGestion: nuevoMaterial.centroGestion?.trim() || "",
        centroCosto: nuevoMaterial.centroCosto?.trim() || "",
        stock: cant,
        stockMinimo: Number(nuevoMaterial.stockMinimo) || 0,
        ubicacion: nuevoMaterial.ubicacion?.trim() || "",
        descripcion: nuevoMaterial.descripcion?.trim() || "",
        tipoHerramienta: nuevoMaterial.categoria === "herramienta" ? (nuevoMaterial.tipoHerramienta?.trim() || "") : "",
        creadoPor: email,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
    }

    tx.set(nuevoMovRef, {
      materialId: materialDoc.id,
      materialProducto: productoNombre,
      categoria: categoriaMovimiento,
      obra: obraMovimiento,
      tipo: "entrada",
      cantidad: cant,
      stockResultante: resultante,
      proveedor: proveedor?.trim() || "",
      documento: documento?.trim() || "",
      motivo: motivo?.trim() || "Llegada de material",
      // Solo aplica a ítems elegidos de un Pedido de Materiales: por si
      // llegó distinto a lo pedido (otra cantidad, cambiaron de marca...),
      // sin mezclarlo con el motivo general de todo el registro.
      observacionRecepcion: observacionRecepcion?.trim() || "",
      ordenCompraId: ordenCompraId || null,
      ordenCompraNumero: ordenCompraNumero?.trim() || "",
      pmItemId: pmItemId || null,
      fleteId: fleteId || null,
      fleteEmpresa: fleteEmpresa?.trim() || "",
      facturas: facturas || [],
      // Solo aplica a herramientas: si esta llegada es de una herramienta
      // arrendada (no comprada), hay que poder verla después como
      // "pendiente por devolver" -- ver herramientas.js/crearArriendo, que
      // se llama aparte con el id de este movimiento (movimientoEntradaId).
      tipoAdquisicion: tipoAdquisicion || null,
      empresaArriendo: tipoAdquisicion === "arrendada" ? (empresaArriendo?.trim() || "") : "",
      responsable: email,
      fecha: serverTimestamp(),
    });

    // Descuenta lo recibido de lo pedido en esa orden de compra, para
    // saber cuánto queda pendiente de ese ítem del PM.
    if (ordenDoc && ordenSnap?.exists()) {
      const itemsCubiertos = (ordenSnap.data().itemsCubiertos || []).map((it) =>
        it.pmItemId === pmItemId
          ? { ...it, recibido: Math.round(((Number(it.recibido) || 0) + cant) * 1000) / 1000 }
          : it,
      );
      tx.update(ordenDoc, { itemsCubiertos });
    }

    return { materialId: materialDoc.id, materialProducto: productoNombre, obra: obraMovimiento };
  });

  // Id del material y del movimiento recién creados: los necesita el
  // llamador para, si esto era una herramienta arrendada, dejar registrado
  // aparte que queda pendiente por devolver (ver herramientas.js).
  return { ...resultado, movimientoId: nuevoMovRef.id };
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
      obra: snap.data().obra || OBRAS[0].valor,
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
 * Marca o desmarca un material como "no se repone" (ej: un equipo único que
 * no se va a volver a comprar). Mientras esté marcado, no cuenta como alerta
 * de stock aunque esté bajo o en cero.
 */
export async function marcarSinReposicion(materialId, sinReposicion) {
  if (MODO_DEMO) bloquearEnDemo();
  await updateDoc(doc(db, "materiales", materialId), { sinReposicion: !!sinReposicion });
}

/**
 * Escucha en tiempo real el historial de movimientos de una obra (entradas y
 * salidas), más recientes primero. Devuelve la función para desuscribirse.
 */
export function escucharMovimientos(obra, onCambio, onError, { max = 300 } = {}) {
  if (MODO_DEMO) {
    onCambio(MOVIMIENTOS_DEMO.filter((m) => m.obra === obra).sort((a, b) => b.fecha.toDate() - a.fecha.toDate()));
    return () => {};
  }
  const q = query(movimientosRef, where("obra", "==", obra), orderBy("fecha", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => onCambio(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

/** Devuelve el estado del stock frente al mínimo: 'ok' | 'bajo' | 'cero'. */
export function nivelStock(material) {
  if (material.sinReposicion) return "ok";
  const stock = Number(material.stock) || 0;
  const min = Number(material.stockMinimo) || 0;
  if (stock <= 0) return "cero";
  if (min > 0 && stock <= min) return "bajo";
  return "ok";
}
