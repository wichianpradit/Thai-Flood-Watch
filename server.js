import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static('public'));
const TMD_URL = 'https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at';
const FIELDS = 'rain,tc,rh,ws10m,wd10m';
const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;
const POINTS = [
  [20.1,99.2],[19.3,98.6],[19.0,100.1],[18.4,99.0],[18.0,100.2],[17.5,102.6],
  [17.0,99.1],[16.5,100.3],[16.6,102.9],[16.4,104.3],[15.4,100.1],[15.2,102.1],
  [15.2,104.3],[14.5,99.3],[14.0,100.5],[14.4,102.5],[14.3,104.4],[13.4,99.9],
  [13.0,101.2],[12.8,102.4],[12.0,99.8],[12.1,102.2],[11.1,99.5],[10.5,99.2],
  [9.7,99.2],[9.4,98.5],[8.6,98.7],[8.5,99.8],[7.8,98.4],[7.5,100.0],
  [6.9,100.5],[6.7,101.5],[6.3,101.1]
].map(([lat,lon], id) => ({id,lat,lon}));
function coords(req) {
  const lat = Number(req.query.lat ?? 6.87), lon = Number(req.query.lon ?? 101.25);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {lat,lon};
}
async function tmdAt(lat, lon, duration=12) {
  if (!process.env.TMD_TOKEN) throw Object.assign(new Error('TMD_TOKEN is not configured'),{status:503});
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${duration}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.value;
  const url = new URL(TMD_URL);
  url.searchParams.set('lat',String(lat)); url.searchParams.set('lon',String(lon));
  url.searchParams.set('fields',FIELDS); url.searchParams.set('duration',String(duration));
  const response = await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${process.env.TMD_TOKEN}`},signal:AbortSignal.timeout(18000)});
  const body = await response.text();
  if (!response.ok) throw Object.assign(new Error(`TMD HTTP ${response.status}: ${body.slice(0,180)}`),{status:response.status===429?429:502});
  let json;
  try { json = JSON.parse(body); } catch { throw Object.assign(new Error('TMD returned invalid JSON'),{status:502}); }
  const forecasts = json.WeatherForecasts?.[0]?.forecasts;
  if (!Array.isArray(forecasts) || !forecasts.length) throw Object.assign(new Error('TMD returned no hourly forecasts'),{status:502});
  const value = {location:json.WeatherForecasts[0].location ?? {lat,lon}, forecasts};
  cache.set(key,{time:Date.now(),value});
  return value;
}
app.get('/api/health',(req,res)=>res.json({ok:true,service:'Thai Flood Watch',status:'running',tmdConfigured:!!process.env.TMD_TOKEN,time:new Date().toISOString()}));
app.get('/api/tmd/weather3hours',async(req,res)=>{
  const p=coords(req); if(!p) return res.status(400).json({ok:false,error:'Invalid coordinates'});
  try { const data=await tmdAt(p.lat,p.lon,24); res.json({ok:true,source:'Thailand Meteorological Department',location:p,data:{WeatherForecasts:[data]}}); }
  catch(e){res.status(e.status||502).json({ok:false,error:e.message});}
});
// National sample points; not a continuous radar or gridded observation product.
app.get('/api/tmd/rain-map',async(req,res)=>{
  if(!process.env.TMD_TOKEN) return res.status(503).json({ok:false,error:'TMD_TOKEN is not configured'});
  const results=[]; let cursor=0;
  async function worker(){
    while(cursor<POINTS.length){
      const point=POINTS[cursor++];
      try { const data=await tmdAt(point.lat,point.lon,12); results.push({...point,forecasts:data.forecasts}); }
      catch(e){results.push({...point,error:e.message}); if(e.status===429) break;}
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  results.sort((a,b)=>a.id-b.id);
  res.json({ok:true,source:'TMD hourly model forecast',kind:'sampled-forecast',notLiveRadar:true,cacheMinutes:30,points:results,successCount:results.filter(x=>x.forecasts).length,requestedCount:POINTS.length,generatedAt:new Date().toISOString()});
});
app.get('/',(req,res)=>res.sendFile('index.html',{root:'public'}));
app.listen(PORT,'0.0.0.0',()=>console.log(`Thai Flood Watch listening on ${PORT}`));
