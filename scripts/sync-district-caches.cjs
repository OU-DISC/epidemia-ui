/**
 * Copy per-district forecast JSON caches into public/ for fast chart history loads.
 * Sources (first match wins): ../../public/district_forecasts, ../../backend/report/district_forecasts
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "public", "district_forecasts");
const sources = [
  path.join(root, "..", "..", "public", "district_forecasts"),
  path.join(root, "..", "..", "backend", "report", "district_forecasts"),
  path.join(root, "backend", "report", "district_forecasts"),
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      fs.copyFileSync(from, to);
    }
  }
}

const src = sources.find((candidate) => fs.existsSync(candidate));
if (!src) {
  console.error(
    "No district_forecasts source found. Run the EPIDEMIA pipeline or copy caches first."
  );
  process.exit(1);
}

copyDir(src, dest);
const count = fs
  .readdirSync(dest, { recursive: true })
  .filter((name) => String(name).endsWith(".json")).length;
console.log(`Synced ${count} district cache files from ${src}`);
