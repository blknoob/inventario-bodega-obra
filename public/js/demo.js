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
  { id: "d1", nombre: "Cemento Portland 25 kg", categoria: "consumible", unidad: "sacos", stock: 42, stockMinimo: 20, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(3600) },
  { id: "d2", nombre: "Guantes de cabritilla", categoria: "epp", unidad: "pares", stock: 8, stockMinimo: 12, ubicacion: "Rack B-2", descripcion: "Talla L", actualizadoEn: hace(7200) },
  { id: "d3", nombre: 'Disco de corte 4½"', categoria: "consumible", unidad: "unidades", stock: 0, stockMinimo: 10, ubicacion: "Rack C-1", descripcion: "", actualizadoEn: hace(90000) },
  { id: "d4", nombre: "Casco de seguridad", categoria: "epp", unidad: "unidades", stock: 25, stockMinimo: 10, ubicacion: "Estante EPP", descripcion: "", actualizadoEn: hace(1800) },
  { id: "d5", nombre: "Andamio marco 1.5 m", categoria: "equipo", unidad: "cuerpos", stock: 16, stockMinimo: 0, ubicacion: "Patio B", descripcion: "", actualizadoEn: hace(260000) },
  { id: "d6", nombre: "Fierro estriado Ø10", categoria: "consumible", unidad: "barras", stock: 120, stockMinimo: 50, ubicacion: "Patio A", descripcion: "", actualizadoEn: hace(400000) },
];
