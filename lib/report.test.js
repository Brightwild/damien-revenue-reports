const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReport } = require("./report");

test("shapes warehouse rows into per-year groups with CY, STLY and LY Final", () => {
  const rows = [
    { grp: "720_D_SIMONTON", y: 2027, m: 1, cy: 35750.4, stly: 37141, ly: 50896, snap: { value: "2026-11-14" } },
    { grp: "ALL_PROPERTIES", y: 2027, m: 12, cy: 57781, stly: 20300, ly: 2824577, snap: { value: "2026-11-14" } },
    { grp: "ALL_PROPERTIES", y: 2026, m: 1, cy: 4997858, stly: 4160963, ly: 4158520, snap: "2026-11-13" },
  ];
  const report = buildReport(rows, new Date("2026-11-14T13:00:00Z"));

  assert.equal(report.snapshotDate, "2026-11-14");
  assert.equal(report.defaultYear, "2026");
  assert.deepEqual(Object.keys(report.years["2027"].unitGroups), ["ALL_PROPERTIES", "720_D_SIMONTON"]);

  const simonton = report.years["2027"].unitGroups["720_D_SIMONTON"];
  assert.equal(simonton.name, "720 D Simonton");
  assert.deepEqual([simonton.cy[0], simonton.stly[0], simonton.lyFinal[0]], [35750, 37141, 50896]);
  assert.equal(simonton.cy[1], 0);
  assert.equal(report.years["2027"].unitGroups.ALL_PROPERTIES.lyFinal[11], 2824577);
});

test("defaults to the latest year when the current year has no data", () => {
  const rows = [{ grp: "ALL_PROPERTIES", y: 2027, m: 1, cy: 1, stly: 1, ly: 1, snap: "2027-01-01" }];
  assert.equal(buildReport(rows, new Date("2026-06-01T00:00:00Z")).defaultYear, "2027");
});
