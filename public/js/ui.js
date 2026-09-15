// ─────────────────────────────────────────────────────────────────────────────
// UI compartida — barra superior y estado de sesión
// ─────────────────────────────────────────────────────────────────────────────

import { observarSesion, cerrarSesion } from "./auth.js";
import { MODO_DEMO } from "./demo.js";
import { OBRAS, obraActiva, setObraActiva } from "./obra.js";

/**
 * Monta la barra superior en <header id="topbar"> y refleja el estado de sesión.
 * @param {string} activo  clave de la sección activa: 'inicio' | 'materiales' | 'epps' | 'herramientas' | 'historial' | 'compras' | 'guias' | 'bodega'
 */
export function montarTopbar(activo = "") {
  const header = document.getElementById("topbar");
  if (!header) return;

  const link = (href, key, label) =>
    `<a href="${href}" class="${key === activo ? "active" : ""}">${label}</a>`;

  const optsObra = OBRAS.map((o) => `<option value="${o.valor}">${o.etiqueta}</option>`).join("");

  header.className = "topbar";
  header.innerHTML = `
    <a class="brand" href="index.html">Control de Inventario <b>DPC</b></a>
    <select id="selector-obra" class="selector-obra" title="Obra activa" aria-label="Obra activa">${optsObra}</select>
    <button type="button" class="menu-toggle" id="menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="topbar-nav">
      <span class="bar"></span><span class="bar"></span><span class="bar"></span>
    </button>
    <nav id="topbar-nav">
      ${link("index.html", "inicio", "Inicio")}
      ${link("materiales.html", "materiales", "Materiales")}
      ${link("materiales.html?categoria=epp", "epps", "EPPs")}
      ${link("materiales.html?categoria=herramienta", "herramientas", "Herramientas")}
      ${link("historial.html", "historial", "Historial")}
      ${link("compras.html", "compras", "Seguimiento de Compras")}
      ${link("guias.html", "guias", "Guías")}
      <span id="nav-session"></span>
      ${MODO_DEMO ? '<span class="badge badge-warn" title="Datos de muestra; no se guarda nada">DEMO</span>' : ""}
    </nav>
  `;

  // Selector de obra: divide materiales, EPP y herramientas de la misma
  // bodega entre CCLP II y Data Centers (ver public/js/obra.js). Es de
  // vista, no de permisos: se ve y se puede cambiar sin haber iniciado
  // sesión de bodega.
  const selectorObra = header.querySelector("#selector-obra");
  selectorObra.value = obraActiva();
  selectorObra.addEventListener("change", () => setObraActiva(selectorObra.value));

  // Menú hamburguesa (solo se ve en pantallas angostas, vía CSS).
  const toggle = header.querySelector("#menu-toggle");
  const nav = header.querySelector("#topbar-nav");
  toggle.addEventListener("click", () => {
    const abierto = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(abierto));
  });
  // Clic afuera del menú (y no en el botón que lo abre) lo cierra.
  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });

  if (MODO_DEMO) {
    // En demo mostramos los controles de bodega para ver la interfaz completa.
    document.body.classList.add("es-bodega");
  }

  const slot = header.querySelector("#nav-session");
  slot.innerHTML = `<a href="login.html">Ingreso bodega</a>`; // hasta que resuelva la sesión
  observarSesion((user) => {
    if (!MODO_DEMO) document.body.classList.toggle("es-bodega", !!user);
    if (user) {
      slot.innerHTML = `
        <a href="bodega.html" class="${activo === "bodega" ? "active" : ""}">Panel bodega</a>
        <a href="#" id="btn-logout">Salir</a>
      `;
      slot.querySelector("#btn-logout").addEventListener("click", async (e) => {
        e.preventDefault();
        await cerrarSesion();
        location.href = "index.html";
      });
    } else {
      slot.innerHTML = `<a href="login.html">Ingreso bodega</a>`;
    }
  });
}

/** Muestra un mensaje temporal en el contenedor #flash. */
export function flash(mensaje, tipo = "ok") {
  const box = document.getElementById("flash");
  if (!box) return;
  box.className = `alert alert-${tipo}`;
  box.textContent = mensaje;
  box.classList.remove("hidden");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => box.classList.add("hidden"), 4000);
}
