// ─────────────────────────────────────────────────────────────────────────────
// Compresión de fotos antes de subirlas a Storage
// ─────────────────────────────────────────────────────────────────────────────
// Una foto de la cámara del celular pesa varios MB (4000+ px de lado); con
// señal móvil, subir dos o tres así puede tardar más de un minuto. Para leer
// una guía o factura basta con ~1600 px de lado en JPEG: queda en unos
// cientos de KB y se sube en segundos.
// ─────────────────────────────────────────────────────────────────────────────

const LADO_MAX = 1600;
const CALIDAD = 0.8;

/**
 * Devuelve una versión comprimida (JPEG, máx. 1600 px de lado) de la foto.
 * Si no es una imagen que se pueda dibujar (PDF, HEIC en un navegador que no
 * lo lee, etc.), o si comprimida no queda más liviana, devuelve el archivo
 * original tal cual -- nunca impide subir algo.
 */
export async function comprimirImagen(archivo) {
  if (!archivo?.type?.startsWith("image/") || archivo.type === "image/gif" || archivo.type === "image/svg+xml") {
    return archivo;
  }
  try {
    // imageOrientation "from-image": respeta la rotación EXIF (si no, las
    // fotos verticales del celular pueden quedar acostadas).
    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // fondo blanco por si era un PNG con transparencia
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: archivo.lastModified });
  } catch {
    return archivo;
  }
}
