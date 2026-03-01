import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'TH' | 'EN';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const translations: Record<Language, Record<string, string>> = {
  EN: {
    // Login Screen
    loginHeader: 'Login',
    welcome: 'Welcome',
    loggingIn: 'Logging in...',
    subTitle: 'Get exclusive coupons and rewards.',
    subTitleLoggingIn: 'Please wait while we verify your membership.',
    labelId: 'Member ID or Phone Number',
    placeholderId: 'Your mobile number',
    btnLogin: 'Login',
    btnProcessing: 'Processing...',
    'Have Vista Member?': 'Have Vista Member?',
    btnRegister: 'Sign up',
    footerPrefix: 'By logging in, you agree to our',
    terms: 'Terms of Service',
    and: 'and',
    privacy: 'Privacy Policy',
    adminAccess: 'Admin Access',
    heroTitle: 'Vista Café',
    heroSub: 'healthy & tasty. Join our exclusive membership for rewards.',
    
    // Coupon Selection
    greeting: 'Khun',
    goodMorning: 'Good Morning',
    goodAfternoon: 'Good Afternoon',
    goodEvening: 'Good Evening',
    goodNight: 'Good Night',
    couponsReady: 'You have coupons ready today',
    youHave: 'You have',
    couponsUnit: 'coupons',
    readyToUseToday: 'for today',
    points: 'Points',
    exclusiveMember: 'EXCLUSIVE MEMBER',
    specialOffers: 'Special Offers',
    'member exclusive': 'Member Exclusive',
    myCoupons: 'My Coupons',
    history: 'History',
    available: 'Available',
    used: 'Used',
    expired: 'Expired',
    useNow: 'Use Now',
    viewDetails: 'View Details',
    termsConditions: 'Terms & Conditions',
    validUntil: 'Valid until',
    seeMore: 'More',
    recommended: 'Recommended',
    redeemNow: 'Redeem Now',

    // Navigation & Categories
    exploreCategories: 'Categories',
    home: 'Home',
    profile: 'Profile',
    menu: 'Menu',
    service: 'Service',
    snackbox: 'Snackbox',
    branch: 'Branch',
    
    // Ad Slot
    specialPromo: 'Special Promo',
    adTitle: 'Summer Super Sale!',
    adDesc: 'Get 50% off on all premium menu items this weekend only.',
    checkItOut: 'Check it out',
    
    // Coupon Detail
    couponDetail: 'Coupon Detail',
    redeem: 'Redeem',
    redeemConfirm: 'Confirm Redemption',
    redeemCancel: 'Cancel',
    redeemSuccess: 'Redemption Successful',
    back: 'Back',
    
    // Coupon History
    couponHistory: 'Coupon History',
    noHistory: 'No coupon history found.',
    
    // Member Form
    register: 'Register',
    registerTitle: 'Register for Vista Café Membership',
    fullName: 'Full Name',
    phoneNumber: 'Phone Number',
    submit: 'Submit',
    
    // Common
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    cancel: 'Cancel',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
  },

  TH: {
    // Login Screen
    loginHeader: 'เข้าสู่ระบบ',
    welcome: 'ยินดีต้อนรับ',
    loggingIn: 'กำลังเข้าสู่ระบบ...',
    subTitle: 'รับสิทธิพิเศษและคูปองสำหรับคุณ',
    subTitleLoggingIn: 'กรุณารอสักครู่ ระบบกำลังตรวจสอบข้อมูลสมาชิก',
    labelId: 'รหัสสมาชิก หรือ เบอร์โทรศัพท์',
    placeholderId: 'หมายเลขโทรศัพท์',
    btnLogin: 'เข้าสู่ระบบ',
    btnProcessing: 'กำลังดำเนินการ...',
    'Have Vista Member?': 'มีสมาชิก Vista?',
    newToVista: 'ยังไม่เป็นสมาชิก?',
    btnRegister: 'สมัครสมาชิก',
    footerPrefix: 'การเข้าสู่ระบบถือว่าคุณยอมรับ',
    terms: 'เงื่อนไขการให้บริการ',
    and: 'และ',
    privacy: 'นโยบายความเป็นส่วนตัว',
    adminAccess: 'เข้าสู่ระบบผู้ดูแล',
    heroTitle: 'Vista Café',
    heroSub: 'อร่อยและสุขภาพดี สมัครสมาชิกกับเราเพื่อรับสิทธิพิเศษมากมาย',
    
    // Coupon Selection
    greeting: 'คุณ',
    goodMorning: 'อรุณสวัสดิ์',
    goodAfternoon: 'สวัสดียามบ่าย',
    goodEvening: 'สวัสดียามเย็น',
    goodNight: 'ราตรีสวัสดิ์',
    couponsReady: 'คุณมีคูปองพร้อมใช้งานวันนี้',
    youHave: 'คุณมี',
    couponsUnit: 'คูปอง',
    readyToUseToday: 'ที่พร้อมใช้ในวันนี้',
    points: 'คะแนน',
    exclusiveMember: 'สมาชิกคนพิเศษเช่นคุณ',
    guest: 'ผู้มาเยือน',
    specialOffers: 'ข้อเสนอพิเศษ',
    'member exclusive': 'เฉพาะสมาชิก',
    myCoupons: 'คูปองของฉัน',
    history: 'ประวัติ',
    couponHistoryTitle: 'ประวัติคูปอง',
    checkHistory: 'ตรวจสอบประวัติการใช้งาน',
    available: 'ใช้ได้',
    used: 'ใช้แล้ว',
    expired: 'หมดอายุ',
    useNow: 'ใช้ทันที',
    redeemNow: 'แลกสิทธิ์ทันที',
    locked: 'ล็อค',
    comingSoon: 'เร็วๆ นี้',
    viewDetails: 'ดูรายละเอียด',
    termsConditions: 'เงื่อนไขการใช้งาน',
    validUntil: 'ใช้ได้ถึง',
    recommended: 'แนะนำสำหรับคุณ',
    seeMore: 'ดูเพิ่มเติม',
    noCoupons: 'ไม่มีคูปองที่ใช้ได้ในขณะนี้',
    exploreCategories: 'หมวดหมู่',
    home: 'หน้าหลัก',
    profile: 'โปรไฟล์',
    menu: 'เมนู',
    service: 'บริการของเรา',
    snackbox: 'สแนคบ็อกซ์',
    branch: 'สาขา',
    
    // Coupon Detail
    couponDetail: 'รายละเอียดคูปอง',
    validityPeriod: 'ระยะเวลาใช้งาน',
    moreTerms: 'ข้อกำหนดและเงื่อนไขเพิ่มเติม',
    expires: 'หมดเขต',
    redeem: 'กดรับสิทธิ์',
    redeemConfirm: 'ยืนยันการแลกสิทธิ์',
    redeemCancel: 'ยกเลิก',
    redeemSuccess: 'แลกสิทธิ์สำเร็จ',
    back: 'กลับ',
    shareTitle: 'คูปอง Vista Café',
    shareNotSupported: 'ฟังก์ชันแชร์ไม่รองรับในเบราว์เซอร์นี้',
    
    // Coupon History
    couponHistory: 'ประวัติการใช้คูปอง',
    noHistory: 'ไม่พบประวัติการใช้คูปอง',
    noHistoryDesc: 'คูปองที่ใช้แล้วหรือหมดอายุจะแสดงที่นี่',
    code: 'รหัส',

    // Confirmation Modal
    confirmCouponSelection: 'ยืนยันการเลือกคูปอง',
    reviewCouponDetails: 'กรุณาตรวจสอบรายละเอียดคูปองก่อนกดยืนยัน',
    nearestBranch: 'สาขาใกล้เคียงที่สุด',
    searching: 'กำลังค้นหา...',
    noNearbyBranch: 'ไม่พบสาขาใกล้เคียง',
    confirmAndRedeem: 'ยืนยันและรับสิทธิ์',
    
    // Delete Confirmation Modal
    confirmDelete: 'ยืนยันการลบ',
    
    // Line Friend Form
    enterPhone: 'กรอกเบอร์โทรศัพท์',
    phonePlaceholder: 'กรอกเบอร์โทรศัพท์',
    phoneValidation: 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก',
    clear: 'ล้างข้อมูล',
    
    // Admin Login
    adminLoginTitle: 'Vista Admin',
    adminLoginSubtitle: 'กรุณาเข้าสู่ระบบเพื่อจัดการแคมเปญและสมาชิก',
    adminEmailLabel: 'อีเมลผู้ดูแลระบบ',
    passwordLabel: 'รหัสผ่าน',
    loginButton: 'เข้าสู่ระบบ',
    loggingInButton: 'กำลังเข้าสู่ระบบ...',
    invalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    tooManyRequests: 'มีการพยายามเข้าสู่ระบบมากเกินไป กรุณาลองใหม่ในภายหลัง',
    loginError: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง',
    adminFooter: 'Vista Café Member E-Coupon System v2.0',
    
    // Coupon Display
    showQrCode: 'แสดง QR Code นี้กับพนักงาน',
    couponCode: 'รหัสคูปอง',
    minutes: 'นาที',
    confirmUse: 'ยืนยันการใช้สิทธิ์',
    usedStatus: 'ใช้แล้ว',
    expiredStatus: 'หมดอายุ',
    
    // Vista Member Form
    memberIdLabel: 'เบอร์สมาชิก',
    enterMemberId: 'กรอกเบอร์สมาชิก',
    getCoupon: 'รับคูปอง',
    
    // Terms Modal
    termsTitle: 'ข้อกำหนดและเงื่อนไข',
    close: 'ปิด',
    
    // Member Login Modal
    memberLoginTitle: 'รับคูปองพิเศษเพิ่ม\nเฉพาะสมาชิก Vista Café',
    memberLoginDesc: 'โปรดระบุหมายเลขสมาชิก',
    checkPrivilege: 'ตรวจสอบสิทธิ์',
    
    // Member Form
    register: 'ลงทะเบียน',
    registerTitle: 'สมัครสมาชิก Vista Café',
    fullName: 'ชื่อ-นามสกุล',
    phoneNumber: 'เบอร์โทรศัพท์',
    submit: 'ยืนยัน',
    
    // Common
    loading: 'กำลังโหลด...',
    error: 'เกิดข้อผิดพลาด',
    success: 'สำเร็จ',
    confirm: 'ยืนยัน',
    cancel: 'ยกเลิก',
    logout: 'ออกจากระบบ',
    logoutConfirmTitle: 'ยืนยันการออกจากระบบ',
    logoutConfirm: 'คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?',

    // App.tsx
    loadingCoupons: 'กำลังโหลดข้อมูลคูปอง...',
    validatingSystem: 'ระบบกำลังตรวจสอบข้อมูล...',
    validatingWait: 'อาจใช้เวลาสักครู่ในการเชื่อมต่อฐานข้อมูลสมาชิก',
    checkingInfo: 'ตรวจสอบข้อมูล',
    processing: 'กำลังดำเนินการ',
    confirmMember: 'ยืนยันข้อมูลสมาชิก',
    checkInfo: 'ตรวจสอบข้อมูลของคุณ',
    checkInfoDesc: 'กรุณาตรวจสอบความถูกต้องของข้อมูลสมาชิก ก่อนกดยืนยันเพื่อเริ่มใช้งาน',
    memberId: 'หมายเลขสมาชิก (MEMBER ID)',
    name: 'ชื่อ-นามสกุล',
    confirmInfo: 'ยืนยันข้อมูล',
    incorrectInfoLink: 'ข้อมูลไม่ถูกต้อง? กรอกใหม่',
    incorrectInfo: 'ข้อมูลไม่ถูกต้อง?',
    reEnter: 'กรอกใหม่',
    memberNotFound: 'ไม่พบข้อมูลสมาชิก',
    registerPrompt: 'สมัครสมาชิกใหม่ เพื่อรับสิทธิพิเศษ',
    backToHome: 'กลับไปหน้าหลัก',
    errorTitle: 'เกิดข้อผิดพลาด!',
    confirmBranch: 'ยืนยันพิกัดสาขา',
    usingServiceAt: 'คุณกำลังใช้บริการอยู่ที่',
    allBranches: 'สาขาทั้งหมด',
    
    // Ad Slot
    specialPromo: 'โปรโมชั่นพิเศษ',
    adTitle: 'ซัมเมอร์ ซูเปอร์ เซล!',
    adDesc: 'ลดสูงสุด 50% สำหรับเมนูพรีเมียมทุกรายการ เฉพาะสุดสัปดาห์นี้เท่านั้น',
    checkItOut: 'ดูรายละเอียด',

    infoCorrect: 'ข้อมูลถูกต้อง',
    infoIncorrect: 'ไม่ถูกต้อง กรุณาเลือกสาขา',
    selectBranch: 'เลือกสาขาที่ใช้บริการ',
    selectBranchPrompt: 'กรุณาระบุสาขาที่คุณกำลังใช้บริการ',
    tapToSelect: 'กดเพื่อเลือกสาขานี้',
    locationError: 'ไม่สามารถระบุพิกัดได้',
    locationErrorPrompt: 'กรุณาอนุญาตให้เข้าถึงตำแหน่งเพื่อเช็คอินอัตโนมัติ',
    selectBranchManual: 'เลือกสาขาด้วยตนเอง',

    // Error Messages
    errorValidation: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ กรุณาลองใหม่อีกครั้งนะคะ',
    errorScript: 'ขออภัยค่ะ เซิร์ฟเวอร์ขัดข้องชั่วคราวเนื่องจากมีการใช้งานหนาแน่น (Quota Exceeded) กรุณารอ 1-2 นาทีแล้วลองใหม่นะคะ',
    errorTimeout: 'ขออภัยค่ะ เซิร์ฟเวอร์ขัดข้องชั่วคราวเนื่องจากมีการใช้งานหนาแน่น กรุณารอ 1-2 นาทีแล้วลองใหม่นะคะ',
    errorConnection: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาเว้นระยะสักครู่แล้วลองใหม่ค่ะ',
    errorMemberNotFound: 'ไม่พบข้อมูลสมาชิก หรือคุณใช้สิทธิ์ของเดือนนี้ครบแล้วค่ะ',
    errorLocation: 'ไม่สามารถเข้าถึงตำแหน่งได้',
  }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('TH'); // Default to TH as per user preference likely

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
