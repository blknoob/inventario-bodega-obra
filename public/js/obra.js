// ─────────────────────────────────────────────────────────────────────────────
// Obra activa — para dividir materiales, EPP y herramientas de una misma
// bodega entre distintas obras (ej: CCLP II y Data Centers).
// ─────────────────────────────────────────────────────────────────────────────
// Es un filtro de vista, no de permisos: sigue habiendo una sola cuenta de
// bodega y la lectura sigue siendo pública para las dos obras -- lo único
// que cambia es qué se ve (y a cuál obra queda asociado lo que se crea).
// Se guarda en localStorage (por navegador, no por cuenta) y el cambio se
// avisa con un evento de `window` para que las páginas que ya tienen datos
// cargados puedan refiltrar sin volver a pedirlos.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = "obraActiva";
const EVENTO = "obra:cambio";

export const OBRAS = [
  { valor: "cclp2", etiqueta: "CCLP II" },
  { valor: "data_centers", etiqueta: "Data Centers" },
];

export function etiquetaObra(valor) {
  return OBRAS.find((o) => o.valor === valor)?.etiqueta ?? valor;
}

/** Obra activa en este navegador. Si no hay ninguna guardada (o ya no existe), usa la primera. */
export function obraActiva() {
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (OBRAS.some((o) => o.valor === guardada)) return guardada;
  } catch {
    // localStorage no disponible (privado/bloqueado): sigue con la primera.
  }
  return OBRAS[0].valor;
}

/** Cambia la obra activa y avisa a esta misma pestaña del cambio. */
export function setObraActiva(valor) {
  if (!OBRAS.some((o) => o.valor === valor)) return;
  try {
    localStorage.setItem(CLAVE, valor);
  } catch {
    // Sin localStorage no queda recordada, pero el evento igual se dispara.
  }
  window.dispatchEvent(new CustomEvent(EVENTO));
}

/** Ejecuta el callback cada vez que cambia la obra activa. Devuelve la función para dejar de escuchar. */
export function escucharObraActiva(callback) {
  window.addEventListener(EVENTO, callback);
  return () => window.removeEventListener(EVENTO, callback);
}
