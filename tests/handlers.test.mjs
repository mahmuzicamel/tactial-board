// tests/handlers.test.mjs
// Verifiziert, dass alle classic-script Handler-Module im GETEILTEN globalen
// Scope kollisionsfrei laden (wie im Browser mehrere <script> den Top-Level-
// Lexical-Scope teilen). Faengt doppelte `const TC/S`-Deklarationen etc. ab —
// genau der Bug, den `node --check` (Datei-einzeln) NICHT sieht.
import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handlersDir = path.join(__dirname, "..", "static", "js", "handlers");

test("alle Handler-Module laden kollisionsfrei im geteilten Scope", () => {
  const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith(".js")).sort();
  assert.ok(files.length >= 7, `erwartet >=7 Handler-Module, gefunden ${files.length}`);

  const ctx = { window: { TacticalCoach: { state: {} } }, console, document: {}, setTimeout };
  vm.createContext(ctx);

  for (const f of files) {
    const code = fs.readFileSync(path.join(handlersDir, f), "utf8");
    assert.doesNotThrow(
      () => vm.runInContext(code, ctx, { filename: f }),
      `Modul ${f} wirft beim Laden im geteilten Scope`
    );
  }

  const fnCount = Object.keys(ctx.window).filter((k) => typeof ctx.window[k] === "function").length;
  assert.ok(fnCount >= 60, `erwartet >=60 window-Handler, gesetzt ${fnCount}`);
});

test("kein Handler nutzt bare view3dManager (muss window.view3dManager sein)", () => {
  // view3dManager ist geteilter mutabler State zwischen app.js (IIFE) und den
  // Handler-IIFEs. Bare-Zugriff erzeugt getrennte Modul-Globals -> 3D bricht.
  const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith(".js"));
  for (const f of files) {
    const code = fs.readFileSync(path.join(handlersDir, f), "utf8");
    const bare = code.match(/(?<![.\w])view3dManager(?![\w])/g) || [];
    assert.strictEqual(bare.length, 0, `${f}: bare view3dManager gefunden (muss window.view3dManager sein)`);
  }
});
