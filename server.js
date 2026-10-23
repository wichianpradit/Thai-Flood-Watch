import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const TMD_PAT=process.env.TMD_PAT||"";
const TMD_URL="https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at";
const DEF_LAT=Number(process.env.DEFAULT_LAT||6.8695);
const DEF_LON=Number(process.env.DEFAULT_LON||101.2505);
const DEF_NAME=process.env.DEFAULT_NAME||"Pattani Sea";

app.use(express.static(path.join(__dirname,"public")));
const n=(v)=>Number.isFinite(Number(v))?Number(v):null;
const qs=(v,d)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"--";
const degDir=(d)=>{if(d==null)return"--";const a=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return a[Math.round(Number(d)/22.5)%16]};

async function tmdFetch(lat,lon,duration=24){
  if(!TMD_PAT) throw new Error("TMD_PAT_NOT_SET");
  const fields="tc,rh,slp,rain,ws10m,wd10m,cloudlow,cloudmed,cloudhigh,cond";
  const url=`${TMD_URL}?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&duration=${duration}&fields=${fields}`;
  const r=await fetch(url,{headers:{accept:"application/json",authorization:`Bearer ${TMD_PAT}`}});
  if(!r.ok) throw new Error(`TMD_HTTP_${r.status}`);
  const j=await r.json();
  const forecasts=j?.WeatherForecasts?.[0]?.forecasts;
  if(!Array.isArray(forecasts)||!forecasts.length) throw new Error("TMD_NO_FORECAST");
  return forecasts.map(x=>({time:x.time,...x.data}));
}
async function marineFetch(lat,lon){
  const current="wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction";
  const daily="wave_height_max,wave_direction_dominant,wave_period_max";
  const hourly="sea_level_height_msl,ocean_current_velocity,ocean_current_direction";
  const url=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=${current}&daily=${daily}&hourly=${hourly}&velocity_unit=kn&timezone=Asia%2FBangkok&forecast_days=7`;
  const r=await fetch(url); if(!r.ok) throw new Error(`MARINE_HTTP_${r.status}`); return r.json();
}
function dayKey(t){return String(t||"").slice(0,10)}
function aggregateTmd(rows){
  const m=new Map();
  for(const x of rows){
    const k=dayKey(x.time); if(!k) continue;
    if(!m.has(k))m.set(k,{date:k,tMax:-999,tMin:999,rain:0,windMax:0,windDir:null,cond:null,count:0});
    const d=m.get(k),tc=n(x.tc),rain=n(x.rain),ws=n(x.ws10m),wd=n(x.wd10m);
    if(tc!=null){d.tMax=Math.max(d.tMax,tc);d.tMin=Math.min(d.tMin,tc)}
    if(rain!=null)d.rain+=rain;
    if(ws!=null && ws>=d.windMax){d.windMax=ws;d.windDir=wd}
    if(x.cond!=null)d.cond=x.cond; d.count++;
  }
  return [...m.values()].slice(0,7).map(d=>({...d,tMax:d.tMax===-999?null:d.tMax,tMin:d.tMin===999?null:d.tMin}));
}
app.get("/api/dashboard",async(req,res)=>{
  const lat=n(req.query.lat)??DEF_LAT, lon=n(req.query.lon)??DEF_LON, name=String(req.query.name||DEF_NAME);
  if(lat<-90||lat>90||lon<-180||lon>180)return res.status(400).json({error:"INVALID_COORDINATES"});
  let tmd=[],marine=null,errors=[];
  try{tmd=await tmdFetch(lat,lon,168)}catch(e){
    // Some TMD plans/endpoints may restrict duration. Keep the app usable with 24h.
    errors.push(e.message);
    try{tmd=await tmdFetch(lat,lon,24)}catch(e2){errors.push(e2.message)}
  }
  try{marine=await marineFetch(lat,lon)}catch(e){errors.push(e.message)}
  const cur=tmd[0]||{};
  const tmdDays=aggregateTmd(tmd);
  const md=marine?.daily||{};
  const seaDays=(md.time||[]).slice(0,7).map((date,i)=>({
    date,wave:n(md.wave_height_max?.[i]),waveDir:n(md.wave_direction_dominant?.[i]),period:n(md.wave_period_max?.[i])
  }));
  const byDate=new Map(tmdDays.map(x=>[x.date,x]));
  const days=[...new Set([...tmdDays.map(x=>x.date),...seaDays.map(x=>x.date)])].slice(0,7).map(date=>({
    date,...(byDate.get(date)||{}),...(seaDays.find(x=>x.date===date)||{})
  }));
  const mc=marine?.current||{};
  const mh=marine?.hourly||{};
  const tideHourly=(mh.time||[]).map((time,i)=>({
    time,level:n(mh.sea_level_height_msl?.[i]),
    current:n(mh.ocean_current_velocity?.[i]),
    direction:n(mh.ocean_current_direction?.[i])
  }));
  const tideDays=[...new Set(tideHourly.map(x=>x.time.slice(0,10)))];
  const tideEvents=[];
  for(let i=1;i<tideHourly.length-1;i++){
    const a=tideHourly[i-1],b=tideHourly[i],c=tideHourly[i+1];
    if(a.level==null||b.level==null||c.level==null)continue;
    if(b.level>=a.level&&b.level>c.level)tideEvents.push({time:b.time,type:"HIGH",level:b.level});
    if(b.level<=a.level&&b.level<c.level)tideEvents.push({time:b.time,type:"LOW",level:b.level});
  }
  res.set("Cache-Control","no-store");
  res.json({
    source:{weather:"TMD NWP",marine:"Open-Meteo Marine"},
    location:{name,lat,lon},updated:new Date().toISOString(),errors,
    weather:{
      valid:!!tmd.length,time:cur.time||null,temp:n(cur.tc),humidity:n(cur.rh),pressure:n(cur.slp),
      rain:n(cur.rain),wind:n(cur.ws10m),windKn:n(cur.ws10m)!=null?n(cur.ws10m)*1.94384:null,
      windDir:n(cur.wd10m),condition:cur.cond??null,cloudLow:n(cur.cloudlow),cloudMed:n(cur.cloudmed),cloudHigh:n(cur.cloudhigh)
    },
    sea:{
      valid:!!marine,time:mc.time||null,wave:n(mc.wave_height),waveDir:n(mc.wave_direction),period:n(mc.wave_period),
      temp:n(mc.sea_surface_temperature),current:n(mc.ocean_current_velocity),currentDir:n(mc.ocean_current_direction)
    },days,tide:{source:"Open-Meteo Marine model",days:tideDays,hourly:tideHourly,events:tideEvents}
  });
});
app.get("/api/health",(req,res)=>res.json({ok:true,tmdTokenConfigured:!!TMD_PAT}));
app.listen(PORT,()=>console.log(`Marine Weather Mobile: http://localhost:${PORT}`));
