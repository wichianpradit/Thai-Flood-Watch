# Thai Flood Watch V24.5 — Upload Error Fix

แก้ JavaScript `Can't find variable: LIVE_API` ในหน้า Flood Eye ทั้งแบบฝังใน index.html และหน้า flood-eye.html แยกต่างหาก

**สำคัญ:** ไฟล์ config.js ในชุดนี้ยังไม่ได้ระบุ URL ของ Flood Reports Backend (`window.TFW_FLOOD_API_URL = '';`) ดังนั้นการแก้ JavaScript เพียงอย่างเดียวยังไม่ทำให้ส่งภาพเข้าระบบกลางได้ ต้อง Deploy backend-flood-reports และฐานข้อมูลก่อน แล้วตั้ง URL ใน config.js ให้ตรงกับบริการจริง

วิธีติดตั้ง: อัปโหลดไฟล์เว็บทั้งหมด รวมถึง config.js และไฟล์ Backend หากยังไม่ติดตั้ง จากนั้นรีโหลดหน้าเว็บใหม่

ข้อมูลภาพที่บันทึกไว้ในเครื่องก่อนหน้านี้ไม่ถือว่าส่งเข้าระบบกลางสำเร็จ และจะไม่ปรากฏข้ามอุปกรณ์จนกว่าจะส่งเข้าระบบกลางสำเร็จและได้รับอนุมัติ
