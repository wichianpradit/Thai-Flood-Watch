# Thai Flood Watch V24.3 – Flood Photo Live Map

## สิ่งที่เพิ่ม
- รายงานภาพน้ำท่วมถูกส่งไปฐานข้อมูล PostgreSQL ส่วนกลางแทน localStorage
- ภาพและข้อมูลที่ **อนุมัติแล้ว** จะแสดงบนแผนที่หลักและแผนที่ Flood Eye ทั้งมือถือและคอมพิวเตอร์
- แตะหมุดกล้องเพื่อดูภาพ สถานที่ เวลา และรายละเอียด
- ภาพต้นฉบับ 30 MB ยังถูกบีบอัดในเบราว์เซอร์ก่อนส่ง โดยข้อมูลภาพหลังบีบอัดต้องไม่เกิน 4 MB

## ติดตั้ง (ต้องทำก่อนใช้งานจริง)
1. สร้าง PostgreSQL แบบ persistent ใน Render และคัดลอก Internal Database URL เป็น `DATABASE_URL` ของบริการ Node
2. สร้าง Render Web Service ใหม่จากโฟลเดอร์ `backend-flood-reports` ใช้ `npm install` และ `npm start`
3. ตั้งค่า `ALLOWED_ORIGINS` เป็นโดเมนเว็บไซต์หลักแบบเต็ม เช่น `https://wichianpradit.github.io` (คั่นหลายโดเมนด้วย comma) และ `ADMIN_TOKEN` เป็นสตริงลับยาวอย่างน้อย 24 ตัวอักษร
4. ทดสอบ `https://<render-service>/api/health` ต้องได้ `ok:true`
5. แก้ `config.js` ให้ `window.TFW_FLOOD_API_URL = 'https://<render-service>';` แล้วเผยแพร่ไฟล์เว็บไซต์ทั้งหมด
6. **อย่าแทนที่ Backend พยากรณ์อากาศเดิม**: Flood Reports เป็นบริการแยก เพื่อไม่ทำให้ API ฝน/น้ำ/เรดาร์เดิมเสีย

## อนุมัติรายงาน
- ดูรายการ: GET `/api/admin/flood-reports` พร้อม HTTP header `X-Admin-Token: <ADMIN_TOKEN>`
- ดูภาพที่รอตรวจ: GET `/api/admin/flood-reports/<id>/photo` พร้อม header เดียวกัน
- อนุมัติ: PATCH `/api/admin/flood-reports/<id>` พร้อม header เดียวกัน และ JSON `{ "status": "approved" }`
- ปฏิเสธ: PATCH เช่นเดียวกันด้วย `{ "status": "rejected" }`
- สามารถใช้ Postman/Insomnia เพื่อจัดการได้; เวอร์ชันนี้ยังไม่มีหน้าแอดมินแบบล็อกอิน

## ข้อจำกัดและความปลอดภัย
- ต้องตั้งค่า Render + PostgreSQL จริง จึงจะใช้การแชร์ข้อมูลข้ามเครื่องได้
- รายงานจะไม่แสดงสาธารณะจนกว่าแอดมินอนุมัติ
- พิกัด GPS ที่เผยแพร่เป็นข้อมูลสาธารณะ ควรแจ้งผู้ส่งและตรวจสอบก่อนอนุมัติ
- ภาพเก็บเป็น BYTEA ใน PostgreSQL เหมาะกับการเริ่มต้น; หากมีผู้ใช้จำนวนมากควรเปลี่ยนไปใช้ Object Storage
- ยังไม่มีการย้ายข้อมูลเก่าจาก localStorage อัตโนมัติ และยังไม่ได้ทดสอบกับ Render จริง
