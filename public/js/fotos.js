// ─────────────────────────────────────────────────────────────────────────────
// Selector de fotos (o PDFs) reutilizable -- lo usan "Material entrante"
// (foto de la factura/guía), "Marcar herramienta devuelta" (guía de
// devolución) y Guías (agregar la foto a un ingreso que quedó sin ella).
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Dos botones, "Tomar foto" y "Elegir archivo", cada uno con su propia
 * entrada de archivo oculta -- separados porque mezclar accept="image/*,.pdf"
 * con capture="environment" en un solo campo hace que en varios celulares ya
 * no salte la cámara sola. Cada vez que se elige algo (con cualquiera de los
 * dos) se AGREGA a la lista, no la reemplaza -- "Tomar foto" de a una (la
 * cámara nativa no deja elegir varias), "Elegir archivo" permite varias de
 * una vez.
 */
export function crearSelectorFotos({ idCamara, idArchivo, idElegida, idBotonCamara, idBotonArchivo }) {
  const inputCamara = document.getElementById(idCamara);
  const inputArchivo = document.getElementById(idArchivo);
  const contElegida = document.getElementById(idElegida);
  let elegidas = [];

  function render() {
    contElegida.innerHTML = elegidas.map((archivo, i) => `
      <span class="badge badge-muted" style="display:inline-flex; align-items:center; gap:6px; margin:2px 6px 2px 0;">
        📎 ${esc(archivo.name)}
        <button type="button" class="btn-quitar-factura" data-idx="${i}" aria-label="Quitar" style="border:none; background:none; cursor:pointer; font-weight:700; line-height:1; padding:0;">×</button>
      </span>`).join("");
  }
  function agregar(archivos) {
    elegidas.push(...[...archivos].filter(Boolean));
    render();
  }
  contElegida.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-idx]");
    if (!btn) return;
    elegidas.splice(Number(btn.getAttribute("data-idx")), 1);
    render();
  });
  // Se limpia el valor del <input> tras leerlo: si no, elegir DE NUEVO el
  // mismo archivo (p. ej. sacar la misma foto dos veces) no dispara "change"
  // la segunda vez, porque el navegador ve el mismo valor.
  inputCamara.addEventListener("change", () => { agregar(inputCamara.files); inputCamara.value = ""; });
  inputArchivo.addEventListener("change", () => { agregar(inputArchivo.files); inputArchivo.value = ""; });
  document.getElementById(idBotonCamara).addEventListener("click", () => inputCamara.click());
  document.getElementById(idBotonArchivo).addEventListener("click", () => inputArchivo.click());

  return {
    obtenerElegidas: () => elegidas,
    limpiar() { elegidas = []; render(); },
  };
}
