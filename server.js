
import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

app.use(express.json());
app.use(express.static(PUBLIC));

// =======================================
// THAI FLOOD WATCH - TMD API
// =======================================

const TMD_URL =
  "https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at";

const FIELDS = "rain,tc,rh,ws10m,wd10m";
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map();

// จุดตัวอย่างทั่วประเทศไทย
const POINTS = [
  [20.1,99.2],[19.3,98.6],[19.0,100.1],
  [18.4,99.0],[18.0,100.2],[17.5,102.6],
  [17.0,99.1],[16.5,100.3],[16.6,102.9],
  [16.4,104.3],[15.4,100.1],[15.2,102.1],
  [15.2,104.3],[14.5,99.3],[14.0,100.5],
  [14.4,102.5],[14.3,104.4],[13.4,99.9],
  [13.0,101.2],[12.8,102.4],[12.0,99.8],
  [12.1,102.2],[11.1,99.5],[10.5,99.2],
  [9.7,99.2],[9.4,98.5],[8.6,98.7],
  [8.5,99.8],[7.8,98.4],[7.5,100.0],
  [6.9,100.5],[6.7,101.5],[6.3,101.1]
].map(([lat, lon], id) => ({ id, lat, lon }));

function getCoords(req) {
  const lat = Number(req.query.lat ?? 6.87);
  const lon = Number(req.query.lon ?? 101.25);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    return null;
  }

  return { lat, lon };
}

// =======================================
// FETCH TMD FORECAST
// =======================================

async function fetchTMD(lat, lon, duration = 12) {
  const token = process.env.TMD_TOKEN;

  if (!token) {
    const error = new Error("TMD_TOKEN is not configured");
    error.status = 503;
    throw error;
  }

  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${duration}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < CACHE_MS) {
    return cached.value;
  }

  const url = new URL(TMD_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("duration", String(duration));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(20000)
  });

  const body = await response.text();

  if (!response.ok) {
    const error = new Error(
      `TMD HTTP ${response.status}: ${body.slice(0, 180)}`
    );
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  let json;

  try {
    json = JSON.parse(body);
  } catch {
    const error = new Error("TMD returned invalid JSON");
    error.status = 502;
    throw error;
  }

  const item = json.WeatherForecasts?.[0];
  const forecasts = item?.forecasts;

  if (!Array.isArray(forecasts) || forecasts.length === 0) {
    const error = new Error("TMD returned no hourly forecasts");
    error.status = 502;
    throw error;
  }

  const value = {
    location: item.location ?? { lat, lon },
    forecasts
  };

  cache.set(key, {
    time: Date.now(),
    value
  });

  return value;
}

// =======================================
// HEALTH CHECK
// =======================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Thai Flood Watch",
    status: "running",
    tmdConfigured: Boolean(process.env.TMD_TOKEN),
    time: new Date().toISOString()
  });
});

// =======================================
// WEATHER FORECAST
// =======================================

app.get("/api/tmd/weather3hours", async (req, res) => {
  const p = getCoords(req);

  if (!p) {
    return res.status(400).json({
      ok: false,
      error: "Invalid coordinates"
    });
  }

  try {
    const data = await fetchTMD(p.lat, p.lon, 24);

    res.json({
      ok: true,
      source: "Thailand Meteorological Department",
      location: p,
      data: {
        WeatherForecasts: [data]
      }
    });
  } catch (error) {
    res.status(error.status || 502).json({
      ok: false,
      error: error.message
    });
  }
});

// =======================================
// THAILAND RAIN FORECAST MAP
// =======================================

app.get("/api/tmd/rain-map", async (req, res) => {
  if (!process.env.TMD_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "TMD_TOKEN is not configured"
    });
  }

  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < POINTS.length) {
      const point = POINTS[cursor++];

      try {
        const data = await fetchTMD(
          point.lat,
          point.lon,
          12
        );

        results.push({
          ...point,
          forecasts: data.forecasts
        });
      } catch (error) {
        results.push({
          ...point,
          error: error.message
        });

        if (error.status === 429) break;
      }
    }
  }

  await Promise.all([
    worker(),
    worker(),
    worker()
  ]);

  results.sort((a, b) => a.id - b.id);

  res.json({
    ok: true,
    source: "TMD hourly model forecast",
    kind: "sampled-forecast",
    notLiveRadar: true,
    cacheMinutes: 30,
    points: results,
    successCount: results.filter(x => x.forecasts).length,
    requestedCount: POINTS.length,
    generatedAt: new Date().toISOString()
  });
});

// =======================================
// HOME PAGE
// =======================================

app.get("/", (req, res) => {
  const publicIndex = path.join(PUBLIC, "index.html");
  const rootIndex = path.join(ROOT, "index.html");

  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }

  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  return res.status(404).json({
    ok: false,
    error: "index.html not found",
    message:
      "Create index.html in the project root or public folder"
  });
});

// =======================================
// START SERVER
// =======================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Thai Flood Watch running on port ${PORT}`);
});
