import { feature } from "topojson-client";

/**
 * Converts a TopoJSON topology (as parsed JSON) to a GeoJSON FeatureCollection
 * for react-leaflet. Supports multiple named objects; merges all into one collection.
 */
export function topojsonToFeatureCollection(topology) {
  const names = Object.keys(topology.objects || {});
  if (names.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const features = [];
  for (const n of names) {
    const f = feature(topology, n);
    if (f.type === "FeatureCollection") {
      for (const x of f.features) {
        features.push(x);
      }
    } else {
      features.push(f);
    }
  }
  return { type: "FeatureCollection", features };
}
