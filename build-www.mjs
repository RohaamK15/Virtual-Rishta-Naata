// Copies the static site into www/ — the clean bundle Capacitor packages into the native app.
// Run this before `npx cap sync` any time page/asset files change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "www");

const pages = [
  "index.html", "home.html", "services.html", "pricing.html",
  "signup.html", "login.html", "reset-password.html", "search.html", "account.html", "admin.html",
  "messages.html", "chat.html",
  "terms.html", "privacy.html", "guidelines.html"
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const page of pages) {
  fs.copyFileSync(path.join(__dirname, page), path.join(outDir, page));
}
copyDir(path.join(__dirname, "assets"), path.join(outDir, "assets"));

console.log(`Bundled ${pages.length} pages + assets into ${outDir}`);
