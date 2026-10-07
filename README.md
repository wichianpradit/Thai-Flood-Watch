# Thai Flood Watch PRO UI

## Deploy ด้วย GitHub Pages
1. สร้าง Repository ใหม่ใน GitHub เช่น `thai-flood-watch`
2. อัปโหลด `index.html` ไว้ที่ root ของ Repository
3. เปิด Settings > Pages
4. ที่ Build and deployment เลือก `Deploy from a branch`
5. Branch เลือก `main` และ Folder เลือก `/ (root)`
6. กด Save แล้วรอ GitHub สร้าง URL ของเว็บไซต์

## หมายเหตุ
- เวอร์ชันนี้เป็น Frontend/UI พร้อมแผนที่ Leaflet
- Marker และข้อความแจ้งเตือนบางส่วนเป็นข้อมูลตัวอย่างเพื่อทดสอบ UI
- ยังไม่ได้เชื่อม API ฝน, ระดับน้ำ, น้ำทะเลหนุน หรือ CCTV จริง
- ต้องเชื่อมอินเทอร์เน็ตเพื่อโหลด Leaflet, Google Font และแผนที่พื้นหลัง
