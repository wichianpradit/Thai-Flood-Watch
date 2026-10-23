# Marine Weather Mobile

เว็บมือถือสร้างใหม่ แยกจาก ESP32

## Data
- Weather: TMD NWP API (`forecast/location/hourly/at`) with Bearer Personal Access Token.
- Sea/Wave: Open-Meteo Marine API.
- TMD PAT stays on the server in `.env`; it is not exposed to the phone browser.

## Run on Windows
1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Put your TMD PAT in `TMD_PAT=...`.
4. Open Command Prompt in this folder:
   npm install
   npm start
5. Open http://localhost:3000

To use from another phone on the same Wi-Fi, open `http://<PC-LAN-IP>:3000`.

## 7-day TMD note
The backend requests `duration=168` and aggregates hourly TMD records by day. If the TMD endpoint/account rejects that duration, it automatically falls back to 24 hours. The UI never fabricates missing days.

## Production
Deploy the Node server to a HTTPS host and set `TMD_PAT` as a secret environment variable. Do not put the PAT in `public/app.js`.

## Tide & Current V2
- Menu TIDE: selectable 7 days, hourly tide-height line, hourly current color bars, click-to-inspect, estimated HIGH/LOW turning points.
- Marine model: Open-Meteo `sea_level_height_msl`, `ocean_current_velocity`, `ocean_current_direction`.
- Tide reference is MSL, not chart datum. Turning points are hourly-resolution approximations. Not safe as sole coastal-navigation source.
- Color thresholds are UI defaults, not universal safety ratings.
