# Thai Flood Watch V14 – Nationwide CCTV Provider Registry

**ใช้งานจริง:** เก็บฟังก์ชัน V13 ทั้งหมด, แสดงรายชื่อแหล่ง CCTV 8 แหล่ง (ThaiWater เดิม + 7 แหล่งเพิ่มเติม), แสดงสถานะเชื่อม API / รอ URL หรือสิทธิ์ และกรองกล้องจริงตามจังหวัด ประเภท และหน่วยงานได้เหมือนเดิม

**ยังไม่เชื่อมภาพจากทั้ง 7 แหล่งโดยอัตโนมัติ** เนื่องจากยังไม่มี API/สิทธิ์ฝังภาพที่ตรวจสอบได้ การเพิ่มแหล่งชื่อไม่ได้แปลว่าได้ภาพสด; ไม่มีการแอบดึงสตรีมหรือทำกล้องปลอม

## เพิ่มกล้องจากหน่วยงานที่อนุญาตบน Render
Environment > Add Environment Variable > `CCTV_EXTRA_FEEDS_JSON`
ตัวอย่าง (URL ต้องเปลี่ยนเป็นลิงก์ HTTPS จริงที่หน่วยงานอนุญาต):
```json
[{"name":"ชื่อจุดติดตั้งจริง","province":"ปัตตานี","provider":"กรมทรัพยากรน้ำ (DWR)","category":"river","lat":6.87,"lon":101.25,"snapshot":"https://YOUR-AUTHORIZED-CAMERA-IMAGE-URL","page":"https://YOUR-AUTHORIZED-SOURCE-PAGE"}]
```
ไม่ใช้ URL ตัวอย่างนี้ในการใช้งานจริง กรณีเป็น HLS `.m3u8` ใช้ field `stream`; เบราว์เซอร์บางตัวไม่รองรับ HLS โดยตรง ส่วน RTSP/HTTP ไม่รองรับโดยตรง

ไฟล์ ZIP นี้รวม frontend, backend, package.json และไฟล์เดิมครบ อัปโหลดแทนที่โปรเจกต์เดิมโดยสำรองก่อน **อย่าอัปโหลดไฟล์ .env จริง**
ตรวจสอบด้วย `node --check server.js` และ JavaScript ใน HTML; ยังไม่ได้ยืนยันการเชื่อม API สดบน Render
