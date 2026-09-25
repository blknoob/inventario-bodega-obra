// ─────────────────────────────────────────────────────────────────────────────
// UI compartida — barra superior y estado de sesión
// ─────────────────────────────────────────────────────────────────────────────

import { observarPerfil, cerrarSesion, esSolicitante } from "./auth.js";
import { MODO_DEMO } from "./demo.js";
import { OBRAS, obraActiva, setObraActiva, escucharConObraActiva } from "./obra.js";
import { escucharValesPendientes } from "./vales.js";

/**
 * Monta la barra superior en <header id="topbar"> y refleja el estado de sesión.
 * @param {string} activo  clave de la sección activa: 'inicio' | 'materiales' | 'epps' | 'herramientas' | 'historial' | 'compras' | 'guias' | 'vales' | 'bodega'
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
    <div class="topbar-obra">
      <select id="selector-obra" class="selector-obra" title="Obra activa" aria-label="Obra activa">${optsObra}</select>
      <span class="sesion-actual hidden" id="sesion-actual"></span>
    </div>
    <button type="button" class="menu-toggle" id="menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="topbar-nav">
      <span class="bar"></span><span class="bar"></span><span class="bar"></span>
    </button>
    <nav id="topbar-nav">
      <span class="sesion-actual sesion-actual-menu hidden" id="sesion-actual-menu"></span>
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

  const slot = header.querySelector("#nav-session");
  slot.innerHTML = `<a href="login.html">Ingresar</a>`; // hasta que resuelva la sesión
  let dejarDeContarVales = null;
  observarPerfil((perfil) => {
    // Los controles de bodega (clase .only-bodega) solo con rol bodega: una
    // cuenta de capataz/supervisor/prevencionista también tiene sesión, pero
    // no puede editar el inventario (las reglas se lo rechazarían igual).
    // En demo el perfil es simulado (bodega por defecto, ver js/auth.js).
    const esBodega = perfil?.rol === "bodega";
    document.body.classList.toggle("es-bodega", esBodega);

    // "Sesión: Carlos Urbina" junto al selector de obra (y arriba del menú
    // en celular). La cuenta de bodega no tiene nombre propio: "Bodega".
    const nombreSesion = !perfil ? "" : perfil.user.displayName || (esBodega ? "Bodega" : perfil.nombre);
    for (const id of ["sesion-actual", "sesion-actual-menu"]) {
      const el = header.querySelector(`#${id}`);
      el.innerHTML = "";
      if (nombreSesion) el.append("Sesión: ", Object.assign(document.createElement("b"), { textContent: nombreSesion }));
      el.classList.toggle("hidden", !nombreSesion);
    }
    dejarDeContarVales?.();
    dejarDeContarVales = null;

    if (!perfil) {
      slot.innerHTML = `<a href="login.html">Ingresar</a>`;
      return;
    }
    // Clave temporal: hasta definir la propia no puede seguir navegando con sesión.
    if (perfil.debeCambiarClave && !location.pathname.endsWith("cambiar-clave.html")) {
      location.replace(`cambiar-clave.html?volver=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`);
      return;
    }
    if (esBodega || esSolicitante(perfil.rol)) {
      slot.innerHTML = `
        <a href="vales.html" class="${activo === "vales" ? "active" : ""}" title="${esBodega ? "Vales por entregar" : "Mis vales"}">${esBodega ? "Bandeja de entrada" : "Vales"} <span class="badge badge-warn hidden" id="nav-vales-pendientes"></span></a>
        ${esBodega ? `<a href="bodega.html" class="${activo === "bodega" ? "active" : ""}">Panel bodega</a>` : ""}
        <a href="#" id="btn-logout">Salir</a>
      `;
    } else {
      // Sesión sin rol asignado: no puede hacer nada más que salir.
      slot.innerHTML = `<a href="#" id="btn-logout">Salir</a>`;
    }
    slot.querySelector("#btn-logout").addEventListener("click", async (e) => {
      e.preventDefault();
      if (MODO_DEMO) return;
      await cerrarSesion();
      location.href = "index.html";
    });

    // Aviso de vales por entregar (solo bodega, que es quien los entrega).
    if (esBodega) {
      const contador = slot.querySelector("#nav-vales-pendientes");
      dejarDeContarVales = escucharConObraActiva(
        escucharValesPendientes,
        (n) => { contador.textContent = n; contador.classList.toggle("hidden", !n); },
        () => contador.classList.add("hidden"),
      );
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
