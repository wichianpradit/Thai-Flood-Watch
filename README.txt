Thai Flood Watch V7 - Water station support

Replace index.html and server.js in the same locations as your existing files. If your site serves public/index.html, replace that file rather than root index.html. Commit both changes to GitHub and wait for Render Live. Keep TMD_TOKEN configured on Render.

/api/water/stations now returns normalized stations. /api/water/stations/raw preserves the original response. The UI shows observed MSL levels, previous changes, station names and search. It does not interpret situation_level as an official warning.
