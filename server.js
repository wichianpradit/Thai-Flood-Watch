import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ไฟล์หน้าเว็บ
app.use(express.static("public"));

// ===============================
// HEALTH CHECK
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Thai Flood Watch TMD Gateway"
  });
});

// ===============================
// TMD HOURLY WEATHER
// ===============================
app.get("/api/tmd/weather3hours", async (req, res) => {

  const token = process.env.TMD_TOKEN;

  if (!token) {
    return res.status(503).json({
      ok: false,
      error: "TMD_TOKEN is not configured"
    });
  }

  try {

    const url =
      "https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        status: response.status,
        error: text
      });
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "TMD returned invalid JSON",
        raw: text
      });
    }

    res.json({
      ok: true,
      source: "TMD Weather Forecast API",
      data: data
    });

  } catch (err) {

    console.error("TMD API ERROR:", err);

    res.status(500).json({
      ok: false,
      error: err.message
    });

  }
});

// ===============================
// ROOT
// ===============================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Thai Flood Watch",
    health: "/api/health",
    weather: "/api/tmd/weather3hours"
  });
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Thai Flood Watch running on port ${PORT}`);
});
