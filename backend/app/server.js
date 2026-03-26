// server.js (Node.js + Express)

const express = require('express');
const bodyParser = require('body-parser');
const ee = require('@google/earthengine');
const fs = require('fs');
const cors = require('cors'); // <-- import cors

const app = express();

function getDatasetConfig(dataset) {
  const key = String(dataset || "").toLowerCase();
  const config = {
    ndvi: { scale: 1000, postProcess: null },
    savi: { scale: 1000, postProcess: null },
    evi: { scale: 1000, postProcess: null },
    ndwi5: { scale: 1000, postProcess: null },
    ndwi6: { scale: 1000, postProcess: null },
    totprec: {
      scale: 1000,
      postProcess: null,
    },
    lst_day: {
      scale: 1000,
      postProcess: null,
    },
    lst_night: {
      scale: 1000,
      postProcess: null,
    },
    lst_mean: {
      scale: 1000,
      postProcess: null,
    },

    // Backward-compatible aliases used by older frontend values.
    precipitation: {
      scale: 1000,
      postProcess: null,
    },
    rainfall: {
      scale: 1000,
      postProcess: null,
    },
    lst: {
      scale: 1000,
      postProcess: null,
    },
    net: {
      scale: 1000,
      postProcess: null,
    },
  };

  return config[key] || null;
}

function buildDatasetCollection(dataset, startDate, endDate) {
  const key = String(dataset || "").toLowerCase();

  // If requested range has no images (data lag or future dates),
  // fall back to a recent window ending at the latest available image.
  const withFallback = (baseCollection, fallbackDays = 30) => {
    const requested = baseCollection.filterDate(startDate, endDate);
    const latestImg = ee.Image(baseCollection.sort("system:time_start", false).first());
    const latestDate = latestImg.date();
    const fallback = baseCollection.filterDate(
      latestDate.advance(-fallbackDays, "day"),
      latestDate.advance(1, "day")
    );
    return ee.ImageCollection(ee.Algorithms.If(requested.size().gt(0), requested, fallback));
  };

  if (key === "totprec" || key === "precipitation" || key === "rainfall") {
    return withFallback(ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY"), 60)
      .select("precipitation")
      .map((img) => img.rename("totprec").copyProperties(img, ["system:time_start"]));
  }

  // Previous MODIS implementation kept for reference.
  // if (key === "lst_day" || key === "lst") {
  //   return withFallback(ee.ImageCollection("MODIS/006/MOD11A2"), 64)
  //     .select("LST_Day_1km")
  //     .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_day").copyProperties(img, ["system:time_start"]));
  // }

  // if (key === "lst_night") {
  //   return withFallback(ee.ImageCollection("MODIS/006/MOD11A2"), 64)
  //     .select("LST_Night_1km")
  //     .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_night").copyProperties(img, ["system:time_start"]));
  // }

  // if (key === "lst_mean") {
  //   return withFallback(ee.ImageCollection("MODIS/006/MOD11A2"), 64)
  //     .map((img) => {
  //       const day = img.select("LST_Day_1km").multiply(0.02).subtract(273.15);
  //       const night = img.select("LST_Night_1km").multiply(0.02).subtract(273.15);
  //       return day.add(night).divide(2).rename("lst_mean").copyProperties(img, ["system:time_start"]);
  //     });
  // }

  // VIIRS LST (VNP21A1 Day/Night, 1 km). In Earth Engine this band is exposed
  // in Kelvin-like values, so convert directly to Celsius.
  if (key === "lst_day" || key === "lst") {
    return withFallback(ee.ImageCollection("NASA/VIIRS/002/VNP21A1D"), 32)
      .select("LST_1KM")
      .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_day").copyProperties(img, ["system:time_start"]));
  }

  if (key === "lst_night") {
    return withFallback(ee.ImageCollection("NASA/VIIRS/002/VNP21A1N"), 32)
      .select("LST_1KM")
      .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_night").copyProperties(img, ["system:time_start"]));
  }

  if (key === "lst_mean") {
    const dayCollection = withFallback(ee.ImageCollection("NASA/VIIRS/002/VNP21A1D"), 32)
      .select("LST_1KM")
      .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_day").copyProperties(img, ["system:time_start"]));

    const nightCollection = withFallback(ee.ImageCollection("NASA/VIIRS/002/VNP21A1N"), 32)
      .select("LST_1KM")
      .map((img) => img.multiply(0.02).subtract(273.15).rename("lst_night").copyProperties(img, ["system:time_start"]));

    const byDate = ee.Filter.equals({
      leftField: "system:time_start",
      rightField: "system:time_start",
    });

    const joined = ee.Join.inner().apply(dayCollection, nightCollection, byDate);

    return ee.ImageCollection(joined.map((feature) => {
      const dayImg = ee.Image(ee.Feature(feature).get("primary"));
      const nightImg = ee.Image(ee.Feature(feature).get("secondary"));
      return dayImg
        .add(nightImg)
        .divide(2)
        .rename("lst_mean")
        .copyProperties(dayImg, ["system:time_start"]);
    }));
  }

  if (key === "net") {
    return withFallback(ee.ImageCollection("ECMWF/ERA5/DAILY"), 45)
      .select("mean_2m_air_temperature")
      .map((img) => img.multiply(0.02).subtract(273.15).rename("net").copyProperties(img, ["system:time_start"]));
  }

  if (key === "ndvi" || key === "savi" || key === "evi" || key === "ndwi5" || key === "ndwi6") {
    return withFallback(ee.ImageCollection("MODIS/006/MCD43A4"), 64)
      .map((img) => {
        const red = img.select("Nadir_Reflectance_Band1").multiply(0.0001);
        const nir = img.select("Nadir_Reflectance_Band2").multiply(0.0001);
        const blue = img.select("Nadir_Reflectance_Band3").multiply(0.0001);
        const swir1 = img.select("Nadir_Reflectance_Band6").multiply(0.0001);
        const swir2 = img.select("Nadir_Reflectance_Band7").multiply(0.0001);

        let out;
        if (key === "ndvi") {
          out = nir.subtract(red).divide(nir.add(red)).rename("ndvi");
        } else if (key === "savi") {
          out = nir.subtract(red).multiply(1.5).divide(nir.add(red).add(0.5)).rename("savi");
        } else if (key === "evi") {
          out = nir.subtract(red)
            .multiply(2.5)
            .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1))
            .rename("evi");
        } else if (key === "ndwi5") {
          out = nir.subtract(swir1).divide(nir.add(swir1)).rename("ndwi5");
        } else {
          out = nir.subtract(swir2).divide(nir.add(swir2)).rename("ndwi6");
        }

        return out.copyProperties(img, ["system:time_start"]);
      });
  }

  return null;
}

// Enable CORS for all origins (or restrict to localhost:3000)
const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://epidemia-ui.disc.ourcloud.ou.edu",
].join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow browserless and same-origin requests, and explicit allowed origins.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Increase JSON body limit to handle large payloads
app.use(bodyParser.json({ limit: '50mb' })); // <-- default is 100kb
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Initialize GEE with service account
let geeInitialized = false;
try {
  const privateKey = require('./service-account-key.json');
  ee.data.authenticateViaPrivateKey(privateKey, 
    function onAuth() {
      console.log('GEE Authentication successful');
      ee.initialize(null, null, 
        function onInit() {
          console.log('GEE Initialized!');
          geeInitialized = true;
        }, 
        function onInitError(err) {
          console.error('GEE init error:', err);
        }
      );
    },
    function onAuthError(err) {
      console.error('GEE Auth error:', err);
    }
  );
} catch (authErr) {
  console.error('GEE setup error:', authErr);
}

// Route to get environmental data
// helper to process a single district and return a Promise resolving its value
function fetchDistrictValue(district, startDate, endDate, dataset) {
  return new Promise((resolve) => {
    try {
      let coords = district.geometry;
      // close ring if needed
      if (coords.length > 0 && coords[0].length > 0) {
        const ring = coords[0];
        const firstPoint = ring[0];
        const lastPoint = ring[ring.length - 1];
        if (JSON.stringify(firstPoint) !== JSON.stringify(lastPoint)) {
          coords[0] = [...ring, firstPoint];
        }
      }
      const poly = ee.Geometry.Polygon(coords);

      const dsConfig = getDatasetConfig(dataset);
      if (!dsConfig) {
        console.error(`Unsupported dataset for map summaries: ${dataset}`);
        resolve(null);
        return;
      }

      const collection = buildDatasetCollection(dataset, startDate, endDate);
      if (!collection) {
        console.error(`Unsupported dataset collection for map summaries: ${dataset}`);
        resolve(null);
        return;
      }

      collection.mean()
        .reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: poly,
          scale: dsConfig.scale,
          bestEffort: true,
          maxPixels: 1e9
        })
        .getInfo((meanValue, error) => {
          if (error) {
            console.error(`Error fetching data for ${district.name}:`, error);
            resolve(null);
          } else {
            let value = meanValue ? Object.values(meanValue)[0] : null;
            if (value !== null && value !== undefined && dsConfig.postProcess) {
              value = dsConfig.postProcess(value);
            }
            resolve(value);
          }
        });
    } catch (e) {
      console.error(`Exception processing ${district.name}:`, e.message);
      resolve(null);
    }
  });
}

app.post("/api/get_env_data_all", async (req, res) => {
  try {
    const { startDate, endDate, dataset, districts } = req.body;
    const results = {};

    console.log(`Received ${districts.length} districts`);
    if (districts.length > 0) {
      console.log("First district coordinates:", JSON.stringify(districts[0].geometry).substring(0, 200));
    }

    if (districts.length === 0) {
      res.json(results);
      return;
    }

    const chunkSize = 100;
    for (let i = 0; i < districts.length; i += chunkSize) {
      const chunk = districts.slice(i, i + chunkSize);
      const promises = chunk.map(d => fetchDistrictValue(d, startDate, endDate, dataset));
      const values = await Promise.all(promises);
      chunk.forEach((d, idx) => {
        results[d.name] = values[idx];
      });
      console.log(`Processed chunk ${i / chunkSize + 1} / ${Math.ceil(districts.length / chunkSize)}`);
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch environmental data" });
  }
});

// Route to get time series data for a specific district
app.post("/api/get_timeseries", (req, res) => {
  try {
    const { districtName, districtGeometry, startDate, endDate, dataset } = req.body;
    if (!districtName || !districtGeometry) {
      return res.status(400).json({ error: "districtName and districtGeometry required" });
    }

    console.log(`[Timeseries] Received request for ${districtName}`);
    console.log(`[Timeseries] Full geometry structure:`, JSON.stringify(districtGeometry));
    console.log(`[Timeseries] Geometry type:`, typeof districtGeometry, `is Array:`, Array.isArray(districtGeometry));

    // Validate and prepare geometry. Accept either raw coordinates or GeoJSON-like objects.
    let coords = districtGeometry;
    if (coords && typeof coords === "object" && !Array.isArray(coords) && coords.coordinates) {
      coords = coords.coordinates;
    }
    
    // Detect structure depth
    let depth = 0;
    let temp = coords;
    while (Array.isArray(temp) && temp.length > 0) {
      depth++;
      temp = temp[0];
      if (depth > 4) break;
    }
    console.log(`[Timeseries] Detected array depth:`, depth);
    
    // Handle nested MultiPolygon-like shapes by peeling levels until Polygon depth.
    while (
      Array.isArray(coords) &&
      coords.length > 0 &&
      Array.isArray(coords[0]) &&
      coords[0].length > 0 &&
      Array.isArray(coords[0][0]) &&
      coords[0][0].length > 0 &&
      Array.isArray(coords[0][0][0])
    ) {
      coords = coords[0];
      console.log("[Timeseries] Reduced nested geometry level for Polygon conversion");
    }

    // If coordinates are a single ring ([[lng,lat], ...]), wrap as Polygon rings.
    if (
      Array.isArray(coords) &&
      coords.length > 0 &&
      Array.isArray(coords[0]) &&
      coords[0].length > 0 &&
      typeof coords[0][0] === "number"
    ) {
      coords = [coords];
      console.log("[Timeseries] Wrapped single ring into Polygon format");
    }
    
    // Ensure polygon ring is closed
    if (coords.length > 0 && coords[0].length > 0) {
      const ring = coords[0];
      const firstPoint = ring[0];
      const lastPoint = ring[ring.length - 1];
      
      if (JSON.stringify(firstPoint) !== JSON.stringify(lastPoint)) {
        coords[0] = [...ring, firstPoint];
        console.log(`[Timeseries] Closed ring for ${districtName}`);
      }
    }

    console.log(`[Timeseries] Final coords for Polygon:`, JSON.stringify(coords));
    
    let poly;
    try {
      poly = ee.Geometry.Polygon(coords);
      console.log(`[Timeseries] Successfully created Polygon geometry`);
    } catch (geoErr) {
      console.error(`[Timeseries] Error creating Polygon:`, geoErr.message);
      return res.status(400).json({ error: "Invalid geometry: " + geoErr.message });
    }
    const dsConfig = getDatasetConfig(dataset);
    if (!dsConfig) {
      return res.status(400).json({ error: `Unsupported dataset: ${dataset}` });
    }

    const collection = buildDatasetCollection(dataset, startDate, endDate);
    if (!collection) {
      return res.status(400).json({ error: `Unsupported dataset collection: ${dataset}` });
    }

    // Get time series - for each image, reduce to region mean
    const processCollection = function() {
      const size = collection.size();
      
      // Return early if no images
      return ee.Algorithms.If(size.gt(0),
        // True: process the collection
        collection.toList(size).map(function(singleImg) {
          const img = ee.Image(singleImg);
          // Collection already has correct band selected, just reduce it
          const mean = img.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: poly,
            scale: dsConfig.scale,
            bestEffort: true,
            maxPixels: 1e9
          });
          const dateStr = img.date().format('yyyy-MM-dd');
          // Safely extract the reduction value; the dictionary may be empty
          const vals = mean.values();
          const value = ee.Algorithms.If(
            ee.Algorithms.IsEqual(vals.size(), 0),
            null,
            vals.get(ee.Number(0))
          );
          return ee.Feature(null, {
            value: value,
            date: dateStr
          });
        }),
        // False: return empty list
        ee.List([])
      );
    };
    
    const features = ee.FeatureCollection(processCollection());
    
    features.getInfo((result, error) => {
      if (error) {
        console.error(`Error fetching timeseries for ${districtName}:`, error);
        return res.status(500).json({ error: "Failed to fetch timeseries: " + error.message });
      }
      
      // result is an array of features (possibly empty)
      const features_array = Array.isArray(result) ? result : (result.features || []);
      
      if (features_array.length === 0) {
        console.log(`No data available for ${districtName} with dataset ${dataset} in range ${startDate} to ${endDate}`);
        return res.json({ district: districtName, dataset: dataset, timeseries: [] });
      }
      
      const timeseries = features_array.map(feature => {
        let val = feature.properties.value;
        if (val !== null && val !== undefined && dsConfig.postProcess) {
          val = dsConfig.postProcess(val);
        }
        return { date: feature.properties.date, value: val };
      }).sort((a, b) => a.date.localeCompare(b.date));
      
      res.json({ district: districtName, dataset: dataset, timeseries: timeseries });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch timeseries" });
  }
});

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit - keep the server alive
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep the server alive
});
