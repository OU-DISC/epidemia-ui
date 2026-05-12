import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { fromFile } from "geotiff";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIRS = [
  path.join(ROOT, "data", "worldpop"),
  path.resolve(ROOT, "..", "..", "data", "worldpop"),
];
const GEO_PATH = path.join(PUBLIC_DIR, "eth_admin3.geojson");
const SURFACE_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_surface.json");
const SURFACE_BY_YEAR_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_surface_by_year.json");
const METADATA_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_surface_metadata.json");
const DEFAULT_WORLDPOP_YEAR = 2025;
const DATASET_VERSION = "R2025A v1";
const BLOCK_ROWS = 512;
const INDEX_CELL_DEGREES = 0.25;

function worldPopUrlForYear(year) {
  if (year < 2015 || year > 2030) return null;
  return `https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/${year}/ETH/v1/100m/constrained/eth_pop_${year}_CN_100m_R2025A_v1.tif`;
}

function localWorldPopTifForYear(year) {
  return path.join(DATA_DIRS[0], `eth_pop_${year}_CN_100m_R2025A_v1.tif`);
}

function extractYear(filePath) {
  const match = path.basename(filePath).match(/\b((?:19|20)\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function listTifs(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTifs(entryPath);
    return /\.(?:tif|tiff)$/i.test(entry.name) ? [entryPath] : [];
  });
}

function discoverWorldPopRasters() {
  const rastersByYear = new Map();
  for (const dataDir of DATA_DIRS) {
    for (const filePath of listTifs(dataDir)) {
      const year = extractYear(filePath);
      if (year == null || rastersByYear.has(year)) continue;
      rastersByYear.set(year, filePath);
    }
  }

  return Array.from(rastersByYear.entries())
    .map(([year, filePath]) => ({ year, filePath }))
    .sort((a, b) => a.year - b.year);
}

function normalizeName(value) {
  if (value == null || value === "") return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function getDistrictNameVariants(value) {
  if (value == null || value === "") return [];
  const raw = String(value).trim();
  const out = new Set([raw]);

  for (const item of Array.from(out)) {
    out.add(item.replace(/\s*\([^)]*\)\s*/g, " ").trim());
    out.add(item.replace(/\s+town\s+administration$/i, "").trim());
    out.add(item.replace(/\s+town$/i, "").trim());
    out.add(item.replace(/\s+zuriya$/i, " Zuria").trim());
    out.add(item.replace(/\s+zuria$/i, " Zuriya").trim());
  }

  return Array.from(out).filter(Boolean);
}

function downloadFile(url, targetPath) {
  if (fs.existsSync(targetPath)) {
    console.log(`Using cached ${path.relative(ROOT, targetPath)}`);
    return Promise.resolve();
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.download`;
  fs.rmSync(tmpPath, { force: true });

  console.log(`Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), targetPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(tmpPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmpPath, targetPath);
          resolve();
        });
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function coordBBox(coords, bbox = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (!Array.isArray(coords)) return bbox;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    bbox[0] = Math.min(bbox[0], coords[0]);
    bbox[1] = Math.min(bbox[1], coords[1]);
    bbox[2] = Math.max(bbox[2], coords[0]);
    bbox[3] = Math.max(bbox[3], coords[1]);
    return bbox;
  }
  coords.forEach((child) => coordBBox(child, bbox));
  return bbox;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonRings(x, y, rings) {
  if (!rings?.length || !pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(x, y, rings[i])) return false;
  }
  return true;
}

function pointInGeometry(x, y, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygonRings(x, y, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((rings) => pointInPolygonRings(x, y, rings));
  }
  return false;
}

function indexKey(x, y) {
  return `${Math.floor(x / INDEX_CELL_DEGREES)},${Math.floor(y / INDEX_CELL_DEGREES)}`;
}

function buildFeatureIndex(features) {
  const index = new Map();
  const prepared = features
    .map((feature, id) => {
      const bbox = coordBBox(feature.geometry?.coordinates);
      return {
        id,
        feature,
        bbox,
        total: 0,
      };
    })
    .filter((entry) => entry.bbox.every(Number.isFinite));

  for (const entry of prepared) {
    const [minX, minY, maxX, maxY] = entry.bbox;
    const minCellX = Math.floor(minX / INDEX_CELL_DEGREES);
    const maxCellX = Math.floor(maxX / INDEX_CELL_DEGREES);
    const minCellY = Math.floor(minY / INDEX_CELL_DEGREES);
    const maxCellY = Math.floor(maxY / INDEX_CELL_DEGREES);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX},${cellY}`;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(entry);
      }
    }
  }

  return { index, prepared };
}

function addSurfaceValue(surface, key, value) {
  if (!key) return;
  surface[key] = value;
  surface[normalizeName(key)] = value;
}

async function aggregateRaster({ year, filePath }, index, prepared) {
  prepared.forEach((entry) => {
    entry.total = 0;
  });

  const tiff = await fromFile(filePath);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const pixelWidth = (maxX - minX) / width;
  const pixelHeight = (maxY - minY) / height;
  const nodata = Number(image.getGDALNoData());

  console.log(
    `Aggregating ${year} ${width}x${height} WorldPop raster into ${prepared.length} districts`
  );

  for (let row = 0; row < height; row += BLOCK_ROWS) {
    const rowEnd = Math.min(row + BLOCK_ROWS, height);
    const [values] = await image.readRasters({
      window: [0, row, width, rowEnd],
      samples: [0],
    });

    for (let localRow = 0; localRow < rowEnd - row; localRow += 1) {
      const y = maxY - (row + localRow + 0.5) * pixelHeight;
      for (let col = 0; col < width; col += 1) {
        const value = Number(values[localRow * width + col]);
        if (!Number.isFinite(value) || value <= 0 || value === nodata) continue;

        const x = minX + (col + 0.5) * pixelWidth;
        const candidates = index.get(indexKey(x, y));
        if (!candidates?.length) continue;

        for (const candidate of candidates) {
          const [cMinX, cMinY, cMaxX, cMaxY] = candidate.bbox;
          if (x < cMinX || x > cMaxX || y < cMinY || y > cMaxY) continue;
          if (pointInGeometry(x, y, candidate.feature.geometry)) {
            candidate.total += value;
            break;
          }
        }
      }
    }

    const percent = (((rowEnd / height) * 100)).toFixed(1);
    console.log(`Processed ${year} ${rowEnd}/${height} rows (${percent}%)`);
  }

  const surface = {};
  for (const entry of prepared) {
    const props = entry.feature.properties || {};
    const population = Math.round(entry.total);
    const names = [
      props.adm3_name,
      props.adm3_pcode,
      ...(getDistrictNameVariants(props.adm3_name)),
    ].filter(Boolean);
    names.forEach((name) => addSurfaceValue(surface, name, population));
  }

  return {
    surface,
    raster: {
      width,
      height,
      bbox: [minX, minY, maxX, maxY],
    },
  };
}

let rasters = discoverWorldPopRasters();
if (rasters.length === 0) {
  const fallbackUrl = worldPopUrlForYear(DEFAULT_WORLDPOP_YEAR);
  const fallbackTif = localWorldPopTifForYear(DEFAULT_WORLDPOP_YEAR);
  await downloadFile(fallbackUrl, fallbackTif);
  rasters = discoverWorldPopRasters();
}

if (rasters.length === 0) {
  throw new Error(`No WorldPop GeoTIFFs found in ${DATA_DIRS.join(" or ")}`);
}

const geo = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));
const { index, prepared } = buildFeatureIndex(geo.features || []);
const surfacesByYear = {};
const rasterMetadataByYear = {};

for (const raster of rasters) {
  const { surface, raster: metadata } = await aggregateRaster(raster, index, prepared);
  surfacesByYear[raster.year] = surface;
  rasterMetadataByYear[raster.year] = {
    ...metadata,
    source_file: path.relative(ROOT, raster.filePath).replace(/\\/g, "/"),
    source_url: worldPopUrlForYear(raster.year),
  };
}

const latestYear = Math.max(...rasters.map(({ year }) => year));
const latestSurface = surfacesByYear[latestYear];

fs.writeFileSync(SURFACE_BY_YEAR_OUT, `${JSON.stringify(surfacesByYear, null, 2)}\n`, "utf8");
fs.writeFileSync(SURFACE_OUT, `${JSON.stringify(latestSurface, null, 2)}\n`, "utf8");
fs.writeFileSync(
  METADATA_OUT,
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source: "WorldPop Ethiopia - Spatial Distribution of Population",
      source_url: worldPopUrlForYear(latestYear),
      source_page: "https://hub.worldpop.org/geodata/summary?id=73279",
      doi: "10.5258/SOTON/WP00839",
      dataset_version: DATASET_VERSION,
      years: rasters.map(({ year }) => year),
      default_year: latestYear,
      resolution: "3 arc seconds, approximately 100m at the equator",
      projection: "WGS84",
      units: "people per grid cell, summed to adm3 districts",
      geojson_districts: prepared.length,
      rasters: rasterMetadataByYear,
      outputs: {
        surface_by_year: path.relative(ROOT, SURFACE_BY_YEAR_OUT).replace(/\\/g, "/"),
        surface: path.relative(ROOT, SURFACE_OUT).replace(/\\/g, "/"),
      },
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Wrote ${path.relative(process.cwd(), SURFACE_BY_YEAR_OUT)}`);
console.log(`Wrote ${path.relative(process.cwd(), SURFACE_OUT)}`);
console.log(`Wrote ${path.relative(process.cwd(), METADATA_OUT)}`);
