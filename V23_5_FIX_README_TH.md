# Thai Flood Watch V23.5 – Flood Eye Script Fix

แก้ปัญหา HTML ภายใน JavaScript มี `</script>` ซึ่งทำให้เบราว์เซอร์ปิดสคริปต์ก่อนกำหนด

- ฝัง Flood Eye เป็นข้อมูล Base64 แล้วถอดรหัสในเบราว์เซอร์เมื่อเปิดปุ่ม
- ปุ่มไม่เรียก `/flood-eye.html`
- คงการเรียก API ของหน้าเว็บหลักเดิมทั้งหมด

ติดตั้ง: นำ index.html จาก ZIP ไปแทน index.html บนโฮสต์ที่เปิดเว็บไซต์หลักจริง และล้างแคชด้วย Ctrl+Shift+R
หมายเหตุ: การแก้นี้ไม่ใช่การแก้ API ที่ส่ง HTML แทน JSON
