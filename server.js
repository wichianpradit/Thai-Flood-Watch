"use strict";
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const {Pool}=require('pg');
const rateLimit=require('express-rate-limit');
const app=express();app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>{if(!origin||origins.includes(origin))return cb(null,true);cb(new Error('Origin not allowed'));}}));
app.use(express.json({limit:'7mb'}));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}});
const limiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false});
const MAX_IMAGE=4*1024*1024;
async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS flood_reports (
 id BIGSERIAL PRIMARY KEY, place VARCHAR(160) NOT NULL, lat DOUBLE PRECISION NOT NULL,
 lon DOUBLE PRECISION NOT NULL, taken TIMESTAMPTZ NOT NULL, kind VARCHAR(20) NOT NULL,
 detail TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', image_data BYTEA,
 image_type VARCHAR(32), status VARCHAR(16) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ
)`);await pool.query('CREATE INDEX IF NOT EXISTS flood_reports_status_idx ON flood_reports(status,created_at DESC)');}
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'flood-reports'});}catch{res.status(503).json({ok:false});}});
app.get('/api/flood-reports',async(req,res)=>{try{const q=await pool.query(`SELECT id,place,lat,lon,taken,kind,detail,url,created_at, image_data IS NOT NULL AS has_photo FROM flood_reports WHERE status='approved' ORDER BY created_at DESC LIMIT 250`);res.set('Cache-Control','no-store');res.json({reports:q.rows.map(r=>({...r,photo:r.has_photo?'/api/flood-reports/'+r.id+'/photo':null}))});}catch(e){console.error(e);res.status(503).json({error:'Database unavailable'});}});
app.get('/api/flood-reports/:id/photo',async(req,res)=>{try{if(!/^\d+$/.test(req.params.id))return res.sendStatus(400);const q=await pool.query("SELECT image_data,image_type FROM flood_reports WHERE id=$1 AND status='approved'",[req.params.id]);if(!q.rowCount||!q.rows[0].image_data)return res.sendStatus(404);res.set('Content-Type',q.rows[0].image_type);res.set('Cache-Control','public,max-age=300');res.send(q.rows[0].image_data);}catch(e){console.error(e);res.sendStatus(503);}});
app.post('/api/flood-reports',limiter,async(req,res)=>{try{
 const b=req.body||{};const place=String(b.place||'').trim().slice(0,160),lat=Number(b.lat),lon=Number(b.lon),taken=new Date(b.taken),detail=String(b.detail||'').trim().slice(0,3000),kind=String(b.kind||'photo'),url=String(b.url||'').trim();
 if(!place||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<5||lat>21||lon<97||lon>106||!Number.isFinite(taken.getTime())||!['photo','social','cctv'].includes(kind))return res.status(400).json({error:'ข้อมูลสถานที่ พิกัด หรือวันเวลาไม่ถูกต้อง'});
 if(url&&(!/^https:\/\//i.test(url)||url.length>2000))return res.status(400).json({error:'ลิงก์ต้องเป็น HTTPS'});
 let image=null,type=null;
 if(b.photo){const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.photo);if(!match)return res.status(400).json({error:'รองรับภาพ JPEG PNG WebP หลังบีบอัดเท่านั้น'});type=match[1];image=Buffer.from(match[2],'base64');if(image.length>MAX_IMAGE)return res.status(413).json({error:'ภาพหลังบีบอัดเกิน 4 MB'});}
 if(!image&&!url)return res.status(400).json({error:'กรุณาแนบภาพหรือลิงก์ที่มา'});
 const q=await pool.query('INSERT INTO flood_reports(place,lat,lon,taken,kind,detail,url,image_data,image_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[place,lat,lon,taken,kind,detail,url,image,type]);res.status(201).json({id:q.rows[0].id,status:'pending'});
 }catch(e){console.error(e);res.status(500).json({error:'ไม่สามารถบันทึกรายงานได้'});}});
function admin(req,res,next){const expected=process.env.ADMIN_TOKEN;if(!expected||expected.length<24||req.get('X-Admin-Token')!==expected)return res.sendStatus(403);next();}
app.get('/api/admin/flood-reports',admin,async(req,res)=>{try{const q=await pool.query("SELECT id,place,lat,lon,taken,kind,detail,url,status,created_at,image_data IS NOT NULL AS has_photo FROM flood_reports ORDER BY created_at DESC LIMIT 250");res.json({reports:q.rows});}catch{res.sendStatus(503);}});
app.get('/api/admin/flood-reports/:id/photo',admin,async(req,res)=>{try{const q=await pool.query('SELECT image_data,image_type FROM flood_reports WHERE id=$1',[req.params.id]);if(!q.rowCount||!q.rows[0].image_data)return res.sendStatus(404);res.type(q.rows[0].image_type).send(q.rows[0].image_data);}catch{res.sendStatus(503);}});
app.patch('/api/admin/flood-reports/:id',admin,async(req,res)=>{const status=req.body?.status;if(!['approved','rejected'].includes(status))return res.sendStatus(400);try{const q=await pool.query('UPDATE flood_reports SET status=$1,reviewed_at=now() WHERE id=$2 RETURNING id,status',[status,req.params.id]);if(!q.rowCount)return res.sendStatus(404);res.json(q.rows[0]);}catch{res.sendStatus(503);}});
init().then(()=>app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Flood reports ready'))).catch(e=>{console.error('Database setup failed',e);process.exit(1);});
