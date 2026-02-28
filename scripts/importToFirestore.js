/**
 * สคริปต์สำหรับ Import ข้อมูลจาก JSON เข้าสู่ Firebase Firestore
 * 
 * วิธีใช้งาน:
 * 1. ไปที่ Firebase Console > Project Settings > Service Accounts
 * 2. กด "Generate new private key" และดาวน์โหลดไฟล์ .json มาไว้ที่เดียวกับสคริปต์นี้
 * 3. เปลี่ยนชื่อไฟล์เป็น `serviceAccountKey.json`
 * 4. เตรียมไฟล์ข้อมูลของคุณในรูปแบบ JSON (เช่น `data.json`)
 * 5. รันคำสั่ง: node importToFirestore.js
 */

const admin = require('firebase-admin');
const fs = require('fs');

// 1. ตั้งค่า Service Account (ต้องดาวน์โหลดจาก Firebase Console)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * ฟังก์ชันสำหรับ Import ข้อมูล
 * @param {string} collectionName - ชื่อ Collection ใน Firestore (เช่น 'members' หรือ 'usage_logs')
 * @param {string} jsonFilePath - พาธของไฟล์ JSON
 * @param {string} idField - (ไม่บังคับ) ฟิลด์ที่จะใช้เป็น Document ID ถ้าไม่ระบุ Firebase จะสร้าง ID ให้เอง
 */
async function importData(collectionName, jsonFilePath, idField = null) {
  try {
    const rawData = fs.readFileSync(jsonFilePath);
    const data = JSON.parse(rawData);

    if (!Array.isArray(data)) {
      throw new Error('ข้อมูลใน JSON ต้องเป็น Array ของ Object');
    }

    console.log(`กำลังเริ่ม Import ข้อมูลจำนวน ${data.length} รายการ เข้าสู่ Collection: ${collectionName}...`);

    const batchSize = 500; // Firestore จำกัด Batch ละ 500 รายการ
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = db.batch();
      const chunk = data.slice(i, i + batchSize);

      chunk.forEach((item) => {
        let docRef = db.collection(collectionName).doc();
        
        // แปลงข้อมูลให้ตรงกับที่ App ใช้งาน
        const mappedData = {
          identifier: String(item.identifier || item['หมายเลขสมาชิก'] || '').trim(),
          memberName: item.memberName || item['ชื่อ-นามสกุลสมาชิก'] || 'ไม่ระบุชื่อ',
          couponCode: item.couponCode || item['รหัสคูปอง'] || '',
          couponName: item.couponName || item['ชื่อคูปอง'] || '',
          couponDescription: item.couponDescription || item['รายละเอียดคูปอง'] || '',
          branchName: item.branchName || item['สาขาที่ใช้'] || 'ไม่ระบุสาขา',
          status: item.status || 'Used',
          createdAt: item.createdAt || item['วัน/เวลากดใช้คูปอง'] || new Date().toISOString(),
          importedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.set(docRef, mappedData);
      });

      await batch.commit();
      console.log(`สำเร็จ: ${Math.min(i + batchSize, data.length)} / ${data.length}`);
    }

    console.log('--- Import ข้อมูลเสร็จสมบูรณ์ ---');
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error);
  }
}

// --- ตัวอย่างการเรียกใช้งาน ---

// กรณีที่ 1: Import ข้อมูลสมาชิก (ใช้เบอร์โทรเป็น ID เพื่อป้องกันข้อมูลซ้ำ)
// importData('members', 'members_data.json', 'phone');

// กรณีที่ 2: Import ประวัติการใช้งาน (ให้สร้าง ID อัตโนมัติ)
// importData('usage_logs', 'history_data.json');

// ปลดคอมเมนต์บรรทัดด้านล่างเพื่อใช้งานจริง
// const collection = 'members'; // เปลี่ยนชื่อ Collection ที่ต้องการ
// const filePath = 'data.json';  // เปลี่ยนชื่อไฟล์ JSON ของคุณ
// const idKey = 'phone';         // เปลี่ยนเป็นฟิลด์ที่ต้องการใช้เป็น ID (หรือใส่ null)
// importData(collection, filePath, idKey);
