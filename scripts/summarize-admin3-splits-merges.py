"""Build readable split/merge summary tables from overlap links CSV."""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"
LINKS = PUBLIC / "eth_admin3_split_merge_links.csv"
OUT_SPLITS = PUBLIC / "eth_admin3_old_splits_to_new.csv"
OUT_MERGES = PUBLIC / "eth_admin3_new_merges_from_old.csv"


def main() -> None:
    rows = list(csv.DictReader(LINKS.open(encoding="utf-8")))
    cross = [r for r in rows if r["relation"] == "cross_pcode_overlap"]

    by_old = defaultdict(list)
    by_new = defaultdict(list)
    for r in cross:
        by_old[r["old_adm3_pcode"]].append(r)
        by_new[r["new_adm3_pcode"]].append(r)

    split_rows = []
    for old_pcode, links in by_old.items():
        if len(links) < 2:
            continue
        links_sorted = sorted(links, key=lambda x: -float(x["share_of_old"] or 0))
        first = links_sorted[0]
        split_rows.append(
            {
                "old_adm3_pcode": old_pcode,
                "old_adm3_name": first["old_adm3_name"],
                "old_adm1_name": first["old_adm1_name"],
                "old_area_km2": first["old_area_km2"],
                "n_new_parts": len(links_sorted),
                "total_share_of_old_explained": f"{sum(float(x['share_of_old'] or 0) for x in links_sorted):.6f}",
                "new_pcodes": ";".join(x["new_adm3_pcode"] for x in links_sorted),
                "new_names": ";".join(x["new_adm3_name"] for x in links_sorted),
                "share_of_old_list": ";".join(x["share_of_old"] for x in links_sorted),
                "intersection_km2_list": ";".join(x["intersection_km2"] for x in links_sorted),
            }
        )
    split_rows.sort(key=lambda r: (-int(r["n_new_parts"]), -float(r["total_share_of_old_explained"])))

    merge_rows = []
    for new_pcode, links in by_new.items():
        if len(links) < 2:
            continue
        links_sorted = sorted(links, key=lambda x: -float(x["share_of_new"] or 0))
        first = links_sorted[0]
        merge_rows.append(
            {
                "new_adm3_pcode": new_pcode,
                "new_adm3_name": first["new_adm3_name"],
                "new_adm1_name": first["new_adm1_name"],
                "new_area_km2": first["new_area_km2"],
                "n_old_parts": len(links_sorted),
                "total_share_of_new_explained": f"{sum(float(x['share_of_new'] or 0) for x in links_sorted):.6f}",
                "old_pcodes": ";".join(x["old_adm3_pcode"] for x in links_sorted),
                "old_names": ";".join(x["old_adm3_name"] for x in links_sorted),
                "share_of_new_list": ";".join(x["share_of_new"] for x in links_sorted),
                "intersection_km2_list": ";".join(x["intersection_km2"] for x in links_sorted),
            }
        )
    merge_rows.sort(key=lambda r: (-int(r["n_old_parts"]), -float(r["total_share_of_new_explained"])))

    with OUT_SPLITS.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "old_adm3_pcode",
                "old_adm3_name",
                "old_adm1_name",
                "old_area_km2",
                "n_new_parts",
                "total_share_of_old_explained",
                "new_pcodes",
                "new_names",
                "share_of_old_list",
                "intersection_km2_list",
            ],
        )
        writer.writeheader()
        writer.writerows(split_rows)

    with OUT_MERGES.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "new_adm3_pcode",
                "new_adm3_name",
                "new_adm1_name",
                "new_area_km2",
                "n_old_parts",
                "total_share_of_new_explained",
                "old_pcodes",
                "old_names",
                "share_of_new_list",
                "intersection_km2_list",
            ],
        )
        writer.writeheader()
        writer.writerows(merge_rows)

    print(f"Wrote {OUT_SPLITS} ({len(split_rows)} old woredas that overlap 2+ new)")
    print(f"Wrote {OUT_MERGES} ({len(merge_rows)} new woredas that overlap 2+ old)")


if __name__ == "__main__":
    main()
