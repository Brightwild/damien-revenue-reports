// Revenue report built from brightwild_analytics_mart.complex_nights_pacing and
// units_nights_pacing. Both marts already align STLY (bookings on the books 364 days before the
// snapshot, for the night 364 days earlier) and LY (that night's final
// revenue), so every year gets real CY / STLY / LY Final series.

const PROJECT = "guesty-database";
const MART = "`guesty-database.brightwild_analytics_mart`";

const KHE_ORIGINAL_10 = [
  "KHE 2 Shoreline", "KHE 4 Shoreline", "KHE 6 Shoreline", "KHE 8 Shoreline",
  "KHE 10 Shoreline", "KHE 12 Shoreline", "KHE 14 Shoreline", "KHE 16 Shoreline",
  "KHE 2 Terrace", "KHE 4 Terrace",
];

const q = (names) => names.map((n) => `'${n}'`).join(", ");

// Forward reservations on a multi-unit parent listing are not assigned to a
// unit yet, so units_nights_pacing misses them; complex_nights_pacing counts
// them. Every group that is a whole complex therefore reads complex nights.
// Unit nights are used only for a unit subset of a complex (KHE Original 10)
// and, inside All Properties, for units that belong to no paced complex.
//
// Display order. `match` is a SQL predicate over the `nights` rows below:
// src ('complex' | 'unit'), cx (complex_2_name), u (unit_name, unit rows only)
// and paced (a unit row whose complex is in complex_nights_pacing).
const GROUPS = [
  { key: "ALL_PROPERTIES", name: "All Properties", match: "src = 'complex' OR (src = 'unit' AND NOT paced)" },
  { key: "KHE_ORIGINAL_10", name: "KHE Original 10", match: `src = 'unit' AND u IN (${q(KHE_ORIGINAL_10)})` },
  { key: "GEMMA_4_UNITS", name: "Gemma (4 units)", match: "src = 'complex' AND cx = 'The Gemma'" },
  { key: "HOTEL_CABANA", name: "Hotel Cabana", match: "src = 'complex' AND cx = 'Hotel Cabana'" },
  { key: "720_D_SIMONTON", name: "720 D Simonton", match: "src = 'complex' AND cx = '720 Simonton D'" },
  { key: "KAMP_430_FLEMING", name: "Kamp (430 Fleming)", match: "src = 'complex' AND cx = '430 Fleming'" },
  { key: "BEACHSIDE_ALL", name: "Beachside", match: "src = 'complex' AND cx = 'Beachside Key West'" },
  { key: "LUNARA_BAY_ALL", name: "Lunara Bay", match: "src = 'complex' AND cx = 'Key Haven Estates'" },
  { key: "CURRY_MANSION_ALL", name: "Curry Mansion", match: "src = 'complex' AND cx = 'CMI COMPLEX'" },
];

const SQL = `
WITH paced_complexes AS (
  SELECT DISTINCT complex_2_name AS cx FROM ${MART}.complex_nights_pacing
),
unit_complex AS (
  SELECT unit_id, ANY_VALUE(complex_2_name) AS cx
  FROM ${MART}.unit_calendar
  GROUP BY unit_id
),
nights AS (
  SELECT 'complex' AS src, k.complex_2_name AS cx, CAST(NULL AS STRING) AS u, TRUE AS paced,
    EXTRACT(YEAR FROM k.calendar_night) AS y, EXTRACT(MONTH FROM k.calendar_night) AS m,
    IFNULL(k.revenue, 0) AS cy, IFNULL(k.revenue_stly, 0) AS stly, IFNULL(k.revenue_ly, 0) AS ly,
    k.snapshot_date
  FROM ${MART}.complex_nights_pacing k
  UNION ALL
  SELECT 'unit', c.cx, p.unit_name, IFNULL(c.cx IN (SELECT cx FROM paced_complexes), FALSE),
    EXTRACT(YEAR FROM p.calendar_night), EXTRACT(MONTH FROM p.calendar_night),
    IFNULL(p.revenue, 0), IFNULL(p.revenue_stly, 0), IFNULL(p.revenue_ly, 0),
    p.snapshot_date
  FROM ${MART}.units_nights_pacing p
  LEFT JOIN unit_complex c USING (unit_id)
)
${GROUPS.map(
  (g) => `SELECT '${g.key}' AS grp, y, m, SUM(cy) AS cy, SUM(stly) AS stly, SUM(ly) AS ly, MAX(snapshot_date) AS snap
FROM nights WHERE ${g.match} GROUP BY y, m`,
).join("\nUNION ALL\n")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateValue(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : value.value ?? String(value);
}

/** Shape warehouse rows into the page's { years: { [year]: { unitGroups } } } contract. */
function buildReport(rows, now = new Date()) {
  const years = {};
  let snapshot = null;
  for (const row of rows) {
    const year = String(row.y);
    const month = Number(row.m) - 1;
    const def = GROUPS.find((g) => g.key === row.grp);
    if (!def || month < 0 || month > 11) continue;
    const groups = (years[year] ??= { unitGroups: {} }).unitGroups;
    const group = (groups[def.key] ??= {
      name: def.name,
      months: MONTHS,
      cy: Array(12).fill(0),
      stly: Array(12).fill(0),
      lyFinal: Array(12).fill(0),
    });
    group.cy[month] = Math.round(Number(row.cy) || 0);
    group.stly[month] = Math.round(Number(row.stly) || 0);
    group.lyFinal[month] = Math.round(Number(row.ly) || 0);
    const snap = dateValue(row.snap);
    if (snap && (!snapshot || snap > snapshot)) snapshot = snap;
  }
  for (const entry of Object.values(years)) {
    const ordered = {};
    for (const g of GROUPS) if (entry.unitGroups[g.key]) ordered[g.key] = entry.unitGroups[g.key];
    entry.unitGroups = ordered;
  }
  const available = Object.keys(years).sort();
  const thisYear = String(now.getUTCFullYear());
  return {
    snapshotDate: snapshot,
    generatedAt: now.toISOString(),
    defaultYear: available.includes(thisYear) ? thisYear : available[available.length - 1] ?? thisYear,
    years,
  };
}

module.exports = { PROJECT, SQL, GROUPS, buildReport };
