Thai Flood Watch V3
1) สำรองไฟล์ index.html และ server.js เดิม
2) อัปโหลด index.html และ server.js นี้ไว้ที่ root ของ GitHub repo
3) ตรวจสอบ Render Environment ว่า TMD_TOKEN ยังอยู่ (ไม่ต้องเปิดเผยค่า)
4) Commit แล้วรอ Deploy Live
5) ทดสอบ /api/health และ /api/tmd/weather3hours
6) ทดสอบ /api/water/stations (หากต้นทางไม่ตอบสนอง UI จะระบุข้อผิดพลาด)

ข้อจำกัด: เรดาร์สดเปิดเว็บ TMD ภายนอก; น้ำทะเลหนุน CCTV จุดช่วยเหลือ และคำเตือนภัยยังไม่เชื่อมข้อมูลจริง ห้ามใช้ตัวอย่างเป็นคำเตือนภัยจริง
