
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ====================================
// THAI FLOOD WATCH - HEALTH CHECK
// ====================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Thai Flood Watch",
    status: "running",
    tmdConfigured: Boolean(process.env.TMD_TOKEN),
    time: new Date().toISOString()
  });
});

// ====================================
// TMD HOURLY WEATHER FORECAST
// ====================================

app.get("/api/tmd/weather3hours", async (req, res) => {
  const token = process.env.TMD_TOKEN;

  if (!token) {
    return res.status(503).json({
      ok: false,
      error: "TMD_TOKEN is not configured"
    });
  }

  const lat = Number(req.query.lat ?? 6.87);
  const lon = Number(req.query.lon ?? 101.25);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid coordinates"
    });
  }

  try {
    const url = new URL(
      "https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at"
    );

    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set(
      "fields",
      "tc,rh,rain,ws10m,wd10m"
    );
    url.searchParams.set("duration", "24");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(20000)
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        upstreamStatus: response.status,
        error: text.slice(0, 1000)
      });
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "TMD returned invalid JSON",
        details: text.slice(0, 1000)
      });
    }

    return res.json({
      ok: true,
      source: "Thailand Meteorological Department",
      location: { lat, lon },
      data
    });

  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error.message
    });
  }
});

// ====================================
// SERVER INFORMATION
// ====================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "Thai Flood Watch",
    endpoints: {
      health: "/api/health",
      weather: "/api/tmd/weather3hours"
    }
  });
});

// ====================================
// START SERVER
// ====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Thai Flood Watch running on port ${PORT}`);
});
