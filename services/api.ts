
import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  setDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  orderBy,
  addDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { UserData, ValidationResponse, UserStatus, CouponInfo } from '../types';
import { LOGGING_API_ENDPOINT } from '../constants';

/**
 * ฟังก์ชันตรวจสอบข้อมูลสมาชิกผ่าน Firebase Firestore
 */
export const validateUser = async (data: UserData): Promise<ValidationResponse> => {
  if (!data.identifier) {
    return { status: UserStatus.INVALID };
  }

  // ทำความสะอาดข้อมูล: ตัดช่องว่าง
  const identifier = data.identifier.trim();
  console.info('[API] กำลังค้นหาสมาชิกด้วยรหัส:', identifier);

  try {
    const membersRef = collection(db, "members");
    
    // ปรับการค้นหาให้ครอบคลุมตามภาพ: contactPhone, phone, และ applicationNumber
    const possibleFields = ["contactPhone", "phone", "applicationNumber"];
    
    // ใช้ Promise.all เพื่อค้นหาทุกฟิลด์พร้อมกัน (Parallel Execution)
    // เพิ่ม .catch เพื่อให้ถ้า query ไหนล้มเหลว จะไม่ทำให้ทั้งหมดล้มเหลว (Fail-safe)
    const queryPromises = possibleFields.map(field => 
      getDocs(query(membersRef, where(field, "==", identifier), limit(1)))
        .then(snapshot => ({ field, snapshot, success: true }))
        .catch(error => {
          console.warn(`[API] Query failed for field ${field}:`, error);
          return { field, error, success: false };
        })
    );

    const results = await Promise.all(queryPromises);

    // ตรวจสอบผลลัพธ์จากการค้นหาที่สำเร็จ
    for (const result of results) {
      if (result.success && 'snapshot' in result && result.snapshot && !result.snapshot.empty) {
        const memberData = result.snapshot.docs[0].data();
        
        // ดึง firstName และ lastName มาต่อกัน
        const firstName = memberData.firstName || '';
        const lastName = memberData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();

        console.info(`[API] พบข้อมูลสมาชิกจากฟิลด์ ${result.field}:`, memberData);
        return {
          status: UserStatus.MEMBER,
          name: fullName || 'สมาชิก Vista Café',
          memberId: memberData.memberId || memberData.applicationNumber || identifier,
        };
      }
    }

    // ถ้าค้นหาไม่เจอเลย แต่มี Error เกิดขึ้นทุกครั้ง (แสดงว่าระบบล่มจริง)
    const allFailed = results.every(r => !r.success);
    if (allFailed) {
      throw new Error('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้');
    }

    console.warn('[API] ไม่พบข้อมูลสมาชิกในระบบสำหรับรหัส:', identifier);
    return { status: UserStatus.NON_MEMBER };

  } catch (error) {
    console.error('[API] เกิดข้อผิดพลาดในการเชื่อมต่อ Firestore:', error);
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      throw new Error('ไม่สามารถเข้าถึงฐานข้อมูลได้ กรุณาตรวจสอบ Firestore Rules');
    }
    throw new Error('ระบบขัดข้องชั่วคราว ไม่สามารถเชื่อมต่อฐานข้อมูลสมาชิกได้');
  }
};

/**
 * บันทึกประวัติการใช้คูปองลงใน Firebase Firestore และ Google Sheets
 */
export const logUsage = async (data: UserData & { 
  branchName: string | null; 
  couponName: string; 
  couponDescription: string; 
  couponCode: string; 
  couponId?: string;
  couponImageUrl?: string;
  couponCardTitle?: string;
  memberName: string | null; 
  status?: string; 
}): Promise<void> => {
  try {
    // 1. บันทึกลง Firebase Firestore (เป็นฐานข้อมูลหลัก)
    console.info('[API] กำลังบันทึกข้อมูลไปยัง Firebase Firestore...');
    const usageLogsRef = collection(db, "usage_logs");
    await addDoc(usageLogsRef, {
      identifier: data.identifier || 'Guest',
      memberName: data.memberName || 'ไม่ระบุชื่อ',
      couponCode: data.couponCode || '',
      couponId: data.couponId || '',
      couponName: data.couponName || '',
      couponDescription: data.couponDescription || '',
      couponImageUrl: data.couponImageUrl || '',
      couponCardTitle: data.couponCardTitle || '',
      branchName: data.branchName || 'ไม่ระบุสาขา',
      status: data.status || 'Used',
      timestamp: serverTimestamp(), // ใช้เวลาจากเซิร์ฟเวอร์ Firebase
      createdAt: new Date().toISOString()
    });
    console.info('[API] บันทึกข้อมูลไปยัง Firebase Firestore สำเร็จ');

    // 2. บันทึกลง Google Sheets (เป็นสำรอง/รายงาน)
    console.info('[API] กำลังส่งข้อมูลไปยัง Google Sheets...');
    await fetch(LOGGING_API_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'log',
        identifier: data.identifier || 'Guest',
        memberName: data.memberName || 'ไม่ระบุชื่อ',
        couponCode: data.couponCode || '',
        couponName: data.couponName || '',
        couponDescription: data.couponDescription || '',
        branchName: data.branchName || 'ไม่ระบุสาขา',
        status: data.status || 'Used'
      }),
    });
    console.info('[API] บันทึกข้อมูลไปยัง Google Sheets สำเร็จ');
  } catch (error) {
    console.error('[API] บันทึกประวัติการใช้งานล้มเหลว:', error);
  }
};

/**
 * ดึงประวัติการใช้คูปองทั้งหมดจาก Firebase Firestore
 */
export const getUsageLogs = async (): Promise<any[]> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    // Use orderBy on server to ensure we get the LATEST logs
    const q = query(usageLogsRef, orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as any));
  } catch (error) {
    console.error('[API] ดึงข้อมูลประวัติล้มเหลว:', error);
    // Fallback if index is missing: fetch without ordering
    try {
      const usageLogsRef = collection(db, "usage_logs");
      const querySnapshot = await getDocs(usageLogsRef);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any)).sort((a, b) => {
        const getLogTime = (log: any) => {
          if (log.timestamp?.toDate) return log.timestamp.toDate().getTime();
          if (log.timestamp?.seconds) return log.timestamp.seconds * 1000;
          if (log.createdAt) {
            const d = new Date(log.createdAt);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          }
          return 0;
        };
        return getLogTime(b) - getLogTime(a);
      });
    } catch (e) {
      return [];
    }
  }
};

/**
 * นำเข้าข้อมูลจาก CSV เข้าสู่ Firebase
 */
export const importLogsFromCSV = async (logs: any[]): Promise<{ success: number, failed: number }> => {
  let successCount = 0;
  let failedCount = 0;

  try {
    const usageLogsRef = collection(db, "usage_logs");
    
    // ใช้ deterministic ID เพื่อป้องกันข้อมูลซ้ำ
    for (let i = 0; i < logs.length; i++) {
      try {
        const log = logs[i];
        // ทำความสะอาด identifier สำหรับสร้าง Key (ล้างอักขระที่ไม่ใช่ตัวเลข และตัด 0 นำหน้าออกชั่วคราวเพื่อความสม่ำเสมอ)
        const cleanId = (log.identifier || '').replace(/\D/g, '').replace(/^0+/, '');
        const cleanDate = (log.createdAt || '').replace(/[^a-zA-Z0-9]/g, '');
        
        // สร้าง ID ที่ไม่ซ้ำกัน
        const uniqueKey = `${cleanId}_${log.couponCode}_${cleanDate}`;
        const docRef = doc(db, "usage_logs", `import_${uniqueKey}`);
        
        // แปลง createdAt เป็น Date object เพื่อให้ Firestore เก็บเป็น Timestamp ได้ถ้าต้องการ
        const logDate = log.createdAt ? new Date(log.createdAt) : new Date();
        
        await setDoc(docRef, {
          ...log,
          timestamp: isNaN(logDate.getTime()) ? serverTimestamp() : logDate,
          importedAt: serverTimestamp(),
          isImported: true
        });
        successCount++;
      } catch (e) {
        console.error('Failed to import row:', logs[i], e);
        failedCount++;
      }
    }
    
    return { success: successCount, failed: failedCount };
  } catch (error) {
    console.error('[API] การนำเข้าข้อมูลล้มเหลว:', error);
    throw error;
  }
};

/**
 * ลบประวัติการใช้งานทั้งหมดจาก Firebase Firestore
 */
export const deleteAllUsageLogs = async (): Promise<{ deleted: number }> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    const querySnapshot = await getDocs(usageLogsRef);
    const logs = querySnapshot.docs;
    
    let deletedCount = 0;
    let batch = writeBatch(db);
    let operationCount = 0;
    
    for (const logDoc of logs) {
      batch.delete(logDoc.ref);
      deletedCount++;
      operationCount++;
      
      if (operationCount >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }
    
    if (operationCount > 0) {
      await batch.commit();
    }
    
    return { deleted: deletedCount };
  } catch (error) {
    console.error('[API] การลบข้อมูลทั้งหมดล้มเหลว:', error);
    throw error;
  }
};

/**
 * แก้ไขข้อมูลประวัติที่ไม่มี timestamp (Fix Missing Timestamps)
 */
export const fixMissingTimestamps = async (): Promise<{ fixed: number }> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    const querySnapshot = await getDocs(usageLogsRef);
    const logs = querySnapshot.docs;
    
    let fixedCount = 0;
    let batch = writeBatch(db);
    let operationCount = 0;
    
    for (const logDoc of logs) {
      const data = logDoc.data();
      if (!data.timestamp) {
        // พยายามหาเวลาจาก createdAt หรือใช้เวลาปัจจุบัน
        const logDate = data.createdAt ? new Date(data.createdAt) : new Date();
        batch.update(logDoc.ref, {
          timestamp: isNaN(logDate.getTime()) ? serverTimestamp() : logDate
        });
        fixedCount++;
        operationCount++;
        
        if (operationCount >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      }
    }
    
    if (operationCount > 0) {
      await batch.commit();
    }
    
    return { fixed: fixedCount };
  } catch (error) {
    console.error('[API] การแก้ไขข้อมูลล้มเหลว:', error);
    throw error;
  }
};

/**
 * ลบข้อมูลประวัติที่ซ้ำกัน (Clean Duplicates)
 */
export const cleanupDuplicateLogs = async (): Promise<{ deleted: number }> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    const querySnapshot = await getDocs(usageLogsRef);
    const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    const seen = new Set<string>();
    let deletedCount = 0;
    let batch = writeBatch(db);
    let operationCount = 0;
    
    for (const log of logs) {
      // สร้าง Key สำหรับตรวจสอบความซ้ำ (ใช้ Logic เดียวกับตอน Import)
      const cleanId = (log.identifier || '').replace(/\D/g, '').replace(/^0+/, '');
      const cleanDate = (log.createdAt || '').replace(/[^a-zA-Z0-9]/g, '');
      const key = `${cleanId}_${log.couponCode}_${cleanDate}`;
      
      if (seen.has(key)) {
        // ถ้าเคยเจอ Key นี้แล้ว ให้ลบ Document นี้ทิ้ง
        batch.delete(doc(db, "usage_logs", log.id));
        deletedCount++;
        operationCount++;
        
        // Firestore batch จำกัดที่ 500 operations
        if (operationCount >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      } else {
        seen.add(key);
      }
    }
    
    if (operationCount > 0) {
      await batch.commit();
    }
    
    return { deleted: deletedCount };
  } catch (error) {
    console.error('[API] การล้างข้อมูลซ้ำล้มเหลว:', error);
    throw error;
  }
};

/**
 * ดึงรายการ ID ของคูปองที่สมาชิกเคยใช้ไปแล้วในเดือนปัจจุบัน
 */
export const getMemberUsedCouponIds = async (identifier: string): Promise<string[]> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    
    // สร้างช่วงเวลาของเดือนปัจจุบัน
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // ค้นหาประวัติการใช้ของสมาชิกคนนี้
    // ปรับปรุง: รองรับทั้งแบบมี 0 และไม่มี 0 นำหน้า
    const cleanId = identifier.replace(/\D/g, '');
    const idVariants = [cleanId];
    if (cleanId.startsWith('0')) {
      idVariants.push(cleanId.substring(1)); // ถ้ามี 0 ให้ลองหาแบบไม่มี 0
    } else if (cleanId.length === 9) {
      idVariants.push('0' + cleanId); // ถ้ามี 9 หลัก ให้ลองหาแบบมี 0
    }

    const q = query(
      usageLogsRef, 
      where("identifier", "in", idVariants)
    );
    
    const querySnapshot = await getDocs(q);
    
    // กรองเฉพาะคูปองที่ใช้ในเดือนนี้ และมีสถานะเป็น Used หรือ Expired
    return querySnapshot.docs
      .map(doc => doc.data())
      .filter(data => {
        const status = data.status || '';
        const isUsedOrExpired = status === 'Used' || status.startsWith('Expired');
        if (!isUsedOrExpired) return false;

        const createdAt = data.createdAt || '';
        // ตรวจสอบว่าอยู่ในเดือน/ปี ปัจจุบันหรือไม่ (รองรับทั้ง ISO และ format ไทย)
        return createdAt.includes(`/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear() + 543}`) || 
               createdAt.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      })
      .map(data => data.couponId || ''); // ดึง ID คูปองออกมา
  } catch (error) {
    console.error('[API] ดึงประวัติการใช้คูปองรายบุคคลล้มเหลว:', error);
    return [];
  }
};

/**
 * ดึงรายการประวัติการใช้คูปองของสมาชิกในเดือนปัจจุบัน
 */
export const getMemberCouponHistory = async (identifier: string): Promise<any[]> => {
  try {
    const usageLogsRef = collection(db, "usage_logs");
    const now = new Date();
    
    const cleanId = identifier.replace(/\D/g, '');
    const idVariants = [cleanId];
    if (cleanId.startsWith('0')) {
      idVariants.push(cleanId.substring(1));
    } else if (cleanId.length === 9) {
      idVariants.push('0' + cleanId);
    }

    const q = query(
      usageLogsRef, 
      where("identifier", "in", idVariants)
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs
      .map(doc => {
        const data = doc.id ? { id: doc.id, ...doc.data() } : doc.data() as any;
        return {
          coupon: {
            id: data.couponId || '',
            name: data.couponName || '',
            cardTitle: data.couponCardTitle || data.couponName || '',
            description: data.couponDescription || '',
            imageUrl: data.couponImageUrl || '',
            // Other fields are not strictly needed for history view but could be added
          },
          status: data.status || 'Used',
          date: data.createdAt || new Date().toISOString(),
          couponCode: data.couponCode || ''
        };
      })
      .filter((data: any) => {
        const createdAt = data.date || '';
        return createdAt.includes(`/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear() + 543}`) || 
               createdAt.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      });
  } catch (error) {
    console.error('[API] ดึงประวัติการใช้คูปองล้มเหลว:', error);
    return [];
  }
};

/**
 * ดึงข้อมูลสมาชิกทั้งหมดจาก Firebase Firestore
 */
export const getMembers = async (): Promise<any[]> => {
  try {
    const membersRef = collection(db, "members");
    const querySnapshot = await getDocs(membersRef);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('[API] ดึงข้อมูลสมาชิกล้มเหลว:', error);
    return [];
  }
};

/**
 * อัปเดตข้อมูลสมาชิกใน Firebase Firestore
 */
export const updateMemberInFirestore = async (id: string, data: any): Promise<void> => {
  try {
    const docRef = doc(db, "members", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('[API] อัปเดตข้อมูลสมาชิกล้มเหลว:', error);
    throw error;
  }
};

/**
 * ดึงประวัติการใช้งานคูปองของสมาชิกรายบุคคล
 * รองรับการค้นหาด้วยหลาย ID (เช่น เบอร์โทร, รหัสสมาชิก)
 */
export const getMemberUsageLogs = async (identifiers: string | string[]): Promise<any[]> => {
  const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
  const validIds = ids.filter(id => id && typeof id === 'string' && id.trim() !== '');
  
  if (validIds.length === 0) return [];
  
  try {
    const usageLogsRef = collection(db, "usage_logs");
    
    // สร้างรายการ ID ที่จะค้นหาทั้งหมด รวมถึงรูปแบบเบอร์โทรศัพท์ต่างๆ
    let searchTerms: string[] = [];
    
    validIds.forEach(id => {
      searchTerms.push(id);
      
      // ถ้าเป็นตัวเลข (น่าจะเป็นเบอร์โทร) ให้เพิ่มรูปแบบต่างๆ
      const cleanId = id.replace(/\D/g, '');
      if (cleanId.length > 0) {
        searchTerms.push(cleanId);
        if (cleanId.startsWith('0')) {
          searchTerms.push(cleanId.substring(1)); // ตัด 0 นำหน้า
        } else if (cleanId.length === 9) {
          searchTerms.push('0' + cleanId); // เติม 0 นำหน้า
        }
      }
    });

    // ลบค่าซ้ำ
    searchTerms = [...new Set(searchTerms)];
    
    // Firestore 'in' query จำกัด 10 ค่า
    if (searchTerms.length > 10) {
      searchTerms = searchTerms.slice(0, 10);
    }

    const q = query(
      usageLogsRef, 
      where("identifier", "in", searchTerms)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    console.error('[API] ดึงประวัติสมาชิกรายบุคคลล้มเหลว:', error);
    return [];
  }
};

/**
 * ดึงรายการคูปองทั้งหมดจาก Firebase Firestore
 */
export const getCouponsFromFirestore = async (): Promise<CouponInfo[]> => {
  try {
    const couponsRef = collection(db, "coupons");
    const querySnapshot = await getDocs(couponsRef);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as CouponInfo));
  } catch (error) {
    console.error('[API] ดึงข้อมูลคูปองล้มเหลว:', error);
    return [];
  }
};

/**
 * เพิ่มคูปองใหม่ลงใน Firebase Firestore
 */
export const addCouponToFirestore = async (coupon: Omit<CouponInfo, 'id'>): Promise<string> => {
  try {
    const couponsRef = collection(db, "coupons");
    const docRef = await addDoc(couponsRef, {
      ...coupon,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('[API] เพิ่มคูปองล้มเหลว:', error);
    throw error;
  }
};

/**
 * อัปเดตข้อมูลคูปองใน Firebase Firestore
 */
export const updateCouponInFirestore = async (id: string, coupon: Partial<CouponInfo>): Promise<void> => {
  try {
    const { id: _, ...updateData } = coupon as any;
    const docRef = doc(db, "coupons", id);
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('[API] อัปเดตคูปองล้มเหลว:', error);
    throw error;
  }
};

/**
 * ลบคูปองออกจาก Firebase Firestore
 */
export const deleteCouponFromFirestore = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, "coupons", id);
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(docRef);
  } catch (error) {
    console.error('[API] ลบคูปองล้มเหลว:', error);
    throw error;
  }
};
