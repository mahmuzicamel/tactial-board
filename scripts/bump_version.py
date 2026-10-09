#!/usr/bin/env python3
"""
Single-source Cache-Busting / Build-Step für Tactical Coach.

Ersetzt das fehleranfällige manuelle Hochzählen von ?v=NNN in 3 Dateien.

Was es tut:
  1. Ermittelt EINE Versionskennung (kurzer Git-Commit-Hash, Fallback: Zeitstempel).
  2. Scannt static/js/** + bekannte Vendor-/Asset-Pfade vom DATEISYSTEM
     und generiert daraus die ASSETS_TO_CACHE-Liste in sw.js neu
     -> keine driftende, von Hand gepflegte Liste mehr (behob lines/shapes-Bug,
        der cache.addAll atomar scheitern ließ).
  3. Setzt CACHE_NAME + alle ?v=<ver> an den Entry-Points (index.html, app-module.js)
     konsistent auf dieselbe Version.

Aufruf:  python3 scripts/bump_version.py            # nutzt Git-Hash
         python3 scripts/bump_version.py --check   # prüft nur Konsistenz (CI), schreibt nicht
"""
import os
import re
import sys
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "static")
SW = os.path.join(STATIC, "sw.js")
INDEX = os.path.join(STATIC, "index.html")
APP_MODULE = os.path.join(STATIC, "js", "app-module.js")

# Zusätzliche (nicht automatisch gescannte) Assets, die vorab gecacht werden sollen.
# Nur Pfade aufnehmen, die real existieren – fehlende werden mit Warnung übersprungen,
# damit cache.addAll NIE atomar an einer toten URL scheitert.
EXTRA_ASSETS = [
    "/",
    "/static/index.html",
    "/static/manifest.json",
    "/static/vendor/three.min.js",
    "/static/vendor/OrbitControls.js",
    "/static/vendor/GLTFLoader.js",
    "/static/vendor/SkeletonUtils.js",
    "/static/vendor/CCapture.all.min.js",
    "/static/models/footballer.glb",
    "/static/animations/idle.glb",
    "/static/animations/walk.glb",
    "/static/animations/run.glb",
    "/static/animations/sprint.glb",
    "/static/animations/kick.glb",
    "/static/animations/shoot.glb",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png",
    "/static/icons/apple-touch-icon.png",
]

# Diese beiden Entry-Points tragen ?v=<ver> (erzwingen HTTP-Revalidierung).
VERSIONED_ENTRYPOINTS = [
    "/static/app.js",
    "/static/js/app-module.js",
]


def get_version():
    """Monoton steigende Version pro Deploy (Zeitstempel).

    Bewusst KEIN Git-Commit-Hash: Ein Hash von HEAD kann nie mit dem im
    Working-Tree gespeicherten Wert übereinstimmen, weil das Committen den
    Hash erneut ändert (Henne-Ei). Ein Zeitstempel ändert sich garantiert
    pro Lauf und ist als reiner Cache-Buster völlig ausreichend.
    """
    return "b" + datetime.datetime.now().strftime("%Y%m%d%H%M")


def url_exists(url):
    # /static/... -> Datei unter STATIC. "/" und "/static/index.html" gesondert.
    if url == "/":
        return os.path.isfile(INDEX)
    if url.startswith("/static/"):
        return os.path.isfile(os.path.join(STATIC, url[len("/static/"):]))
    return False


def scan_js_modules():
    """Alle ESM-Module unter static/js als /static/js/...-URLs, sortiert."""
    mods = []
    base = os.path.join(STATIC, "js")
    for dirpath, _, files in os.walk(base):
        for fn in files:
            if fn.endswith(".js"):
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, STATIC).replace(os.sep, "/")
                mods.append("/static/" + rel)
    return sorted(mods)


def build_asset_list(version):
    assets = []
    seen = set()

    def add(url):
        if url in seen:
            return
        seen.add(url)
        assets.append(url)

    # Entry-Points mit Version
    for ep in VERSIONED_ENTRYPOINTS:
        if url_exists(ep):
            add(f"{ep}?v={version}")
        else:
            print(f"  WARN: Entry-Point fehlt, übersprungen: {ep}", file=sys.stderr)

    # Alle JS-Module (ohne die bereits versionierten Entry-Points)
    ep_paths = set(VERSIONED_ENTRYPOINTS)
    for m in scan_js_modules():
        if m in ep_paths:
            continue
        add(m)

    # Extra-Assets – nur wenn vorhanden
    for a in EXTRA_ASSETS:
        if url_exists(a):
            add(a)
        else:
            print(f"  WARN: Asset fehlt, NICHT in Cache-Liste: {a}", file=sys.stderr)

    return assets


def render_sw(version, assets):
    lines = ["const CACHE_NAME = 'tactical-coach-{}';".format(version)]
    lines.append("const ASSETS_TO_CACHE = [")
    for a in assets:
        lines.append(f"  '{a}',")
    lines.append("];")
    header = "\n".join(lines)

    # Rest der sw.js (install/activate/fetch) unverändert aus bestehender Datei übernehmen.
    with open(SW, "r") as f:
        existing = f.read()
    m = re.search(r"\n(self\.addEventListener\('install')", existing)
    if not m:
        raise SystemExit("FEHLER: sw.js hat keinen erwarteten install-Handler – Abbruch.")
    body = existing[m.start():]
    return header + "\n" + body


def set_entrypoint_versions(text, version):
    # /static/app.js?v=NNN  und  app.js?v=NNN  und  app-module.js?v=NNN  und  view3d.js?v=NNN
    text = re.sub(r'(app\.js\?v=)[\w.]+', r'\g<1>' + version, text)
    text = re.sub(r'(app-module\.js\?v=)[\w.]+', r'\g<1>' + version, text)
    text = re.sub(r'(view3d\.js\?v=)[\w.]+', r'\g<1>' + version, text)
    return text


def collect_versions():
    """Alle im Code gesetzten Versionskennungen einsammeln (für Konsistenzprüfung)."""
    found = {}
    with open(SW) as f:
        m = re.search(r"tactical-coach-([\w.]+)", f.read())
        found["sw.js CACHE_NAME"] = m.group(1) if m else None
    with open(INDEX) as f:
        for m in re.finditer(r'(app\.js|app-module\.js)\?v=([\w.]+)', f.read()):
            found[f"index.html {m.group(1)}"] = m.group(2)
    with open(APP_MODULE) as f:
        m = re.search(r'view3d\.js\?v=([\w.]+)', f.read())
        found["app-module.js view3d.js"] = m.group(1) if m else None
    return found


def main():
    check_only = "--check" in sys.argv

    if check_only:
        found = collect_versions()
        vals = set(found.values())
        ok = len(vals) == 1 and None not in vals
        for k, v in found.items():
            print(f"  {k}: {v}")
        print("SYNC" if ok else "DRIFT")
        sys.exit(0 if ok else 1)

    version = get_version()
    assets = build_asset_list(version)

    # sw.js neu rendern (Body VOR dem Truncate lesen!)
    new_sw = render_sw(version, assets)
    with open(SW, "w") as f:
        f.write(new_sw)

    # index.html + app-module.js Versionen setzen
    for path in (INDEX, APP_MODULE):
        with open(path) as f:
            t = f.read()
        t2 = set_entrypoint_versions(t, version)
        if t2 != t:
            with open(path, "w") as f:
                f.write(t2)

    print(f"✅ Version gesetzt auf '{version}'")
    print(f"   sw.js: {len(assets)} Assets in Cache-Liste")
    print(f"   Entry-Points in index.html + app-module.js aktualisiert")


if __name__ == "__main__":
    main()
