import { findDistrictFromLookup, resolveDistrictFeature } from "./districtNameMatch";

export const REPORT_SCOPE_COUNTRY = "country";
export const REPORT_SCOPE_REGION = "region";
export const REPORT_SCOPE_DISTRICT = "district";

export const REPORT_SCOPE_OPTIONS = [
  { value: REPORT_SCOPE_COUNTRY, label: "Whole country" },
  { value: REPORT_SCOPE_REGION, label: "Selected region" },
  { value: REPORT_SCOPE_DISTRICT, label: "Selected district" },
];

export function canUseReportScope(scope, { region, selectedAdminRegion }) {
  if (scope === REPORT_SCOPE_REGION) {
    return (
      selectedAdminRegion &&
      selectedAdminRegion !== "All Regions" &&
      selectedAdminRegion !== "No Selection"
    );
  }
  if (scope === REPORT_SCOPE_DISTRICT) {
    return region && region !== "All Regions";
  }
  return true;
}

export function resolveReportScopeContext(
  scope,
  { region, selectedAdminRegion, adm3Lookup, country = "Ethiopia" }
) {
  if (
    scope === REPORT_SCOPE_DISTRICT &&
    region &&
    region !== "All Regions" &&
    adm3Lookup?.size
  ) {
    const feature = findDistrictFromLookup(adm3Lookup, region);
    const regionName = feature?.properties?.adm1_name || selectedAdminRegion;
    const validRegion =
      regionName && regionName !== "All Regions" && regionName !== "No Selection"
        ? regionName
        : null;

    return {
      scope: REPORT_SCOPE_DISTRICT,
      scopeLabel: region,
      regionName: validRegion,
      districtName: region,
      mapFilter: validRegion || "All Regions",
      selectedDistrict: region,
      country,
    };
  }

  if (
    scope === REPORT_SCOPE_REGION &&
    canUseReportScope(REPORT_SCOPE_REGION, { region, selectedAdminRegion })
  ) {
    return {
      scope: REPORT_SCOPE_REGION,
      scopeLabel: selectedAdminRegion,
      regionName: selectedAdminRegion,
      districtName: null,
      mapFilter: selectedAdminRegion,
      selectedDistrict: null,
      country,
    };
  }

  return {
    scope: REPORT_SCOPE_COUNTRY,
    scopeLabel: country,
    regionName: null,
    districtName: null,
    mapFilter: "All Regions",
    selectedDistrict: null,
    country,
  };
}

function matchesScopeContext(row, scopeContext) {
  if (scopeContext.scope === REPORT_SCOPE_COUNTRY) return true;
  if (scopeContext.scope === REPORT_SCOPE_REGION) {
    return row.region === scopeContext.regionName;
  }
  if (scopeContext.scope === REPORT_SCOPE_DISTRICT) {
    return row.mapDistrict === scopeContext.districtName;
  }
  return true;
}

export function filterDistrictRowsByScope(districtRows, scopeContext) {
  return (districtRows || []).filter((row) => matchesScopeContext(row, scopeContext));
}

export function filterAlertsByScope(alerts, adm3Lookup, scopeContext, geoData = null) {
  if (scopeContext.scope === REPORT_SCOPE_COUNTRY) return alerts || [];

  return (alerts || []).filter((alert) => {
    const feature = resolveDistrictFeature(adm3Lookup, alert.district, geoData);
    const mapDistrict = feature?.properties?.adm3_name || alert.district;
    const region = feature?.properties?.adm1_name || "";
    return matchesScopeContext({ mapDistrict, region }, scopeContext);
  });
}

/** Filter map/report alerts to a single admin region (or all / none). */
export function filterAlertsByAdminRegion(alerts, adm3Lookup, adminRegion, geoData = null) {
  if (!adminRegion || adminRegion === "All Regions") {
    return alerts || [];
  }
  if (adminRegion === "No Selection") {
    return [];
  }
  // Before boundaries finish loading, skip region filtering so markers still render.
  if (!adm3Lookup?.size && !geoData?.features?.length) {
    return alerts || [];
  }
  return filterAlertsByScope(
    alerts,
    adm3Lookup,
    {
      scope: REPORT_SCOPE_REGION,
      regionName: adminRegion,
    },
    geoData
  );
}

export function scopeDescription(scopeContext) {
  if (scopeContext.scope === REPORT_SCOPE_DISTRICT) {
    return `${scopeContext.districtName} (${scopeContext.regionName || "district focus"})`;
  }
  if (scopeContext.scope === REPORT_SCOPE_REGION) {
    return scopeContext.regionName;
  }
  return scopeContext.country || "Whole country";
}

export function buildReportTitle(scopeContext) {
  const country = scopeContext.country || "Ethiopia";
  if (scopeContext.scope === REPORT_SCOPE_DISTRICT) {
    return `Malaria Early Detection and Early Warning Report for ${scopeContext.districtName}, ${scopeContext.regionName || country}`;
  }
  if (scopeContext.scope === REPORT_SCOPE_REGION) {
    return `Malaria Early Detection and Early Warning Report for ${scopeContext.regionName}, ${country}`;
  }
  return `Malaria Early Detection and Early Warning Report for ${country}`;
}

export function buildReportFilename(scopeContext) {
  const date = new Date().toISOString().slice(0, 10);
  let slug = "Ethiopia";

  if (scopeContext.scope === REPORT_SCOPE_DISTRICT) {
    slug = [scopeContext.regionName, scopeContext.districtName].filter(Boolean).join("_");
  } else if (scopeContext.scope === REPORT_SCOPE_REGION) {
    slug = scopeContext.regionName || "Region";
  }

  const safeSlug = String(slug)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);

  return `EPIDEMIA_Report_${safeSlug || "Ethiopia"}_${date}.pdf`;
}
