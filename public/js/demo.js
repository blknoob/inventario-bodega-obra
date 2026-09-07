// ─────────────────────────────────────────────────────────────────────────────
// Modo demo — datos de muestra para ver el avance sin configurar Firebase
// ─────────────────────────────────────────────────────────────────────────────
// Se activa abriendo cualquier página con  ?demo  (queda recordado).
// Se desactiva con  ?nodemo .
// En modo demo NO se guarda nada: los formularios muestran un aviso.
// ─────────────────────────────────────────────────────────────────────────────

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
  { id: "d1", item: 1, producto: "Cemento Portland 25 kg", categoria: "consumible", unidad: "sacos", medida: "25 kg", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 42, stockMinimo: 20, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(3600) },
  { id: "d2", item: 2, producto: "Guantes de cabritilla", categoria: "epp", unidad: "pares", medida: "Talla L", centroGestion: "Prevención", centroCosto: "CC-200", stock: 8, stockMinimo: 12, ubicacion: "Rack B-2", descripcion: "Talla L", actualizadoEn: hace(7200) },
  { id: "d3", item: 3, producto: 'Disco de corte 4½"', categoria: "consumible", unidad: "unidades", medida: '4 1/2"', centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 0, stockMinimo: 10, ubicacion: "Rack C-1", descripcion: "", actualizadoEn: hace(90000) },
  { id: "d4", item: 4, producto: "Casco de seguridad", categoria: "epp", unidad: "unidades", medida: "Único", centroGestion: "Prevención", centroCosto: "CC-200", stock: 25, stockMinimo: 10, ubicacion: "Estante EPP", descripcion: "", actualizadoEn: hace(1800) },
  { id: "d5", item: 5, producto: "Andamio marco 1.5 m", categoria: "equipo", unidad: "cuerpos", medida: "1.5 m", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 16, stockMinimo: 0, ubicacion: "Patio B", descripcion: "", actualizadoEn: hace(260000) },
  { id: "d6", item: 6, producto: "Fierro estriado Ø10", categoria: "consumible", unidad: "barras", medida: "Ø10 mm", centroGestion: "Obra Gruesa", centroCosto: "CC-100", stock: 120, stockMinimo: 50, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(400000) },
];
