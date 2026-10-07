import express from "express";
import dotenv from "dotenv";
dotenv.config();

const app=express();
const PORT=process.env.PORT||3000;
app.use(express.static("public"));

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function pick(o,...keys){for(const k of keys) if(o?.[k]!==undefined) return o[k]; return null}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"Thai Flood Watch TMD Gateway"}));

app.get("/api/tmd/weather3hours",async(req,res)=>{
  const uid=process.env.TMD_UID, ukey=process.env.TMD_UKEY;
  if(!uid||!ukey||ukey==="PUT_YOUR_KEY_HERE") return res.status(503).json({ok:false,error:"TMD credentials not configured"});
  try{
    const q=new URLSearchParams({uid,ukey,format:"json"});
    if(req.query.province) q.set("Province",req.query.province);
    const url=`https://data.tmd.go.th/api/Weather3Hours/V2/?${q}`;
    const r=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!r.ok) throw new Error(`TMD HTTP ${r.status}`);
    const raw=await r.json();
    let stations=raw?.Stations?.Station ?? raw?.stations?.station ?? [];
    if(!Array.isArray(stations)) stations=[stations];
    const data=stations.map(s=>{
      const o=s.Observation??s.observation??{};
      return {
        wmo:pick(s,"WmoStationNumber","wmoStationNumber"),
        nameTh:pick(s,"StationNameThai","stationNameThai"),
        nameEn:pick(s,"StationNameEnglish","stationNameEnglish"),
        province:pick(s,"Province","province"),
        lat:num(pick(s,"Latitude","latitude")),
        lon:num(pick(s,"Longitude","longitude")),
        observedAt:pick(o,"DateTime","dateTime"),
        temperature:num(pick(o,"AirTemperature","airTemperature")),
        humidity:num(pick(o,"RelativeHumidity","relativeHumidity")),
        windDirection:pick(o,"WindDirection","windDirection"),
        windSpeed:num(pick(o,"WindSpeed","windSpeed")),
        rainfall:num(pick(o,"Rainfall","rainfall")),
        rainfall24h:num(pick(o,"Rainfall24Hr","rainfall24Hr")),
        pressure:num(pick(o,"MeanSeaLevelPressure","meanSeaLevelPressure")),
        visibility:num(pick(o,"LandVisibility","landVisibility"))
      };
    }).filter(x=>x.lat!==null&&x.lon!==null);
    res.json({ok:true,source:"Thai Meteorological Department - Weather3Hours V2",count:data.length,fetchedAt:new Date().toISOString(),stations:data});
  }catch(e){res.status(502).json({ok:false,error:e.message})}
});

app.listen(PORT,()=>console.log(`Thai Flood Watch: http://localhost:${PORT}`));
