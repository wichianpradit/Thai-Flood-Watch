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
// ThaiWater camera directory. Stream availability is verified by the browser player,
// not inferred from directory membership. No synthetic camera records are created.
let cameraCache={at:0,items:[]};
function flattenCameras(root){
 const found=[];const seen=new Set();
 function visit(x,depth){
  if(depth>9||!x||typeof x!=='object'||seen.has(x))return;
  seen.add(x);
  if(Array.isArray(x)){for(const v of x)visit(v,depth+1);return;}
  const keys=Object.keys(x);
  const isCamera=keys.some(k=>/cctv|camera|cam_name|stream|video|image_url|snapshot/i.test(k));
  if(isCamera)found.push(x);
  for(const [k,v] of Object.entries(x))if(v&&typeof v==='object')visit(v,depth+1);
 }
 visit(root,0);return found;
}
function field(x,keys){for(const k of keys){const v=x[k];if(typeof v==='string'&&v.trim())return v.trim();if(typeof v==='number')return String(v);if(v&&typeof v==='object'&&typeof v.th==='string')return v.th;}return '';}
function safeCameraURL(v){try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}}
// Classification is inferred from source metadata, not a verified site survey.
function cameraCategory(name,metadata=''){
 const t=(name+' '+metadata).toLowerCase();
 if(/เขื่อน|อ่างเก็บน้ำ|dam|reservoir/.test(t))return 'dam';
 if(/ทางหลวง|ถนน|ทางแยก|สี่แยก|สะพาน|ทางลอด|highway|road|bridge|traffic/.test(t))return 'road';
 if(/แม่น้ำ|คลอง|ลำน้ำ|ตลิ่ง|river|canal|waterway/.test(t))return 'river';
 if(/ชุมชน|ตลาด|เทศบาล|เมือง|หมู่บ้าน|community|market/.test(t))return 'community';
 return 'other';
}
function normalizeCamera(c,i){
 const name=field(c,['cctv_name','camera_name','cam_name','station_name','name','title','cctv_station_name'])||field(c.station||{},['name','tele_station_name'])||'กล้อง '+(i+1);
 const province=field(c.geocode||{},['province_name'])||field(c,['province_name','province']);
 const stream=safeCameraURL(field(c,['stream_url','stream','hls_url','hls','video_url','video','url_stream','rtsp_url','cctv_url']));
 const snapshot=safeCameraURL(field(c,['image_url','snapshot_url','snapshot','image','picture_url','img_url','url_image']));
 const page=safeCameraURL(field(c,['page_url','website','web_url','link','url']));
 const lat=Number(field(c,['latitude','lat','cctv_lat','camera_lat'])||field(c.station||{},['tele_station_lat','lat']));
 const lon=Number(field(c,['longitude','lon','lng','cctv_long','camera_long'])||field(c.station||{},['tele_station_long','lon']));
 const category=cameraCategory(name,field(c,['description','location_name','address','type']));
 return {category,provider:'ThaiWater',id:String(field(c,['cctv_id','camera_id','id','code'])||i),name,province,stream,snapshot,page,lat:Number.isFinite(lat)&&lat>=-90&&lat<=90?lat:null,lon:Number.isFinite(lon)&&lon>=-180&&lon<=180?lon:null};
}
// Additional authorized public feeds can be added without changing code.
// Set CCTV_EXTRA_FEEDS_JSON to a JSON array of records with name, province,
// stream/snapshot/page and optional category/provider. Only HTTPS links are accepted.
function configuredExtraCameras(){
 let rows=[];
 try{rows=JSON.parse(process.env.CCTV_EXTRA_FEEDS_JSON||'[]');}catch{return [];}
 if(!Array.isArray(rows))return [];
 return rows.slice(0,2000).flatMap((r,i)=>{
  if(!r||typeof r!=='object'||!r.name||!r.province)return [];
  const stream=safeCameraURL(r.stream),snapshot=safeCameraURL(r.snapshot),page=safeCameraURL(r.page);
  if(!stream&&!snapshot&&!page)return [];
  const name=String(r.name).slice(0,180),province=String(r.province).slice(0,80);
  const allowed=['dam','road','river','community','other'];
  return [{id:'extra-'+i,name,province,stream,snapshot,page,
   category:allowed.includes(r.category)?r.category:cameraCategory(name),
   provider:String(r.provider||'หน่วยงานเจ้าของกล้อง').slice(0,100),
   lat:Number.isFinite(Number(r.lat))?Number(r.lat):null,
   lon:Number.isFinite(Number(r.lon))?Number(r.lon):null}];
 });
}
function mergedCameras(base){
 const all=[...base,...configuredExtraCameras()],seen=new Set();
 return all.filter(c=>{const key=[c.provider,c.name,c.province,c.stream||c.snapshot||c.page].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
app.get('/api/cctv/sources',(req,res)=>res.json({ok:true,sources:[
 {name:'ThaiWater',type:'integrated',note:'รายชื่อกล้องจาก API; ไม่รับรองสตรีมออนไลน์'},
 {name:'กรมทางหลวง',type:'directory',url:'https://www.highwaytraffic.go.th/',note:'ตรวจสอบสตรีมและสิทธิ์การฝังภาพก่อนเพิ่ม'},
 {name:'สำนักการระบายน้ำ กรุงเทพมหานคร',type:'directory',url:'https://floodbangkok.bangkok.go.th/',note:'ตรวจสอบสตรีมและสิทธิ์การฝังภาพก่อนเพิ่ม'}
 ]}));
app.get('/api/cctv/cameras',async(req,res)=>{
 try{
  if(Date.now()-cameraCache.at<10*60*1000&&cameraCache.at)return res.json({ok:true,source:'ThaiWater camera directory',fetchedAt:new Date(cameraCache.at).toISOString(),cameras:mergedCameras(cameraCache.items),streamVerified:false});
  const r=await fetch('https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/cctv',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(14000)});
  if(!r.ok)throw new Error('ThaiWater CCTV HTTP '+r.status);
  const data=await r.json();const rows=flattenCameras(data);
  const items=rows.map(normalizeCamera).filter(c=>c.stream||c.snapshot||c.page);
  cameraCache={at:Date.now(),items};
  res.json({ok:true,source:'ThaiWater camera directory',fetchedAt:new Date(cameraCache.at).toISOString(),cameras:mergedCameras(items),streamVerified:false,directoryCount:rows.length});
 }catch(e){res.status(502).json({ok:false,error:'ไม่สามารถเชื่อมรายการกล้อง ThaiWater: '+e.message});}
});
app.get('/api/modules/status',(req,res)=>res.json({ok:true,updatedAt:new Date().toISOString(),modules:{forecast:{available:!!process.env.TMD_TOKEN,source:'TMD forecast, not observed rainfall'},rainMap:{available:!!process.env.TMD_TOKEN,source:'TMD sampled forecast, not radar'},water:{available:true,source:'ThaiWater observed station water levels (MSL); situation codes not interpreted'},floodRisk:{available:false},tide:{available:false},radar:{available:false},waves:{available:false},cctv:{available:false},shelters:{available:false}}}));
app.get('/',(req,res)=>{const a=path.join(ROOT,'public','index.html'),b=path.join(ROOT,'index.html');const file=fs.existsSync(a)?a:fs.existsSync(b)?b:null;if(!file)return res.status(404).json({ok:false,error:'index.html not found'});res.sendFile(file);});
app.listen(PORT,'0.0.0.0',()=>console.log('Thai Flood Watch listening on '+PORT));

app.get('/cctv.html',(req,res)=>{const a=path.join(ROOT,'public','cctv.html'),b=path.join(ROOT,'cctv.html');const f=fs.existsSync(a)?a:fs.existsSync(b)?b:null;if(!f)return res.status(404).send('CCTV page not found');res.sendFile(f);});
