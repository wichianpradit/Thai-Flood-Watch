# Thai Flood Watch – Flood Monitoring V1

เพิ่ม API `/api/flood/monitor` และปรับเมนูพื้นที่เสี่ยงน้ำท่วมให้แสดงรายการสถานีที่ระดับน้ำเพิ่มขึ้นจาก ThaiWater พร้อมค้นหาจังหวัด/แม่น้ำ/สถานีและเลื่อนแผนที่ไปยังสถานี

**ข้อจำกัด:** เป็นการติดตามแนวโน้มระดับน้ำ ไม่ใช่คำเตือนภัยน้ำท่วมหรือการยืนยันพื้นที่ปลอดภัย ระดับน้ำ MSL ไม่ใช่ระดับน้ำล้นตลิ่ง ข้อมูลมีเพียงค่าปัจจุบันกับค่าก่อนหน้าจากต้นทาง จึงยังไม่สร้างกราฟย้อนหลังแบบปลอม

## การติดตั้ง

1. สำรอง GitHub repository เดิมก่อน
2. แตก ZIP แล้วอัปโหลดไฟล์ภายในโฟลเดอร์ไปที่ root ของ repository เดิม
3. Render: Root Directory เว้นว่าง, Build `npm install`, Start `npm start`
4. Environment Variable `TMD_TOKEN` ต้องคงค่าจริงเดิมบน Render (ไม่ใส่ใน GitHub)
5. ตรวจ `/api/health`, `/api/water/stations`, `/api/flood/monitor`

**หมายเหตุ:** ZIP นี้ตัด `.env` ที่อาจมีความลับออก ไม่เปลี่ยนค่า environment บน Render; `render.yaml` ปรับให้ตรงชื่อโปรเจกต์และ TMD_TOKEN แต่ไม่บังคับสร้างบริการใหม่
