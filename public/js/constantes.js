// ─────────────────────────────────────────────────────────────────────────────
// Constantes compartidas entre varios módulos, sin depender unas de otras.
// ─────────────────────────────────────────────────────────────────────────────
// Este archivo no importa nada de nadie: es justamente el lugar para una
// constante que necesitan tanto herramientas.js como demo.js. herramientas.js
// ya importa demo.js (MODO_DEMO, ARRIENDOS_DEMO, bloquearEnDemo) -- si la
// constante viviera en herramientas.js, demo.js no podría importarla de
// vuelta sin crear una dependencia circular entre ambos módulos. Puesto acá,
// los dos la leen del mismo lugar sin ese problema.

// Texto exacto del campo "actividad" con el que queda marcado el movimiento
// de salida que genera una devolución de herramienta arrendada (ver
// js/herramientas.js/devolverHerramienta). guias.html lo usa para reconocer
// esos movimientos entre todas las salidas y mostrarlos como "Devolución".
export const ACTIVIDAD_DEVOLUCION_HERRAMIENTA = "Devolución de herramienta arrendada";
