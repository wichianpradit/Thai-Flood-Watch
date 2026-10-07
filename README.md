# Thai Flood Watch PRO UI + TMD Live

เวอร์ชันนี้ใช้หน้า PRO UI แบบละเอียดที่เลือกไว้ และเชื่อม Backend TMD Weather3Hours V2

## เริ่มใช้งาน
1. ติดตั้ง Node.js 18+
2. เปิด Terminal ในโฟลเดอร์
3. npm install
4. copy `.env.example` เป็น `.env`
5. ใส่ TMD UID/UKEY ของคุณใน `.env`
6. npm start
7. เปิด http://localhost:3000

## ความปลอดภัย
อย่าใส่ key ใน public/index.html และอย่า upload `.env` ขึ้น GitHub

## ข้อมูลจริงใน V1
- สถานี TMD บนแผนที่
- ฝนรอบตรวจ
- ฝนสะสม 24 ชม.
- อุณหภูมิ
- ความชื้น
- ความเร็วลม
- เวลา Observation
- สรุปจำนวนสถานี / สถานีมีฝน / สถานีฝนหนัก

ThaiWater, CCTV, radar imagery และ flood polygons ยังเป็นช่องเตรียมไว้สำหรับ API จริงในขั้นต่อไป
