# Sunday Revenue Report

Revenue by property group for Damien: CY on the books, STLY and LY Final by
month, one tab per year.

- `public/index.html` is the page. It fetches `/api/data`.
- `api/data.js` is a Vercel function that queries
  `guesty-database.brightwild_analytics_mart.units_nights_pacing` and caches
  the result at the CDN for an hour. The mart refreshes daily, so the page is
  always current; nothing commits data to this repo.
- `lib/report.js` holds the property-group definitions and the SQL.

## Definitions

The pacing mart aligns nights 364 days apart (same weekday):

- **CY**: revenue on the books today for the year's nights.
- **STLY**: revenue that was on the books 364 days ago for the nights 364 days earlier.
- **LY Final**: those earlier nights' final revenue.

## Configuration

The Vercel project needs `GCP_SERVICE_ACCOUNT_JSON`: a service account key
with BigQuery read access to `guesty-database`, as raw JSON or base64.

## Tests

```bash
npm test
```
