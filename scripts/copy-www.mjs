// Kopiert die Web-App nach www/, das packt Capacitor in die iOS- und Android-App.
// Neue Dateien der App landen automatisch mit drin (alle .html, .css, .js im Hauptordner plus vendor/ und icons/).
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const SKIP = new Set(["capacitor.config.json", "package.json", "package-lock.json"]);
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of readdirSync(".")) {
  if (SKIP.has(f) || !/\.(html|css|js|webmanifest)$/.test(f)) continue;
  cpSync(f, `www/${f}`);
}
for (const dir of ["vendor", "icons"]) cpSync(dir, `www/${dir}`, { recursive: true });
console.log("www/ ist bereit");
