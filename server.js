import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
dotenv.config();
const app=express();
const PORT=process.env.PORT||3000;
const ROOT=process.cwd();
app.use(express.json());
app.use(express.static(path.join(ROOT,'public')));
const TMD_URL='https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at';
const FIELDS='rain,tc,rh,ws10m,wd10m';
// Rate-limit protection: cache, deduplicate in-flight requests, and honor TMD cooldown.
const cache=new Map();
const pending=new Map();
const CACHE_MS=90*60*1000;
const STALE_MS=12*60*60*1000;
const MAP_CACHE_MS=2*60*60*1000;
let tmdBlockedUntil=0;
let nextTmdStart=0;
let requestLane=Promise.resolve();
let mapCache=null;
let mapPending=null;
const POINTS=[[20.1,99.2],[19.3,98.6],[19,100.1],[18.4,99],[18,100.2],[17.5,102.6],[17,99.1],[16.5,100.3],[16.6,102.9],[16.4,104.3],[15.4,100.1],[15.2,102.1],[15.2,104.3],[14.5,99.3],[14,100.5],[14.4,102.5],[14.3,104.4],[13.4,99.9],[13,101.2],[12.8,102.4],[12,99.8],[12.1,102.2],[11.1,99.5],[10.5,99.2],[9.7,99.2],[9.4,98.5],[8.6,98.7],[8.5,99.8],[7.8,98.4],[7.5,100],[6.9,100.5],[6.7,101.5],[6.3,101.1]].map(([lat,lon],id)=>({id,lat,lon}));
function coords(req){const lat=Number(req.query.lat??6.87),lon=Number(req.query.lon??101.25);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180?{lat,lon}:null;}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function cooldownError(){return Object.assign(new Error('TMD จำกัดจำนวนคำขอชั่วคราว กรุณารอแล้วลองใหม่'),{status:503,retryAfter:Math.ceil((tmdBlockedUntil-Date.now())/1000)});}
async function takeRequestSlot(){
 const prior=requestLane;
 let release;
 requestLane=new Promise(resolve=>{release=resolve;});
 await prior;
 try {
  if(Date.now()<tmdBlockedUntil)throw cooldownError();
  const pause=Math.max(0,nextTmdStart-Date.now());
  if(pause)await wait(pause);
  if(Date.now()<tmdBlockedUntil)throw cooldownError();
  nextTmdStart=Date.now()+1600;
 } finally {release();}
}
async function tmdAt(lat,lon,duration=12){
 if(!process.env.TMD_TOKEN)throw Object.assign(new Error('TMD_TOKEN is not configured'),{status:503});
 // Round to 0.01 degrees to reuse results from repeated nearby clicks.
 const la=Math.round(lat*100)/100,lo=Math.round(lon*100)/100;
 const key=`${la.toFixed(2)},${lo.toFixed(2)},${duration}`;
 const old=cache.get(key);
 if(old&&Date.now()-old.time<CACHE_MS)return {...old.value,cacheStatus:'fresh'};
 if(pending.has(key))return pending.get(key);
 if(Date.now()<tmdBlockedUntil){if(old&&Date.now()-old.time<STALE_MS)return {...old.value,cacheStatus:'stale'};throw cooldownError();}
 const job=(async()=>{
  try{
   await takeRequestSlot();
   const url=new URL(TMD_URL);
   for(const [k,v] of Object.entries({lat:la,lon:lo,fields:FIELDS,duration}))url.searchParams.set(k,String(v));
   const response=await fetch(url,{headers:{Accept:'application/json',Authorization:`Bearer ${process.env.TMD_TOKEN}`},signal:AbortSignal.timeout(18000)});
   if(response.status===429){
    const seconds=Number(response.headers.get('retry-after'));
    const delay=Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,60*60*1000):15*60*1000;
    tmdBlockedUntil=Math.max(tmdBlockedUntil,Date.now()+delay);
    throw cooldownError();
   }
   if(!response.ok)throw Object.assign(new Error('TMD HTTP '+response.status),{status:502});
   const json=await response.json();
   const first=json.WeatherForecasts?.[0];
   if(!Array.isArray(first?.forecasts)||!first.forecasts.length)throw Object.assign(new Error('TMD returned no hourly forecasts'),{status:502});
   const value={location:first.location??{lat:la,lon:lo},forecasts:first.forecasts};
   cache.set(key,{time:Date.now(),value});
   // Avoid unbounded memory usage on a public server.
   if(cache.size>250){const oldest=cache.keys().next().value;cache.delete(oldest);}
   return {...value,cacheStatus:'fresh'};
  }catch(e){
   if(old&&Date.now()-old.time<STALE_MS)return {...old.value,cacheStatus:'stale'};
   throw e;
  }
 })();
 pending.set(key,job);
 try{return await job;}finally{pending.delete(key);}
}
app.get('/api/health',(req,res)=>res.json({ok:true,service:'Thai Flood Watch',status:'running',tmdConfigured:!!process.env.TMD_TOKEN,tmdCooldownSeconds:Math.max(0,Math.ceil((tmdBlockedUntil-Date.now())/1000)),time:new Date().toISOString()}));
app.get('/api/tmd/weather3hours',async(req,res)=>{
 const p=coords(req);if(!p)return res.status(400).json({ok:false,error:'Invalid coordinates'});
 try{const data=await tmdAt(p.lat,p.lon,24);res.json({ok:true,source:'Thailand Meteorological Department',location:p,cacheStatus:data.cacheStatus,stale:data.cacheStatus==='stale',data:{WeatherForecasts:[{location:data.location,forecasts:data.forecasts}]}});}
 catch(e){if(e.retryAfter)res.set('Retry-After',String(e.retryAfter));res.status(e.status||502).json({ok:false,error:e.message});}
});
// Limit the national map to a small, stable sample so it cannot exhaust TMD quota.
// The map is a sampled FORECAST, not live radar or an official flood warning.
app.get('/api/tmd/rain-map',async(req,res)=>{
 if(!process.env.TMD_TOKEN)return res.status(503).json({ok:false,error:'TMD_TOKEN is not configured'});
 if(mapCache&&Date.now()-mapCache.at<MAP_CACHE_MS)return res.json({...mapCache.value,stale:false});
 if(Date.now()<tmdBlockedUntil){if(mapCache)return res.json({...mapCache.value,stale:true});return res.status(503).json({ok:false,error:'TMD จำกัดจำนวนคำขอชั่วคราว กรุณาลองใหม่ภายหลัง'});}
 if(!mapPending){mapPending=(async()=>{
  const sample=POINTS.filter((_,i)=>i%4===0); // nine sites rather than 33 simultaneous calls
  const results=[];
  for(const p of sample){
   try{const data=await tmdAt(p.lat,p.lon,12);results.push({...p,forecasts:data.forecasts});}
   catch(e){results.push({...p,error:e.message});if(Date.now()<tmdBlockedUntil)break;}
  }
  const value={ok:true,source:'TMD hourly model forecast',kind:'sampled-forecast',notLiveRadar:true,cacheMinutes:120,points:results,successCount:results.filter(x=>x.forecasts).length,requestedCount:sample.length,generatedAt:new Date().toISOString()};
  if(value.successCount>0)mapCache={at:Date.now(),value};
  if(!value.successCount)throw Object.assign(new Error('ยังไม่มีข้อมูลพยากรณ์แผนที่ กรุณาลองใหม่ภายหลัง'),{status:503});
  return value;
 })().finally(()=>{mapPending=null;});}
 try{res.json(await mapPending);}catch(e){res.status(e.status||502).json({ok:false,error:e.message});}
});
// ThaiWater station feed. Keep the original upstream schema available as /api/water/stations/raw.
let waterCache=null;
async function getWaterRaw(){
 if(waterCache && Date.now()-waterCache.at<5*60*1000)return waterCache.payload;
 const response=await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error('ThaiWater HTTP '+response.status);
 const payload=await response.json();
 if(!Array.isArray(payload?.waterlevel_data?.data))throw new Error('ThaiWater station data format changed');
 waterCache={at:Date.now(),payload};return payload;
}
function finiteNumber(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeWater(row){
 const s=row.station||{},g=row.geocode||{};
 const lat=finiteNumber(s.tele_station_lat),lon=finiteNumber(s.tele_station_long);
 const level=finiteNumber(row.waterlevel_msl),previous=finiteNumber(row.waterlevel_msl_previous);
 return {
  id:String(s.id??row.id??''),code:String(s.tele_station_oldcode??''),
  name:s.tele_station_name?.th||s.tele_station_name?.en||'ไม่ระบุชื่อสถานี',
  province:g.province_name?.th||null,district:g.amphoe_name?.th||null,
  basin:row.basin?.basin_name?.th||null,river:row.river_name||null,
  lat,lon,levelMsl:level,previousMsl:previous,
  changeM:level!==null&&previous!==null?Math.round((level-previous)*1000)/1000:null,
  observedAt:row.waterlevel_datetime||null,
  situationCode:finiteNumber(row.situation_level),
  bankDifferenceM:finiteNumber(row.diff_wl_bank),
  bankDifferenceText:row.diff_wl_bank_text||null,
  dischargeCms:finiteNumber(row.discharge),agency:row.agency?.agency_shortname?.th||null
 };
}
app.get('/api/water/stations',async(req,res)=>{
 try{const raw=await getWaterRaw();const stations=raw.waterlevel_data.data.map(normalizeWater);
 res.json({ok:true,source:'ThaiWater public endpoint',kind:'observed-station-level',datum:'MSL',units:{level:'m',change:'m'},count:stations.length,fetchedAt:new Date(waterCache.at).toISOString(),stations});
 }catch(e){res.status(502).json({ok:false,error:e.message});}
});
app.get('/api/water/stations/raw',async(req,res)=>{try{res.json({ok:true,source:'ThaiWater public endpoint',raw:true,data:await getWaterRaw()});}catch(e){res.status(502).json({ok:false,error:e.message});}});
// Describes which integrations are actually configured; never presents missing feeds as live.
app.get('/api/modules/status',(req,res)=>res.json({ok:true,updatedAt:new Date().toISOString(),modules:{forecast:{available:!!process.env.TMD_TOKEN,source:'TMD forecast, not observed rainfall'},rainMap:{available:!!process.env.TMD_TOKEN,source:'TMD sampled forecast, not radar'},water:{available:true,source:'ThaiWater observed station water levels (MSL); situation codes not interpreted'},floodRisk:{available:false},tide:{available:false},radar:{available:false},waves:{available:false},cctv:{available:false},shelters:{available:false}}}));
app.get('/',(req,res)=>{const a=path.join(ROOT,'public','index.html'),b=path.join(ROOT,'index.html');const file=fs.existsSync(a)?a:fs.existsSync(b)?b:null;if(!file)return res.status(404).json({ok:false,error:'index.html not found'});res.sendFile(file);});
app.listen(PORT,'0.0.0.0',()=>console.log('Thai Flood Watch listening on '+PORT));
