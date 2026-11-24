# Startseiten-Weiterleitung (Browser-Erweiterung)

Leitet automatisch auf eine festgelegte Startseite weiter, **wenn Domain und angemeldeter Benutzer passen**,
z. B.: Anmeldung als `MaxMustermann` auf `firma.ariadne.cloud` → Weiterleitung auf
`/Main/MeineStartseite`.

Eine Codebasis (WebExtension, Manifest V3) für **Chrome, Edge, Brave, Opera, Vivaldi und Firefox (ab 128)**.
Safari: siehe unten.

## Schnell ein-/ausschalten

* **Klick auf das Symbol** in der Symbolleiste → großer Schalter
* **Tastenkürzel `Alt+Shift+S`** (änderbar: Chrome `chrome://extensions/shortcuts`, Firefox Add-ons → Zahnrad → Tastenkombinationen)
* Ausgeschaltet zeigt das Symbol ein rotes **AUS**-Badge.
* Jede Regel lässt sich außerdem einzeln aktivieren/deaktivieren.

## Download

Fertige Pakete gibt es unter [Releases](https://github.com/soehner/startseiten-weiterleitung/releases/latest):

* `startseiten-weiterleitung-<version>-chromium.zip` – Chrome, Edge, Brave, Opera, Vivaldi (entpacken, dann *Entpackte Erweiterung laden*)
* `startseiten-weiterleitung-<version>-firefox.zip` – Firefox (zum Signieren bei addons.mozilla.org)

Alternativ das Repository klonen und `./build.sh` ausführen.

Eine bebilderte Schritt-für-Schritt-Anleitung steht in [docs/Installationsanleitung.pdf](docs/Installationsanleitung.pdf).

## Installation

`./build.sh` erzeugt `dist/chromium/` und `dist/firefox/` (entpackt) sowie je ein ZIP.
Das `manifest.json` im Hauptordner ist die Chromium-Variante. Firefox braucht die Variante aus `dist/firefox/`.

| Browser | Vorgehen |
|---|---|
| Chrome / Brave / Vivaldi | `chrome://extensions` → *Entwicklermodus* an → *Entpackte Erweiterung laden* → diesen Ordner wählen |
| Edge | `edge://extensions` → *Entwicklermodus* → *Entpackt laden* |
| Opera | `opera://extensions` → *Entwicklermodus* → *Entpackte Erweiterung laden* |
| Firefox (Test) | `about:debugging#/runtime/this-firefox` → *Temporäres Add-on laden* → `dist/firefox/manifest.json` (bleibt nur bis zum Neustart) |
| Firefox (dauerhaft) | `dist/*-firefox.zip` bei [addons.mozilla.org](https://addons.mozilla.org/developers/) als **„Nicht gelistet“** hochladen → signierte `.xpi` installieren |
| Safari (macOS) | `xcrun safari-web-extension-converter .` → in Xcode bauen (Apple-Entwicklerkonto nötig) |

Für die Verteilung im Unternehmen lässt sich die Erweiterung per Gruppenrichtlinie ausrollen
(Chrome/Edge: `ExtensionInstallForcelist`, Firefox: `policies.json` → `ExtensionSettings`).

## Einrichtung

1. Nach der Installation öffnen sich die Einstellungen (sonst: Symbol → *Einstellungen*).
   Eine Beispielregel ist bereits angelegt, aber noch deaktiviert.
2. Pro Regel angeben:
   * **Domain**: `firma.ariadne.cloud` (oder `*.ariadne.cloud` für alle Subdomains)
   * **Benutzer**: In der neuen Q.wiki (ariadne.cloud) ist der WikiName eine ID wie `Q0123456789abcdef0123456789abcdef`.
     Alternativ funktioniert die Login-E-Mail. Den genauen Wert zeigt das Popup unter „Benutzer“. Mehrere mit Komma trennen, `*` steht für jeden angemeldeten Benutzer.
     Es zählen WikiName (`MaxMustermann`), Login-Name und `Main.MaxMustermann`; Groß- und Kleinschreibung spielt keine Rolle.
   * **Ziel-Seite**: absolut (`https://…`) oder relativ (`/Main/MeineStartseite`)
   * **Wann weiterleiten**
     * *Einmal nach dem Login* (Standard): Die erste Seite nach der Anmeldung wird umgeleitet, danach kann man frei navigieren.
       Nach dem Abmelden (die Seite meldet dann den Gast `WikiGuest`) oder nach einem Browser-Neustart greift die Regel wieder.
     * *Jedes Mal bei Aufruf der Startseite*: Immer wenn `/`, `/Main/WebHome` o. Ä. aufgerufen wird. Das gilt auch dann, wenn Q.wiki
       dabei auf `/content/<id>?redirectedfrom=Main.WebHome` umleitet (z. B. beim Klick auf das Logo).
3. **Speichern** → der Browser fragt einmalig nach der Erlaubnis für die Domain. Bitte bestätigen.

Tipp: Auf der Q.wiki-Seite das Symbol anklicken. Das Popup zeigt dann den **erkannten Benutzer** und die passende Regel.
Mit *Regel für diese Seite anlegen* wird eine neue Regel mit Domain und Benutzer vorbelegt.
*Merker zurücksetzen* sorgt dafür, dass beim nächsten Seitenaufruf wieder weitergeleitet wird (praktisch zum Testen).

Über *Exportieren/Importieren* lassen sich Regeln als JSON an Kollegen weitergeben.

## Wie der Benutzer erkannt wird

Q.wiki basiert auf Foswiki. Jede Seite enthält dort einen Block
`<script class="foswikiPreferences" type="text/json">{"WIKINAME":"MaxMustermann","USERNAME":"…",…}</script>`.
Die Erweiterung liest diesen Block aus und greift notfalls auf die Meta-Tags `foswiki.WIKINAME` zurück.
Für andere Systeme gibt es unter *Erweitert* einen eigenen **CSS-Selektor** oder **regulären Ausdruck**.

Datenschutz: Die Erweiterung läuft nur auf den freigegebenen Domains, liest nur den Benutzernamen und sendet keine Daten nach außen.
Die Regeln liegen in `storage.sync` und werden mit dem Browserprofil synchronisiert. Die Login-Merker liegen in `storage.session` und
werden beim Schließen des Browsers gelöscht.

## Dateien

```
manifest.json        Manifest V3 (Chrome: service_worker, Firefox: scripts)
src/common.js        gemeinsame Logik + Benutzererkennung
src/background.js    prüft geladene Seiten, leitet weiter, Tastenkürzel, Badge
src/popup.*          Schnellschalter + Diagnose
src/options.*        Regel-Verwaltung
icons/               Symbole
build.sh             erzeugt dist/*.zip
docs/                Installationsanleitung (PDF + HTML-Quelle)
```

## Lizenz

[MIT](LICENSE) – Nutzung, Änderung und Weitergabe ausdrücklich erwünscht. Fehler und Ideen gern als Issue melden.
