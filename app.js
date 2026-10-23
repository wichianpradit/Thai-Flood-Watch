let DATA=null,tab="wx";
const $=id=>document.getElementById(id);
const val=(x,u="",d=1)=>x==null?"--":Number(x).toFixed(d)+u;
const dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const dir=x=>x==null?"--":Math.round(x)+"° "+dirs[Math.round(x/22.5)%16];
const day=s=>{if(!s)return"--";return new Intl.DateTimeFormat("en",{weekday:"short"}).format(new Date(s+"T12:00:00"))};
const card=(l,v,c="")=>`<div class="card"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`;
function params(){return `lat=${encodeURIComponent($("lat").value)}&lon=${encodeURIComponent($("lon").value)}&name=${encodeURIComponent($("name").value)}`}
async function load(){
 $("live").textContent="UPDATING...";
 try{
  const r=await fetch("/api/dashboard?"+params(),{cache:"no-store"}); DATA=await r.json();
  if(!r.ok)throw new Error(DATA.error||"API error"); render(); $("live").textContent="LIVE";
 }catch(e){$("live").textContent="OFFLINE";console.error(e)}
}
function render(){
 const w=DATA.weather,s=DATA.sea;$("place").textContent=DATA.location.name;$("coords").textContent=`${DATA.location.lat.toFixed(4)}, ${DATA.location.lon.toFixed(4)}`;
 $("temp").textContent=val(w.temp,"°C");$("cond").textContent=w.time?`TMD • ${w.time}`:"TMD • no data";$("wave").textContent=val(s.wave," m");$("wdir").textContent=dir(s.waveDir);
 $("cards").innerHTML=card("RAIN",val(w.rain," mm"),"cyan")+card("HUMIDITY",val(w.humidity,"%",0))+card("PRESSURE",val(w.pressure," hPa"))+card("WIND",val(w.windKn," kt"))+card("WIND DIR",dir(w.windDir))+card("CLOUD",val(Math.max(w.cloudLow||0,w.cloudMed||0,w.cloudHigh||0),"%",0));
 $("seaCards").innerHTML=card("WAVE PERIOD",val(s.period," s"))+card("CURRENT",val(s.current," kt"))+card("SEA TEMP",val(s.temp,"°C"));
 $("weatherCards").innerHTML=$("cards").innerHTML;
 $("seaFull").innerHTML=card("WAVE HEIGHT",val(s.wave," m"),"cyan")+card("WAVE PERIOD",val(s.period," s"))+card("WAVE DIR • FROM",dir(s.waveDir))+card("CURRENT",val(s.current," kt"))+card("CURRENT DIR • TO",dir(s.currentDir))+card("SEA TEMP",val(s.temp,"°C"));
 renderDays();renderTide();renderSide();
}
function renderDays(){
 const rows=DATA?.days||[];$("dayList").innerHTML=rows.length?rows.map(x=>tab==="wx"
 ?`<div class="day"><b>${day(x.date)}</b><span>🌧 ${val(x.rain," mm")}</span><span>${val(x.tMax,"°",0)}/${val(x.tMin,"°",0)}</span><span>💨 ${x.windMax==null?"--":val(x.windMax*1.94384," kt",0)} ${dir(x.windDir)}</span></div>`
 :`<div class="day"><b>${day(x.date)}</b><span class="cyan">🌊 ${val(x.wave," m")}</span><span>${val(x.period," s")}</span><span>${dir(x.waveDir)}</span></div>`).join(""):`<div class="notice">ยังไม่มีข้อมูล 7 วันจาก TMD/Marine</div>`;
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.remove("on"));b.classList.add("on");document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(b.dataset.page).classList.add("active")});
document.querySelectorAll(".switch button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".switch button").forEach(x=>x.classList.remove("on"));b.classList.add("on");tab=b.dataset.tab;renderDays()});
$("reload").onclick=load;$("save").onclick=()=>{localStorage.setItem("mwloc",JSON.stringify({name:$("name").value,lat:$("lat").value,lon:$("lon").value}));load()};
try{const x=JSON.parse(localStorage.getItem("mwloc"));if(x){$("name").value=x.name;$("lat").value=x.lat;$("lon").value=x.lon}}catch{}
load();setInterval(load,10*60*1000);
if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js");


const strength=(x)=>x==null?{color:"#718293",name:"ไม่มีข้อมูล"}:x<0.5?{color:"#31e981",name:"เบา"}:x<1?{color:"#ffc247",name:"ปานกลาง"}:x<2?{color:"#ff9331",name:"แรง"}:{color:"#ff4d5a",name:"แรงมาก"};
function renderTide(){
 const t=DATA?.tide||{},dates=t.days||[],sel=$("tideDate");
 const prev=sel.value;sel.innerHTML=dates.map(d=>`<option value="${d}">${d}</option>`).join("");
 if(dates.includes(prev))sel.value=prev;
 drawTide();
}
function drawTide(){
 const t=DATA?.tide||{},date=$("tideDate").value;
 const rows=(t.hourly||[]).filter(x=>x.time.startsWith(date)).slice(0,24);
 const svg=$("tideChart");
 if(!rows.length||rows.every(x=>x.level==null)){svg.innerHTML='<text x="20" y="120" fill="#b8d3e2">ยังไม่มีข้อมูลระดับน้ำสำหรับวันนี้</text>';$("tideEvents").innerHTML="--";return}
 const levels=rows.map(x=>x.level).filter(x=>x!=null),min=Math.min(...levels),max=Math.max(...levels),range=Math.max(.1,max-min);
 const X=i=>34+i*612/Math.max(1,rows.length-1),Y=v=>200-(v-min)/range*155;
 let markup='';
 for(let k=0;k<4;k++){const y=45+k*52;markup+=`<line x1="34" x2="650" y1="${y}" y2="${y}" stroke="#16445e"/><text x="3" y="${y+4}" fill="#88a9bd" font-size="11">${(max-k*range/3).toFixed(1)}</text>`}
 rows.forEach((r,i)=>{const st=strength(r.current);markup+=`<rect x="${X(i)-8}" y="214" width="16" height="18" rx="3" fill="${st.color}" data-i="${i}" style="cursor:pointer"/>`;if(i%3===0)markup+=`<text x="${X(i)}" y="251" fill="#88a9bd" text-anchor="middle" font-size="11">${r.time.slice(11,13)}</text>`});
 let d='';rows.forEach((r,i)=>{if(r.level!=null)d+=(d?' L':'M')+X(i)+' '+Y(r.level)});
 markup+=`<path d="${d}" stroke="#00b8ff" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
 rows.forEach((r,i)=>{if(r.level!=null)markup+=`<circle cx="${X(i)}" cy="${Y(r.level)}" r="8" fill="transparent" stroke="transparent" stroke-width="10" data-i="${i}" style="cursor:pointer"/>`});
 svg.innerHTML=markup;
 svg.querySelectorAll('[data-i]').forEach(el=>el.addEventListener('click',()=>selectTide(rows[Number(el.dataset.i)])));
 selectTide(rows[Math.min(9,rows.length-1)]);
 const ev=(t.events||[]).filter(x=>x.time.startsWith(date));
 $("tideEvents").innerHTML=ev.length?ev.map(e=>`<div class="event"><strong>${e.type==="HIGH"?"▲ HIGH":"▼ LOW"} ${e.time.slice(11,16)}</strong><span>${val(e.level," m")}</span></div>`).join(""):'<div class="notice">ไม่มีจุดกลับตัวที่ตรวจพบจากข้อมูลรายชั่วโมง</div>';
}
function selectTide(r){
 const st=strength(r.current);
 $("tideSelected").innerHTML=`<strong>${r.time.slice(11,16)} น.</strong> · ระดับน้ำ ${val(r.level," m")} (MSL)<br>กระแสน้ำ <b style="color:${st.color}">${val(r.current," kt")} · ${st.name}</b> · ทิศทาง ${dir(r.direction)}<br><small>สีเป็นเกณฑ์เพื่อแสดงผล ปรับใช้กับพื้นที่จริงด้วยความระมัดระวัง</small>`;
}
$("tideDate").addEventListener("change",drawTide);

// V3: inline sidebar summary, never modal/popup. Mobile: flows below main cards.
function renderSide(){
 if(!DATA)return;
 const w=DATA.weather||{},s=DATA.sea||{};
 $("sideWave").textContent=val(s.wave," m");
 $("sideWind").textContent=val(w.windKn," kt",0);
 $("sideCurrent").textContent=val(s.current," kt");
 const t=DATA.tide||{},today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});
 const rows=(t.hourly||[]).filter(x=>x.time.startsWith(today)).slice(0,24);
 const svg=$("sideTide");
 const ok=rows.filter(x=>x.level!=null);
 if(ok.length<2){svg.innerHTML='<text x="15" y="66" fill="#88a9bd" font-size="13">ยังไม่มีข้อมูลกราฟวันนี้</text>';$("sideTideNote").textContent="กราฟจะแสดงเมื่อ Marine API มีข้อมูลระดับน้ำ";return;}
 const min=Math.min(...ok.map(x=>x.level)),max=Math.max(...ok.map(x=>x.level)),span=Math.max(.05,max-min);
 const X=i=>18+i*282/Math.max(1,rows.length-1),Y=v=>91-(v-min)/span*68;
 let d="",dots="";
 rows.forEach((r,i)=>{if(r.level==null){d="";return}const x=X(i),y=Y(r.level);d+=(d?' L':'M')+x.toFixed(1)+' '+y.toFixed(1);
 if(r.current!=null){const col=strength(r.current).color;dots+=`<rect x="${(x-3).toFixed(1)}" y="100" width="6" height="8" rx="2" fill="${col}"/>`}});
 svg.innerHTML=`<line x1="18" y1="91" x2="304" y2="91" stroke="#31536a"/><path d="${d}" fill="none" stroke="#00b8ff" stroke-width="3" stroke-linejoin="round"/>${dots}<text x="18" y="118" fill="#88a9bd" font-size="10">00</text><text x="288" y="118" fill="#88a9bd" font-size="10">23</text>`;
 $("sideTideNote").textContent=`ระดับน้ำ ${min.toFixed(2)}–${max.toFixed(2)} m (MSL) • สีแท่งด้านล่าง = ความแรงกระแสน้ำ`;
}
$("openTide").onclick=()=>{const b=document.querySelector('nav button[data-page="tide"]');if(b)b.click()};
