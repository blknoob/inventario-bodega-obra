#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Atajo para correr usuarios.mjs sin escribir la ruta de la clave cada vez.
#
#   ./scripts/usuarios.sh --clave 12345678
#   ./scripts/usuarios.sh --reiniciar-clave correo@dpc.cl --clave 12345678
#
# Busca la clave de administrador en ~/claves/clave-admin.json (fuera del repo).
# Para usar otra ruta: CLAVE_ADMIN=/otra/ruta.json ./scripts/usuarios.sh ...
# ─────────────────────────────────────────────────────────────────────────────
set -e

CLAVE="${CLAVE_ADMIN:-$HOME/claves/clave-admin.json}"
CARPETA="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$CLAVE" ]; then
  echo "No encuentro la clave de administrador en: $CLAVE"
  echo
  echo "1. Descárgala en:"
  echo "   https://console.firebase.google.com/project/inventario-bodega-obra/settings/serviceaccounts/adminsdk"
  echo "   (Generar nueva clave privada)"
  echo "2. Muévela ahí:"
  echo "   mkdir -p ~/claves && mv ~/Downloads/inventario-bodega-obra-*.json ~/claves/clave-admin.json"
  exit 1
fi

cd "$CARPETA"
[ -d node_modules ] || npm install
GOOGLE_APPLICATION_CREDENTIALS="$CLAVE" node usuarios.mjs "$@"
