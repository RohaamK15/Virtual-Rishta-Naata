import puppeteer from "file:///C:/Users/rohaa/AppData/Local/Temp/puppeteer-test/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_PATH =
  "C:/Users/rohaa/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe";

const url = process.argv[2];
const label = process.argv[3];

if (!url) {
  console.error("Usage: node screenshot.mjs <url> [label]");
  process.exit(1);
}

const outDir = path.join(__dirname, "temporary screenshots");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const existing = fs
  .readdirSync(outDir)
  .map((f) => f.match(/^screenshot-(\d+)/))
  .filter(Boolean)
  .map((m) => parseInt(m[1], 10));
const nextNum = existing.length ? Math.max(...existing) + 1 : 1;

const fileName = label
  ? `screenshot-${nextNum}-${label}.png`
  : `screenshot-${nextNum}.png`;
const outPath = path.join(outDir, fileName);

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
});

try {
  const page = await browser.newPage();
  const isMobile = process.argv.includes("--mobile");
  await page.setViewport(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  );
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`Saved: ${outPath}`);
} finally {
  await browser.close();
}
