// ─────────────────────────────────────────────────────────────────────────────
// Modo demo — datos de muestra para ver el avance sin configurar Firebase
// ─────────────────────────────────────────────────────────────────────────────
// Se activa abriendo cualquier página con  ?demo  (queda recordado).
// Se desactiva con  ?nodemo .
// En modo demo NO se guarda nada: los formularios muestran un aviso.
// ─────────────────────────────────────────────────────────────────────────────

import { ACTIVIDAD_DEVOLUCION_HERRAMIENTA } from "./constantes.js";

export const MODO_DEMO = (() => {
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("demo")) localStorage.setItem("modoDemo", "1");
    if (url.searchParams.has("nodemo")) localStorage.removeItem("modoDemo");
    return localStorage.getItem("modoDemo") === "1";
  } catch {
    return false;
  }
})();

/** Lanza el aviso estándar de modo demo (para bloquear escrituras). */
export function bloquearEnDemo() {
  throw new Error("Modo demo: los cambios no se guardan. Configura Firebase para usarlo de verdad.");
}

const hace = (segundos) => ({ toDate: () => new Date(Date.now() - segundos * 1000) });

export const MATERIALES_DEMO = [
  { id: "d1", item: 1, producto: "Cemento Portland 25 kg", categoria: "consumible", obra: "cclp2", unidad: "sacos", medida: "25 kg", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 42, stockMinimo: 20, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(3600) },
  { id: "d2", item: 2, producto: "Guantes de cabritilla", categoria: "epp", obra: "cclp2", unidad: "pares", medida: "Talla L", centroGestion: "Prevención", centroCosto: "CC-200", stock: 8, stockMinimo: 12, ubicacion: "Rack B-2", descripcion: "Talla L", actualizadoEn: hace(7200) },
  { id: "d3", item: 3, producto: 'Disco de corte 4½"', categoria: "consumible", obra: "data_centers", unidad: "unidades", medida: '4 1/2"', centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 0, stockMinimo: 10, ubicacion: "Rack C-1", descripcion: "", actualizadoEn: hace(90000) },
  { id: "d4", item: 4, producto: "Casco de seguridad", categoria: "epp", obra: "cclp2", unidad: "unidades", medida: "Único", centroGestion: "Prevención", centroCosto: "CC-200", stock: 25, stockMinimo: 10, ubicacion: "Estante EPP", descripcion: "", actualizadoEn: hace(1800) },
  { id: "d5", item: 5, producto: "Andamio marco 1.5 m", categoria: "equipo", obra: "data_centers", unidad: "cuerpos", medida: "1.5 m", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 16, stockMinimo: 0, ubicacion: "Patio B", descripcion: "", actualizadoEn: hace(260000) },
  { id: "d6", item: 6, producto: "Fierro estriado Ø10", categoria: "consumible", obra: "cclp2", unidad: "barras", medida: "Ø10 mm", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 120, stockMinimo: 50, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(400000) },
  { id: "d7", item: 7, producto: "Calentador industrial", categoria: "equipo", obra: "data_centers", unidad: "unidades", medida: "", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 0, stockMinimo: 1, sinReposicion: true, ubicacion: "Bodega", descripcion: "", actualizadoEn: hace(500000) },
  { id: "d8", item: 8, producto: "Taladro percutor Bosch", categoria: "herramienta", obra: "cclp2", unidad: "unidades", medida: "", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 4, stockMinimo: 2, ubicacion: "Bodega herramientas", descripcion: "", actualizadoEn: hace(50000) },
];

export const PEDIDOS_DEMO = [
  {
    id: "p1", numero: "PM-001", solicitante: "Juan Pérez", observacion: "Reposición mensual",
    obra: "cclp2",
    archivo: null,
    items: [
      { id: "i1", linea: "1", centroGestion: "Obra Gruesa", centroCosto: "CC-100", cantidad: 40, unidad: "sacos", glosa: "Cemento Portland 25 kg" },
      { id: "i2", linea: "2", centroGestion: "Prevención", centroCosto: "CC-200", cantidad: 20, unidad: "pares", glosa: "Guantes de cabritilla" },
      { id: "i3", linea: "3", centroGestion: "Obra Gruesa", centroCosto: "CC-100", cantidad: 5, unidad: "cuerpos", glosa: "Andamio marco 1.5 m" },
      { id: "i6", linea: "4", centroGestion: "Obra Gruesa", centroCosto: "CC-100", cantidad: 4, unidad: "unidades", glosa: "Chuzos" },
    ],
    creadoPor: "bodega@demo.cl", creadoEn: hace(10 * 86400),
  },
  {
    id: "p2", numero: "PM-002", solicitante: "María Soto", observacion: "",
    obra: "data_centers",
    archivo: null,
    items: [
      { id: "i4", linea: "1", centroGestion: "Obra Gruesa", centroCosto: "CC-100", cantidad: 30, unidad: "unidades", glosa: 'Disco de corte 4½"' },
      { id: "i5", linea: "2", centroGestion: "Obra Gruesa", centroCosto: "CC-100", cantidad: 3, unidad: "unidades", glosa: "Escoba industrial" },
    ],
    creadoPor: "bodega@demo.cl", creadoEn: hace(2 * 86400),
  },
];

export const ORDENES_DEMO = [
  {
    id: "o1", pmId: "p1", numero: "OC-1001", proveedor: "Cementos Melón", archivo: null,
    itemsCubiertos: [{ pmItemId: "i1", glosa: "Cemento Portland 25 kg", cantidad: 40, recibido: 40 }],
    recibida: true, recibidaEn: hace(3 * 86400),
    creadoPor: "bodega@demo.cl", creadoEn: hace(9 * 86400),
  },
  {
    id: "o2", pmId: "p1", numero: "OC-1002", proveedor: "3M Chile", archivo: null,
    itemsCubiertos: [{ pmItemId: "i2", glosa: "Guantes de cabritilla", cantidad: 20, recibido: 8 }],
    recibida: false, recibidaEn: null,
    creadoPor: "bodega@demo.cl", creadoEn: hace(8 * 86400),
  },
  {
    id: "o3", pmId: "p2", numero: "OC-2001", proveedor: "Ferretería Central", archivo: null,
    itemsCubiertos: [{ pmItemId: "i5", glosa: "Escoba industrial", cantidad: 3, recibido: 0 }],
    recibida: false, recibidaEn: null,
    creadoPor: "bodega@demo.cl", creadoEn: hace(86400),
  },
];

const FACTURA_DEMO = { nombre: "factura-demo.jpg", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='260'%3E%3Crect width='200' height='260' fill='white' stroke='%23ccc'/%3E%3Ctext x='20' y='40' font-size='16'%3EFactura demo%3C/text%3E%3C/svg%3E", path: "" };

export const FLETES_DEMO = [
  {
    id: "f1", empresa: "Transportes Rojas", tipo: "entrada", obra: "cclp2",
    detalle: "Cemento Portland 25 kg (40 sacos)", observacion: "",
    factura: FACTURA_DEMO, creadoPor: "bodega@demo.cl", creadoEn: hace(3600),
  },
  {
    id: "f2", empresa: "Retiros y Áridos SPA", tipo: "salida", obra: "data_centers",
    detalle: "Escombros de demolición, 2 viajes", observacion: "Sector Patio A",
    factura: null, creadoPor: "bodega@demo.cl", creadoEn: hace(90000),
  },
];

export const MOVIMIENTOS_DEMO = [
  { id: "m1", materialId: "d1", materialProducto: "Cemento Portland 25 kg", categoria: "consumible", obra: "cclp2", tipo: "entrada", cantidad: 20, stockResultante: 42, proveedor: "Cementos Melón", documento: "F-1023", fleteId: "f1", fleteEmpresa: "Transportes Rojas", factura: FACTURA_DEMO, motivo: "Llegada de material", responsable: "bodega@demo.cl", fecha: hace(3600) },
  { id: "m2", materialId: "d2", materialProducto: "Guantes de cabritilla", categoria: "epp", obra: "cclp2", tipo: "salida", cantidad: 4, stockResultante: 8, supervisor: "J. Soto", actividad: "Enfierradura", zona: "Torre B, nivel 3", personaRetira: "P. Muñoz", numeroVale: "V-0087", observacion: "", responsable: "bodega@demo.cl", fecha: hace(7200) },
  { id: "m3", materialId: "d4", materialProducto: "Casco de seguridad", categoria: "epp", obra: "cclp2", tipo: "entrada", cantidad: 10, stockResultante: 25, proveedor: "3M Chile", documento: "F-1019", ordenCompraId: "o2", ordenCompraNumero: "OC-1002", motivo: "Llegada de material", responsable: "bodega@demo.cl", fecha: hace(90000) },
  { id: "m4", materialId: "d6", materialProducto: "Fierro estriado Ø10", categoria: "consumible", obra: "cclp2", tipo: "salida", cantidad: 30, stockResultante: 120, supervisor: "R. Díaz", actividad: "Fundaciones", zona: "Sector Patio A", personaRetira: "L. Vera", numeroVale: "V-0086", observacion: "Urgente", responsable: "bodega@demo.cl", fecha: hace(400000) },
  { id: "m5", materialId: "d5", materialProducto: "Andamio marco 1.5 m", categoria: "equipo", obra: "data_centers", tipo: "entrada", cantidad: 16, stockResultante: 16, proveedor: "Arriendos Layher", documento: "G-334", motivo: "Llegada de material", responsable: "bodega@demo.cl", fecha: hace(400000) },
  { id: "m6", materialId: "d8", materialProducto: "Taladro percutor Bosch", categoria: "herramienta", obra: "cclp2", tipo: "entrada", cantidad: 2, stockResultante: 4, proveedor: "Arriendos Layher", documento: "G-410", tipoAdquisicion: "arrendada", empresaArriendo: "Arriendos Layher", motivo: "Llegada de material", responsable: "bodega@demo.cl", fecha: hace(50000) },
  // Devolución de la "Amoladora angular inalámbrica" (ver ARRIENDOS_DEMO/a2, ya devuelto) -- con foto de la guía de devolución, para poder verla en Guías.
  { id: "m0s", materialId: "d8", materialProducto: "Amoladora angular inalámbrica", categoria: "herramienta", obra: "data_centers", tipo: "salida", cantidad: 1, stockResultante: 0, supervisor: "", actividad: ACTIVIDAD_DEVOLUCION_HERRAMIENTA, zona: "", personaRetira: "Hilti Chile", numeroVale: "", observacion: "", facturas: [FACTURA_DEMO], responsable: "bodega@demo.cl", fecha: hace(20000) },
];

// Herramientas arrendadas: pendientes por devolver (o ya devueltas) a la
// empresa arrendadora -- ver herramientas.js.
export const ARRIENDOS_DEMO = [
  {
    id: "a1", materialId: "d8", materialProducto: "Taladro percutor Bosch", obra: "cclp2", cantidad: 2,
    empresa: "Arriendos Layher", movimientoEntradaId: "m6", observacion: "",
    devuelto: false, fechaDevolucion: null, movimientoSalidaId: null,
    creadoPor: "bodega@demo.cl", creadoEn: hace(50000),
  },
  {
    id: "a2", materialId: "d8", materialProducto: "Amoladora angular inalámbrica", obra: "data_centers", cantidad: 1,
    empresa: "Hilti Chile", movimientoEntradaId: "m0", observacion: "",
    devuelto: true, fechaDevolucion: hace(20000), movimientoSalidaId: "m0s",
    creadoPor: "bodega@demo.cl", creadoEn: hace(300000),
  },
];

// Vales de entrega (ver js/vales.js). Los uid calzan con el perfil simulado
// de cada rol en modo demo (js/auth.js/perfilDemo: ?rol=capataz, etc.).
export const VALES_DEMO = [
  {
    id: "v3", numero: 3, obra: "cclp2", tipo: "material", trabajador: "Pedro Muñoz", actividad: "Moldaje losa nivel 4",
    observacion: "", items: [
      { materialId: "d1", producto: "Cemento Portland 25 kg", unidad: "sacos", cantidad: 5 },
      { materialId: "d6", producto: "Fierro estriado Ø10", unidad: "barras", cantidad: 12 },
    ],
    solicitanteUid: "demo-capataz", solicitanteNombre: "Carlos Urbina", solicitanteEmail: "capataz@demo.cl", solicitanteRol: "capataz",
    estado: "pendiente", creadoEn: hace(900),
  },
  {
    id: "v2", numero: 2, obra: "cclp2", tipo: "epp", trabajador: "Luis Vera", actividad: "Enfierradura",
    observacion: "Guantes se rompieron", items: [
      { materialId: "d2", producto: "Guantes de cabritilla", unidad: "pares", cantidad: 20 },
    ],
    solicitanteUid: "demo-prevencionista", solicitanteNombre: "Inti Henriquez", solicitanteEmail: "prevencionista@demo.cl", solicitanteRol: "prevencionista",
    estado: "pendiente", creadoEn: hace(3000),
  },
  {
    id: "v1", numero: 1, obra: "cclp2", tipo: "material", trabajador: "Juan Soto", actividad: "Fundaciones",
    observacion: "", items: [
      { materialId: "d6", producto: "Fierro estriado Ø10", unidad: "barras", cantidad: 30 },
    ],
    solicitanteUid: "demo-supervisor", solicitanteNombre: "Alejandro Pastrian", solicitanteEmail: "supervisor@demo.cl", solicitanteRol: "supervisor",
    estado: "entregado", creadoEn: hace(401000), entregadoPor: "bodega@demo.cl", entregadoEn: hace(400000), movimientoIds: ["m4"],
  },
];
