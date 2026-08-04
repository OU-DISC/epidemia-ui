import json
from pathlib import Path
from collections import defaultdict
import pandas as pd

report = Path(r"c:\Users\bash0006\EPIDEMIA\frontend\epidemia-ui\backend\report\report_data.json")
print("Loading report...")
payload = json.loads(report.read_text(encoding="utf-8"))
forecasts = payload.get("forecasts") or []
print("forecast series", len(forecasts), "district_count meta", (payload.get("cache_meta") or payload.get("meta") or {}))

# Aggregate national weekly totals by species from observed_history + forecast
rows = []
for fc in forecasts:
    species = fc.get("species") or fc.get("Species") or "?"
    district = fc.get("district")
    for pt in fc.get("observed_history") or []:
        rows.append({
            "district": district,
            "species": species,
            "kind": "observed",
            "date": pt.get("date") or pt.get("week_start") or pt.get("obs_date"),
            "cases": pt.get("cases") if pt.get("cases") is not None else pt.get("value"),
        })
    for pt in fc.get("forecast") or []:
        rows.append({
            "district": district,
            "species": species,
            "kind": "forecast",
            "date": pt.get("date") or pt.get("week_start") or pt.get("obs_date"),
            "cases": pt.get("cases") if pt.get("cases") is not None else pt.get("value") or pt.get("yhat"),
        })

df = pd.DataFrame(rows)
print("sample cols keys from first forecast point:")
print(json.dumps(forecasts[0].get("forecast", [{}])[:1], indent=2)[:800])
print("sample observed:")
print(json.dumps(forecasts[0].get("observed_history", [{}])[-1:], indent=2)[:800])
print("df shape", df.shape, "null dates", df["date"].isna().sum(), "null cases", df["cases"].isna().sum())
print(df.head(2))
