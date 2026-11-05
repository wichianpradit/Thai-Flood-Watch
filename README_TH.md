# Thai Flood Reports Backend

นำไฟล์ server.js และ package.json ขึ้น Repository Thai-Flood-Reports-Backend ที่ root โดยตรง

Render Web Service: เลือก Repository ใหม่นี้, Runtime Node, Build Command `npm install`, Start Command `npm start`, Root Directory เว้นว่าง

Environment Variables (ตั้งบน Render เท่านั้น ห้ามอัปโหลดรหัสลง GitHub):
- DATABASE_URL: Internal Database URL จาก thai-flood-reports-db บน Render
- ADMIN_TOKEN: รหัสลับสุ่มยาวอย่างน้อย 24 ตัวอักษร
- ALLOWED_ORIGINS: https://thai-flood-watch.onrender.com,https://wichianpradit.github.io
- DATABASE_SSL: false (สำหรับ Internal Database URL ที่ไม่ใช้ SSL เท่านั้น; ถ้าฐานข้อมูลต้องใช้ SSL ให้ละเว้น)

ทดสอบหลัง Deploy: https://<ชื่อบริการ>.onrender.com/api/health ต้องตอบ JSON ok:true

หมายเหตุ: รายงานเริ่มต้น pending ไม่แสดงสาธารณะจนอนุมัติ; ภาพเก็บใน PostgreSQL; ฐานข้อมูล Render ฟรีอาจหมดอายุ ต้องสำรองข้อมูลก่อนหมดอายุ. การเชื่อมหน้าเว็บหลักต้องตั้ง config.js ให้ชี้ไปที่บริการใหม่นี้อีกขั้นตอน
