# Build / Deploy

## Cache-Busting (`bump_version.py`)

**Eine** Versionsquelle (kurzer Git-Commit-Hash) hält Service-Worker-Cache
und alle `?v=`-Query-Strings synchron. Ersetzt das frühere manuelle
Hochzählen von `v=NNN` in 3 Dateien (das regelmäßig driftete).

Das Script generiert die `ASSETS_TO_CACHE`-Liste in `sw.js` **automatisch
aus dem Dateisystem** — fehlende Dateien landen nicht mehr in der Liste
(`cache.addAll` ist atomar und scheiterte vorher still an toten URLs wie
`lines.js`/`shapes.js`).

### Deploy-Workflow

```bash
# 1. Code committen
git add -A && git commit -m "…"

# 2. Version auf den neuen Commit-Hash setzen
python3 scripts/bump_version.py

# 3. Versions-Bump in denselben Commit falten
git commit -a --amend --no-edit

# 4. Service neu starten
sudo systemctl restart tactics.service
```

### CI / Konsistenzprüfung

```bash
python3 scripts/bump_version.py --check   # exit 0 = sync, 1 = drift
```

Prüft, ob `CACHE_NAME` in `sw.js` zum aktuellen `HEAD` passt.
