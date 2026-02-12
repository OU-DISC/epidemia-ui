import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";

export default function EthiopiaMap({ onSelectRegion }) {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    fetch("/eth_admin3.geojson")
      .then((res) => res.json())
      .then(setGeoData); // just load GeoJSON as-is
  }, []);

  function onEachFeature(feature, layer) {
    const name = feature.properties.adm3_name; // use adm3_name directly

    layer.on({
      click: () => onSelectRegion(name) // callback when district clicked
    });

    layer.bindTooltip(name, { sticky: true });
  }

  return (
    <MapContainer
      center={[9.0, 40.5]}
      zoom={6}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {geoData && (
        <GeoJSON
          data={geoData}
          onEachFeature={onEachFeature}
          style={{
            fillColor: "#e5e5e5",
            weight: 1,
            color: "#555",
            fillOpacity: 0.7
          }}
        />
      )}
    </MapContainer>
  );
}
