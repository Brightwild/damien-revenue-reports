// Revenue report built from brightwild_analytics_mart.units_nights_pacing.
// That mart already aligns STLY (bookings on the books 364 days before the
// snapshot, for the night 364 days earlier) and LY (that night's final
// revenue), so every year gets real CY / STLY / LY Final series.

const PROJECT = "guesty-database";
const MART = "`guesty-database.brightwild_analytics_mart`";

const KHE_ORIGINAL_10 = [
  "KHE 2 Shoreline", "KHE 4 Shoreline", "KHE 6 Shoreline", "KHE 8 Shoreline",
  "KHE 10 Shoreline", "KHE 12 Shoreline", "KHE 14 Shoreline", "KHE 16 Shoreline",
  "KHE 2 Terrace", "KHE 4 Terrace",
];

// Display order. `match` is a SQL predicate over unit_name (u) and complex_2_name (cx).
const GROUPS = [
  { key: "ALL_PROPERTIES", name: "All Properties", match: "TRUE" },
  { key: "KHE_ORIGINAL_10", name: "KHE Original 10", match: `u IN (${KHE_ORIGINAL_10.map((n) => `'${n}'`).join(", ")})` },
  { key: "GEMMA_4_UNITS", name: "Gemma (4 units)", match: "STARTS_WITH(u, 'Gemma')" },
  { key: "HOTEL_CABANA", name: "Hotel Cabana", match: "cx = 'Hotel Cabana'" },
  { key: "720_D_SIMONTON", name: "720 D Simonton", match: "STARTS_WITH(u, '720 D Simonton')" },
  { key: "KAMP_430_FLEMING", name: "Kamp (430 Fleming)", match: "cx = '430 Fleming'" },
  { key: "BEACHSIDE_ALL", name: "Beachside", match: "STARTS_WITH(u, 'BKW')" },
  { key: "LUNARA_BAY_ALL", name: "Lunara Bay", match: "STARTS_WITH(u, 'KHE')" },
  { key: "CURRY_MANSION_ALL", name: "Curry Mansion", match: "cx = 'CMI COMPLEX'" },
];

const SQL = `
WITH complexes AS (
  SELECT unit_id, ANY_VALUE(complex_2_name) AS cx
  FROM ${MART}.unit_calendar
  GROUP BY unit_id
),
nights AS (
  SELECT p.unit_name AS u, c.cx,
    EXTRACT(YEAR FROM p.calendar_night) AS y, EXTRACT(MONTH FROM p.calendar_night) AS m,
    IFNULL(p.revenue, 0) AS cy, IFNULL(p.revenue_stly, 0) AS stly, IFNULL(p.revenue_ly, 0) AS ly,
    p.snapshot_date
  FROM ${MART}.units_nights_pacing p
  LEFT JOIN complexes c USING (unit_id)
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
