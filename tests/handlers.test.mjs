// tests/handlers.test.mjs
// Zwei Fehlerklassen, die `node --check` (Datei-einzeln) NICHT sieht:
//  1. Classic-Script-Handler teilen im Browser den globalen Top-Level-Scope ->
//     doppelte `const TC/S` = SyntaxError. Hier im vm-geteilten Kontext geprueft.
//  2. ESM-Handler (export) werden isoliert importiert -> hier echter import().
// Die Unterscheidung erfolgt anhand von `export ` im Quelltext (= ESM).
import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handlersDir = path.join(__dirname, "..", "static", "js", "handlers");

function classify() {
  const files = fs.readdirSync(handlersDir).filter((f) => f.endsWith(".js")).sort();
  const classic = [];
  const esm = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(handlersDir, f), "utf8");
    (/^\s*export\s/m.test(code) ? esm : classic).push(f);
  }
  return { files, classic, esm };
}

test("classic-script Handler laden kollisionsfrei im geteilten Scope", () => {
  const { classic } = classify();
  const ctx = { window: { TacticalCoach: { state: {} } }, console, document: {}, setTimeout, requestAnimationFrame: () => {} };
  vm.createContext(ctx);
  for (const f of classic) {
    const code = fs.readFileSync(path.join(handlersDir, f), "utf8");
    assert.doesNotThrow(
      () => vm.runInContext(code, ctx, { filename: f }),
      `Modul ${f} wirft beim Laden im geteilten Scope`
    );
  }
});

test("ESM Handler sind importierbar und exportieren Funktionen", async () => {
  const { esm } = classify();
  for (const f of esm) {
    const mod = await import(pathToFileURL(path.join(handlersDir, f)).href);
    const fns = Object.values(mod).filter((v) => typeof v === "function");
    assert.ok(fns.length > 0, `ESM-Modul ${f} exportiert keine Funktionen`);
  }
});

test("kein Handler nutzt bare view3dManager (muss window.view3dManager sein)", () => {
  const { files } = classify();
  for (const f of files) {
    const code = fs.readFileSync(path.join(handlersDir, f), "utf8");
    const bare = code.match(/(?<![.\w])view3dManager(?![\w])/g) || [];
    assert.strictEqual(bare.length, 0, `${f}: bare view3dManager gefunden (muss window.view3dManager sein)`);
  }
});

test("jeder onclick-Handler in index.html hat ein window.*-Binding", () => {
  // Invariante: Zerlegung darf keinen onclick-Handler verwaisen lassen.
  const html = fs.readFileSync(path.join(__dirname, "..", "static", "index.html"), "utf8");
  const calls = new Set();
  for (const m of html.matchAll(/on(?:click|input|change|submit|keyup|keydown)="([^"]+)"/g)) {
    for (const fn of m[1].matchAll(/([A-Za-z_]\w*)\s*\(/g)) calls.add(fn[1]);
  }
  // Alle window.X Bindings aus app.js, app-module.js, handlers/*.js sammeln
  const sources = [
    path.join(__dirname, "..", "static", "app.js"),
    path.join(__dirname, "..", "static", "js", "app-module.js"),
    ...fs.readdirSync(handlersDir).filter((f) => f.endsWith(".js")).map((f) => path.join(handlersDir, f)),
  ];
  const win = new Set();
  for (const s of sources) {
    const code = fs.readFileSync(s, "utf8");
    for (const m of code.matchAll(/window\.([A-Za-z_]\w*)\s*=/g)) win.add(m[1]);
  }
  // String.prototype-Methoden etc. ausnehmen (keine echten Handler)
  const builtins = new Set(["replace", "toFixed", "map", "filter"]);
  const missing = [...calls].filter((c) => !win.has(c) && !builtins.has(c));
  assert.deepStrictEqual(missing, [], `onclick-Handler ohne window.*-Binding: ${missing.join(", ")}`);
});
