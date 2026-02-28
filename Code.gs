
const SPREADSHEET_ID = '1J9sz5V2fWb2AvEGmuYc2Mc_VG7y6cJg2Llr6SIVFq-E';
const SHEET_NAME = 'การตอบแบบฟอร์ม 1'; 
const MEMBER_ID_COLUMN_INDEX = 2; // คอลัมน์ C (Index 0, 1, 2)
const MEMBER_FIRSTNAME_COLUMN_INDEX = 3; // คอลัมน์ D
const MEMBER_LASTNAME_COLUMN_INDEX = 4; // คอลัมน์ E

/**
 * [NEW] ระบบ Keep-Warm
 * ฟังก์ชันนี้มีไว้เพื่อให้ Google Apps Script ทำงานอยู่ตลอดเวลา (Active) 
 */
function keepWarm() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ss.getName(); 
    console.info("Keep-warm: Server is awake and ready.");
  } catch (e) {
    console.error("Keep-warm error: " + e.toString());
  }
}

/**
 * [NEW] ฟังก์ชันสร้าง Trigger อัตโนมัติ
 * ให้รันฟังก์ชันนี้ "ครั้งเดียว" จากหน้า Editor ของ Apps Script
 */
function setupKeepWarmTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'keepWarm') ScriptApp.deleteTrigger(t);
  });
  
  ScriptApp.newTrigger('keepWarm')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.info("Keep-warm trigger has been set up successfully.");
}

/**
 * ฟังก์ชันตรวจสอบสมาชิก (JSONP)
 */
function doGet(e) {
  const memberIdToVerify = String(e.parameter.memberId || '').trim();
  const callbackFunctionName = e.parameter.callback;

  if (!memberIdToVerify || !callbackFunctionName) {
    return createJsonResponse(callbackFunctionName, { status: 'error', message: 'Missing parameters' });
  }

  const cache = CacheService.getScriptCache();
  
  // 1. ตรวจสอบใน Cache (เร็วที่สุด)
  try {
    const cachedResult = cache.get(memberIdToVerify);
    if (cachedResult) {
      return createJsonResponse(callbackFunctionName, JSON.parse(cachedResult));
    }
  } catch (err) {
    console.warn("Cache error:", err);
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // 2. ใช้ TextFinder ค้นหาเฉพาะเจาะจงในคอลัมน์ C (ความเร็วสูง)
    const finder = sheet.getRange("C:C").createTextFinder(memberIdToVerify).matchEntireCell(true);
    const cell = finder.findNext();

    if (cell) {
      const row = cell.getRow();
      
      // ดึงข้อมูลเฉพาะช่วงที่ต้องการ (Col C ถึง Col E คือ 3 ถึง 5)
      const dataRange = sheet.getRange(row, 3, 1, 3).getValues()[0];
      
      const firstName = String(dataRange[1] || '').trim(); // Index 1 ในช่วงที่ดึงมาคือ Col D
      const lastName = String(dataRange[2] || '').trim();  // Index 2 ในช่วงที่ดึงมาคือ Col E
      const fullName = `${firstName} ${lastName}`.trim();

      const response = { 
        status: 'success', 
        data: { 
          memberId: String(dataRange[0]).trim(), 
          name: fullName || 'สมาชิก Vista Café' 
        } 
      };

      // บันทึกลง Cache 20 นาที
      try {
        cache.put(memberIdToVerify, JSON.stringify(response), 1200);
      } catch (ce) {}
      
      return createJsonResponse(callbackFunctionName, response);
    }

    // กรณีไม่พบข้อมูล
    return createJsonResponse(callbackFunctionName, { status: 'not_found', message: 'ไม่พบข้อมูลสมาชิก' });

  } catch (error) {
    console.error('Validation Error:', error.toString());
    return createJsonResponse(callbackFunctionName, { status: 'error', message: 'Server busy: ' + error.toString() });
  }
}

/**
 * Helper: สร้าง JSONP Response
 */
function createJsonResponse(callback, data) {
  const output = callback ? `${callback}(${JSON.stringify(data)})` : JSON.stringify(data);
  const mimeType = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(output).setMimeType(mimeType);
}

/**
 * ฟังก์ชันสำหรับ Logging การใช้คูปอง
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    if (postData.action === 'log') {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      let logSheet = ss.getSheetByName('CouponUsageLog') || ss.insertSheet('CouponUsageLog');
      
      // ปรับรูปแบบวัน/เวลาให้มีวินาที (dd/MM/yyyy HH:mm:ss) ตามคำขอ
      const timestamp = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
      
      logSheet.appendRow([
        timestamp,
        postData.identifier,
        postData.memberName,
        postData.couponCode,
        postData.couponName,
        postData.couponDescription,
        postData.branchName,
        postData.status || 'Used'
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
