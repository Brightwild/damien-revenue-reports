const { BigQuery } = require("@google-cloud/bigquery");
const { PROJECT, SQL, buildReport } = require("../lib/report");

// GCP_SERVICE_ACCOUNT_JSON holds a read-only BigQuery service account key,
// as raw JSON or base64 (same convention as lunara-bay-monthly).
function client() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const creds = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  return new BigQuery({
    projectId: PROJECT,
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
  });
}

module.exports = async function handler(req, res) {
  const bq = client();
  if (!bq) {
    res.status(503).json({ error: "GCP_SERVICE_ACCOUNT_JSON is not configured" });
    return;
  }
  try {
    const [rows] = await bq.query({ query: SQL, location: "US" });
    // The mart refreshes daily; serve from the CDN for an hour and keep
    // serving the last good copy while a refresh runs or if BigQuery fails.
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400");
    res.status(200).json(buildReport(rows));
  } catch (error) {
    console.error("BigQuery revenue report failed", error);
    res.status(502).json({ error: "Revenue data is unavailable" });
  }
};
