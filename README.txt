THAI FLOOD WATCH - Rain Forecast Map

1. Replace repository root server.js with this server.js.
2. Create public/ directory in repository root and upload public/index.html.
3. Keep your existing package.json if it already starts with `node server.js` and uses Express and dotenv.
   Otherwise use the included package.json.
4. Render environment variable TMD_TOKEN must remain configured.
5. Deploy and open https://thai-flood-watch.onrender.com/

NOTE: TMD sample points are model forecasts, not actual rain radar or a continuous national precipitation grid.
TMD can rate limit requests; server caches each point for 30 minutes.
