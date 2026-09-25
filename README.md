# Inventario de Bodega — Obra

Control en tiempo real de **materiales** (consumibles, EPP, equipos) y **herramientas**
(manuales, eléctricas, inalámbricas) de la bodega de una obra.

- **Bodega** inicia sesión y carga ingresos/salidas, y entrega los vales.
- **Capataz / supervisor** (materiales) y **prevencionista de riesgos** (EPP) inician
  sesión para pedir vales de entrega para un trabajador (`vales.html`); el stock se
  descuenta cuando bodega marca el vale como entregado.
- **Todo el equipo** (supervisores, jefes de terreno, administración) consulta el
  inventario sin necesidad de cuenta.
- Base de datos en **Firebase / Firestore**: los cambios se ven al instante en
  todas las pantallas abiertas.

## Arquitectura

Sitio estático (`public/`) servido por **Firebase Hosting**, que habla directamente
con **Firestore** usando listeners en tiempo real. No hay servidor propio.

```
public/
  index.html          Panel de consulta (lectura pública, contadores en vivo)
  login.html          Ingreso de bodega
  bodega.html         Panel de carga (requiere sesión)
  materiales.html     Inventario de materiales + alta + registrar llegada
  herramientas.html   Placeholder → Tramo 4
  css/styles.css
  js/
    firebase-config.js  Configuración del proyecto Firebase  ← EDITAR
    auth.js             Login / logout / guardia de sesión
    ui.js               Barra superior y avisos
    materiales.js       Capa de datos de materiales (Firestore en tiempo real)
    demo.js             Modo demo con datos de muestra (?demo)
firestore.rules       Reglas de seguridad (lectura pública, escritura autenticada)
firebase.json         Config de Hosting + Firestore
.firebaserc           ID del proyecto Firebase  ← EDITAR
```

### Modelo de datos (Firestore)

| Colección | Contenido |
|---|---|
| `materiales` | Un doc por tipo de material: `nombre, categoria, unidad, stock, stockMinimo, ubicacion, descripcion`. `stock` se actualiza solo al registrar movimientos. |
| `movimientos_materiales` | Registro histórico inmutable: `materialId, materialNombre, tipo (entrada), cantidad, stockResultante, proveedor, documento, motivo, responsable, fecha`. |

| `vales` | Vale de entrega: `numero, obra, tipo (material/epp), trabajador, actividad, items[], solicitante*, estado (pendiente/entregado/rechazado)`. Al entregarlo se crea un movimiento de salida por producto con `numeroVale` y `valeId`. |
| `usuarios` | `usuarios/{uid}.claveDefinida`: la persona ya reemplazó su clave temporal. |

Registrar una llegada suma al `stock` y crea el movimiento en una sola transacción atómica.

### Cuentas y roles

El rol de cada cuenta es un custom claim (`rol`: `bodega`, `capataz`, `supervisor`,
`prevencionista`) que solo se asigna con el Admin SDK. Las cuentas están listadas en
`scripts/usuarios.mjs`; para crearlas o cambiarles el rol:

```bash
cd scripts && npm install
GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/clave-admin.json node usuarios.mjs
```

Las cuentas nuevas quedan con una clave temporal (el script la imprime) y en su primer
ingreso la app las obliga a crear su propia clave (mín. 8 caracteres, letras y números).
`node usuarios.mjs --reiniciar-clave correo@dpc.cl` le da una clave temporal nueva a
alguien que olvidó la suya. La clave de administrador **nunca** va al repo.

En modo demo se puede ver cada rol con `?rol=capataz` (o `supervisor`, `prevencionista`, `bodega`).

## Puesta en marcha (una sola vez)

### 1. Crear el proyecto Firebase

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto**.
2. Nombre: p. ej. `inventario-bodega-obra`. Puedes desactivar Google Analytics.
3. Dentro del proyecto: **Compilación → Firestore Database → Crear base de datos**
   → modo **producción** → ubicación `southamerica-east1` (o la más cercana).
4. **Compilación → Authentication → Comenzar → Habilitar "Correo electrónico/contraseña"**.
5. En Authentication → pestaña **Users → Agregar usuario**: crea la cuenta de bodega
   (ej. `bodega@obra.cl` + una contraseña). Esa es la única cuenta que carga datos.

### 2. Conectar la app web

1. En **⚙ Configuración del proyecto → Tus apps → `</>` (Web)** → registra una app.
2. Copia el objeto `firebaseConfig` y pégalo en
   [`public/js/firebase-config.js`](public/js/firebase-config.js).
3. Pon el ID del proyecto en [`.firebaserc`](.firebaserc) (reemplaza `TU_PROYECTO`).

### 3. Instalar la CLI de Firebase y publicar

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,hosting
```

Al terminar, la CLI muestra la URL pública (`https://TU_PROYECTO.web.app`).

## Ver los avances

Tres formas, de menos a más fiel:

### 1. Modo demo (sin nada instalado)

Sirve la carpeta y abre con `?demo`:

```bash
cd public && python3 -m http.server 8000
#  → http://localhost:8000/index.html?demo
```

Carga datos de muestra y muestra la interfaz completa (incluidos los botones de
bodega). **No guarda nada.** Se apaga abriendo cualquier página con `?nodemo`.

### 2. Emuladores de Firebase (datos reales, local)

Requiere Node y **Java** (para el emulador de Firestore):

```bash
npx firebase-tools emulators:start
#  → sirve el sitio en http://localhost:5000
#  → abre las páginas con ?emu para conectarlas a los emuladores
```

Crea la cuenta de bodega en la UI del emulador de Auth (http://localhost:4000).

### 3. Publicado en Firebase Hosting (lo real)

Configura el proyecto (sección de arriba) y luego, después de cada tramo:

```bash
npx firebase-tools deploy --only hosting,firestore:rules
```

## Control de versiones

Repositorio en GitHub: <https://github.com/blknoob/inventario-bodega-obra> (rama `main`).

## Exportar a Excel

En el **Tramo 6** se agrega un botón **«Exportar a Excel»** en el panel que genera
un archivo `.xlsx` (hojas de inventario y de movimientos) directamente en el
navegador, sin servidor ni costo adicional.

## Estado por tramos

- [x] **Tramo 1** — Base: estructura, config, reglas, login/logout de bodega, shell.
- [x] **Tramo 2** — Materiales: alta + registro de llegada (entrada), listado y stock en tiempo real, alertas de stock mínimo.
- [ ] **Tramo 3** — Materiales: foto de la guía con cámara (comprimida en Firestore, descargable) + salidas + historial de movimientos.
- [ ] **Tramo 4** — Herramientas: inventario (manual/eléctrica/inalámbrica) + estados.
- [ ] **Tramo 5** — Herramientas: préstamo y devolución + historial.
- [ ] **Tramo 6** — Dashboard: totales, alertas, filtros y botón **Exportar a Excel (.xlsx)** (inventario + movimientos).
- [ ] **Tramo 7** — Pulido: offline/PWA, reportes.
- [x] **Vales de entrega** — roles (custom claims), vales de materiales/EPP con entrega por bodega.
