#!/usr/bin/env bash
# Erzeugt installierbare Pakete:
#   dist/chromium/  + dist/startseiten-weiterleitung-<v>-chromium.zip  (Chrome, Edge, Brave, Opera, Vivaldi)
#   dist/firefox/   + dist/startseiten-weiterleitung-<v>-firefox.zip   (Firefox ab 128)
# Das manifest.json im Hauptordner ist die Chromium-Variante (direkt als "entpackt" ladbar).
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
# Nur die eigenen Build-Ergebnisse entfernen, andere Dateien in dist/ bleiben erhalten.
rm -rf dist/chromium dist/firefox dist/startseiten-weiterleitung-*-chromium.zip dist/startseiten-weiterleitung-*-firefox.zip
mkdir -p dist/chromium dist/firefox
for d in dist/chromium dist/firefox; do cp -r src icons "$d"/; done
cp manifest.json dist/chromium/manifest.json
python3 - <<'PY'
import json
m = json.load(open('manifest.json'))
m['background'] = {"scripts": ["src/common.js", "src/background.js"]}
m['browser_specific_settings'] = {"gecko": {
    "id": "startseiten-weiterleitung@bisscon.de",
    "strict_min_version": "128.0",
    "data_collection_permissions": {"required": ["none"]}}}
json.dump(m, open('dist/firefox/manifest.json', 'w'), indent=2, ensure_ascii=False)
PY
(cd dist/chromium && zip -r -q "../startseiten-weiterleitung-${VERSION}-chromium.zip" .)
(cd dist/firefox  && zip -r -q "../startseiten-weiterleitung-${VERSION}-firefox.zip" .)
ls -1 dist/*.zip
