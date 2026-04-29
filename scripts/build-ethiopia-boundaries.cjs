/**
 * Simplifies Ethiopia admin3 boundaries, keeps only map fields, and writes TopoJSON.
 *
 * Input:  public/eth_admin3.geojson  (or ETH_ADMIN3_GEO env path)
 * Output: public/eth_admin3.topojson
 *
 * Usage:  npm run build:boundaries
 * Env:    SIMPLIFY_PCT=2%   (mapshaper Visvalingam / weighted; tune for the map zoom)
 *
 * For very large source files, mapshaper-xl requests extra Node heap (6 GB).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const defaultInput = path.join(root, "public", "eth_admin3.geojson");
const output = path.join(root, "public", "eth_admin3.topojson");
const input = process.env.ETH_ADMIN3_GEO
  ? path.resolve(process.env.ETH_ADMIN3_GEO)
  : defaultInput;
const simplify = process.env.SIMPLIFY_PCT || "2%";

if (!fs.existsSync(input)) {
  console.error("Input boundary file not found:", input);
  process.exit(1);
}

const mapshaperXl = path.join(root, "node_modules", "mapshaper", "bin", "mapshaper-xl");
if (!fs.existsSync(mapshaperXl)) {
  console.error("mapshaper is not installed. Run: npm install");
  process.exit(1);
}

console.log("Input:", input);
console.log("Output:", output);
console.log("Simplify:", simplify, "(change with SIMPLIFY_PCT=1% etc.)");
console.log("This may take a few minutes for a large GeoJSON...");

const args = [
  "6", // 6 GB heap
  input,
  "-simplify",
  simplify,
  "-filter-fields",
  "adm1_name,adm3_name",
  "-o",
  output,
  "format=topojson",
];

execFileSync(process.execPath, [mapshaperXl, ...args], { stdio: "inherit" });

if (!fs.existsSync(output)) {
  console.error("Expected output was not created:", output);
  process.exit(1);
}
const { size } = fs.statSync(output);
console.log("Wrote", output, "(" + (size / (1024 * 1024)).toFixed(2) + " MB)");
