
import React, { useState, useCallback, useEffect } from 'react';
import { UserData, UserStatus, CouponInfo, CouponHistoryEntry } from './types';
// Fix: Removed MEMBER_MODAL_SCHEDULE which was not exported from constants.ts and unused in this file.
import { VISTA_BRANCHES, COUPON_PREFIX_MEMBER, COUPON_PREFIX_GUEST } from './constants';
import { MapPin, Navigation, Settings, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateUser, logUsage, getMemberUsedCouponIds, getMemberCouponHistory } from './services/api';
import MemberLoginModal from './components/MemberLoginModal';
import CouponDisplay from './components/CouponDisplay';
import CouponSelection from './components/CouponSelection';
import CouponDetail from './components/CouponDetail';
import CouponHistory from './components/CouponHistory';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import useGeolocation from './hooks/useGeolocation';
import useWeeklyPromotions from './hooks/useWeeklyPromotions';

type ViewState = 'LOGIN' | 'VALIDATING' | 'MEMBER_CONFIRMATION' | 'PROMPT_REGISTER' | 'COUPON_SELECTION' | 'COUPON_DETAIL' | 'COUPON' | 'USED' | 'ERROR' | 'HISTORY' | 'REGISTER' | 'ADMIN' | 'ADMIN_LOGIN';

import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  const [view, setView] = useState<ViewState>(() => {
    return window.location.pathname.startsWith('/admin') ? 'ADMIN_LOGIN' : 'LOGIN';
  });
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [qrValue, setQrValue] = useState<string>('');
  const [couponCode, setCouponCode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [couponEntitlement, setCouponEntitlement] = useState<UserStatus.MEMBER | UserStatus.NON_MEMBER | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponInfo | null>(null);
  const [isMemberLoginModalOpen, setMemberLoginModalOpen] = useState(false);
  const [autoLoginId, setAutoLoginId] = useState<string | null>(null);

  const [usedCouponIds, setUsedCouponIds] = useState<string[]>([]);
  const [couponHistory, setCouponHistory] = useState<CouponHistoryEntry[]>([]);
  const [branchForLogging, setBranchForLogging] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  // New state for location flow
  const [showBranchConfirmation, setShowBranchConfirmation] = useState(false);
  const [showManualBranchSelection, setShowManualBranchSelection] = useState(false);
  const [showLocationError, setShowLocationError] = useState(false);
  const [detectedBranch, setDetectedBranch] = useState<any>(null);
  const [locationErrorMsg, setLocationErrorMsg] = useState<string>('');

  const { triggerGeolocation, resetLocation } = useGeolocation(VISTA_BRANCHES);
  const { currentPromotions, isLoading: isPromosLoading } = useWeeklyPromotions(userData);

  const handleValidation = useCallback(async (data: UserData, isAutoLogin = false) => {
    setMemberLoginModalOpen(false);
    setAutoLoginId(null); 
    setView('VALIDATING');
    setErrorMessage('');
    setUserData(data);
    setMemberName(null);

    try {
      const result = await validateUser(data);

      if (result.status === UserStatus.MEMBER) {
        // Save for auto-login
        localStorage.setItem('vista_member_id', data.identifier);
        
        setMemberName(result.name ?? null);
        setCouponEntitlement(UserStatus.MEMBER);
        
        // ดึงประวัติการใช้คูปองจริงจาก Firebase
        try {
          const remoteUsedIds = await getMemberUsedCouponIds(data.identifier);
          if (remoteUsedIds.length > 0) {
            setUsedCouponIds(prev => {
              const combined = Array.from(new Set([...prev, ...remoteUsedIds]));
              return combined;
            });
          }
          
          const remoteHistory = await getMemberCouponHistory(data.identifier);
          if (remoteHistory.length > 0) {
            setCouponHistory(prev => {
              // Merge history based on ID or unique timestamp
              return remoteHistory as any;
            });
          }
        } catch (e) {
          console.error('Failed to fetch remote used coupons:', e);
        }
        
        if (isAutoLogin) {
          setView('COUPON_SELECTION');
        } else {
          setView('MEMBER_CONFIRMATION');
        }
      } else if (result.status === UserStatus.NON_MEMBER) {
        setCouponEntitlement(UserStatus.NON_MEMBER);
        setView('PROMPT_REGISTER');
      } else {
        setErrorMessage('ไม่พบข้อมูลสมาชิก หรือคุณใช้สิทธิ์ของเดือนนี้ครบแล้วค่ะ');
        setView('ERROR');
      }
    } catch (error) {
      console.error('Full Validation Error:', error);
      let message = 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ กรุณาลองใหม่อีกครั้งนะคะ';
      
      if (error instanceof Error) {
        const errText = error.message.toLowerCase();
        if (errText.includes('script error')) {
          message = 'ขออภัยค่ะ เซิร์ฟเวอร์ขัดข้องชั่วคราวเนื่องจากมีการใช้งานหนาแน่น (Quota Exceeded) กรุณารอ 1-2 นาทีแล้วลองใหม่นะคะ';
        } else if (errText.includes('timeout')) {
          message = 'ขออภัยค่ะ เซิร์ฟเวอร์ขัดข้องชั่วคราวเนื่องจากมีการใช้งานหนาแน่น กรุณารอ 1-2 นาทีแล้วลองใหม่นะคะ';
        } else {
          message = error.message;
        }
      } else if (String(error).toLowerCase().includes('script error')) {
        message = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาเว้นระยะสักครู่แล้วลองใหม่ค่ะ';
      }
      
      setErrorMessage(message);
      setView('ERROR');
    }
  }, []);

  // Auto-login check
  useEffect(() => {
    const storedMemberId = localStorage.getItem('vista_member_id');
    if (storedMemberId && !userData && view === 'LOGIN') {
      handleValidation({ identifier: storedMemberId }, true);
    }
  }, [handleValidation, userData, view]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isAuth = !!user;
      setIsAdminAuthenticated(isAuth);
      if (window.location.pathname.startsWith('/admin')) {
        setView(isAuth ? 'ADMIN' : 'ADMIN_LOGIN');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if ((view === 'ADMIN' || view === 'ADMIN_LOGIN') && !path.startsWith('/admin')) {
      window.history.pushState(null, '', '/admin');
    } else if (view !== 'ADMIN' && view !== 'ADMIN_LOGIN' && path.startsWith('/admin')) {
      window.history.pushState(null, '', '/');
    }
  }, [view]);

  // Listen for registration success message from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'VISTA_REGISTER_SUCCESS') {
        const phone = event.data.phoneNumber;
        if (phone && phone.length === 10) {
          setAutoLoginId(phone);
          setView('LOGIN');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCouponSelection = useCallback((coupon: CouponInfo) => {
    setSelectedCoupon(coupon);
    setView('COUPON_DETAIL');
  }, []);

  const generateCouponCode = useCallback((branchName: string | null) => {
    if (!selectedCoupon) return;

    setBranchForLogging(branchName);
    
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    
    const prefix = selectedCoupon.isMemberOnly ? COUPON_PREFIX_MEMBER : COUPON_PREFIX_GUEST;
    const generatedCode = `${prefix}${day}${month}-${randomDigits}`;
    
    setQrValue(generatedCode);
    setCouponCode(generatedCode);
    
    // Close all location modals
    setShowBranchConfirmation(false);
    setShowManualBranchSelection(false);
    setShowLocationError(false);
    
    setView('COUPON');
  }, [selectedCoupon]);

  const handleUseCoupon = useCallback(async () => {
    if (!selectedCoupon) return;

    setView('VALIDATING');
    
    try {
      const { branch } = await triggerGeolocation();
      if (branch) {
        setDetectedBranch(branch);
        setShowBranchConfirmation(true);
      } else {
        // Location found but no branch nearby (shouldn't happen with current logic but safe fallback)
        setShowManualBranchSelection(true);
      }
      setView('COUPON_DETAIL'); // Stay on detail view but show modal
    } catch (e) {
        console.warn("Geolocation failed:", e);
        setLocationErrorMsg(e instanceof Error ? e.message : 'ไม่สามารถเข้าถึงตำแหน่งได้');
        setShowLocationError(true);
        setView('COUPON_DETAIL'); // Stay on detail view but show modal
    }
  }, [selectedCoupon, triggerGeolocation]);
  
  const handleProceedAsNonMember = useCallback(() => {
    setUserData({ identifier: 'Guest' });
    setCouponEntitlement(UserStatus.NON_MEMBER);
    setView('COUPON_SELECTION');
  }, []);
  
  const handleMemberConfirm = useCallback(() => {
    setCouponEntitlement(UserStatus.MEMBER);
    setView('COUPON_SELECTION');
  }, []);

  const handleMemberClear = useCallback(() => {
    localStorage.removeItem('vista_member_id');
    setUserData(null);
    setMemberName(null);
    setCouponEntitlement(UserStatus.NON_MEMBER);
    setView('LOGIN');
  }, []);

  const handleCouponUsed = useCallback(() => {
    if (selectedCoupon && !isFinalizing) {
      setIsFinalizing(true);
      setView('USED');
      setUsedCouponIds(prev => [...new Set([...prev, selectedCoupon.id])]);

      const newHistoryEntry: CouponHistoryEntry = {
        coupon: selectedCoupon,
        status: 'Used',
        date: new Date().toISOString(),
        couponCode: couponCode,
      };
      setCouponHistory(prev => [newHistoryEntry, ...prev]);

      const currentUserData = userData || { identifier: 'Guest' };
      logUsage({
        ...currentUserData,
        branchName: branchForLogging,
        couponName: selectedCoupon.name,
        couponDescription: selectedCoupon.description,
        couponCode: couponCode,
        couponId: selectedCoupon.id,
        couponImageUrl: selectedCoupon.imageUrl,
        couponCardTitle: selectedCoupon.cardTitle,
        memberName: memberName,
        status: 'Used',
      }).catch(error => {
        console.error("Failed to log coupon usage in the background:", error);
      });
    }
  }, [selectedCoupon, userData, memberName, couponCode, branchForLogging, isFinalizing]);

  const handleCouponExpired = useCallback(() => {
    if (selectedCoupon && !isFinalizing) {
      setIsFinalizing(true);
      setUsedCouponIds(prev => [...new Set([...prev, selectedCoupon.id])]);
      
      const newHistoryEntry: CouponHistoryEntry = {
        coupon: selectedCoupon,
        status: 'Expired',
        date: new Date().toISOString(),
        couponCode: couponCode,
      };
      setCouponHistory(prev => [newHistoryEntry, ...prev]);

      const currentUserData = userData || { identifier: 'Guest' };
      logUsage({
          ...currentUserData,
          branchName: branchForLogging,
          couponName: selectedCoupon.name,
          couponDescription: `Expired: ${selectedCoupon.description}`,
          couponCode: couponCode,
          couponId: selectedCoupon.id,
          couponImageUrl: selectedCoupon.imageUrl,
          couponCardTitle: selectedCoupon.cardTitle,
          memberName: memberName,
          status: 'Expired',
      }).catch(error => {
          console.error("Failed to log expired coupon in the background:", error);
      });
    }
  }, [selectedCoupon, userData, memberName, couponCode, branchForLogging, isFinalizing]);
  
  const handleGoBackToSelection = useCallback(() => {
    setView('COUPON_SELECTION');
    setSelectedCoupon(null);
    setQrValue('');
    setCouponCode('');
    resetLocation();
    setIsFinalizing(false);
  }, [resetLocation]);
  
  const handleViewHistory = useCallback(() => {
    setView('HISTORY');
  }, []);

  const handleRegisterClick = useCallback(() => {
    setView('REGISTER');
  }, []);

  const resetState = useCallback(() => {
    setView('LOGIN');
    setErrorMessage('');
    setUserData(null);
    setMemberName(null);
    setCouponEntitlement(null);
    setSelectedCoupon(null);
    setCouponCode('');
    setAutoLoginId(null);
    resetLocation();
    setIsFinalizing(false);
  }, [resetLocation]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname.startsWith('/admin')) {
        setView(isAdminAuthenticated ? 'ADMIN' : 'ADMIN_LOGIN');
      } else {
        resetState();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAdminAuthenticated, resetState]);

  const handleAdminLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setIsAdminAuthenticated(false);
      setView('ADMIN_LOGIN');
    } catch (error) {
      console.error("Logout error:", error);
      setView('ADMIN_LOGIN');
    }
  }, []);

  const renderContent = () => {
    if (isPromosLoading && ['COUPON_SELECTION', 'COUPON_DETAIL'].includes(view)) {
      return (
        <div className="flex flex-col items-center justify-center text-gray-600 p-8 h-full w-full bg-pattern">
          <svg className="animate-spin h-12 w-12 text-[#F8B500] mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-xl font-bold text-gray-900">กำลังโหลดข้อมูลคูปอง...</p>
        </div>
      );
    }

    switch (view) {
      case 'LOGIN':
        return <LoginScreen onSubmit={handleValidation} onRegisterClick={handleRegisterClick} autoLoginId={autoLoginId} />;
      case 'REGISTER':
        return (
          <div className="flex flex-col w-full h-full bg-white overflow-hidden relative">
            {/* Floating Back to Main Button - Bottom Left */}
            <button
              onClick={resetState}
              className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 bg-white text-gray-700 rounded-full shadow-2xl border border-gray-100 active:scale-95 transition-all hover:bg-gray-50 group"
              title="กลับหน้าหลัก"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {/* Tooltip text showing on hover */}
              <span className="absolute left-16 bg-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-gray-50 whitespace-nowrap">
                กลับหน้าหลัก
              </span>
            </button>
            
            <div className="flex-grow w-full relative h-full">
              <iframe 
                src="https://vista-caf-member-register-system-186896723259.us-west1.run.app/" 
                className="w-full h-full border-none"
                title="สมัครสมาชิก Vista Café"
              />
            </div>
          </div>
        );
      case 'VALIDATING':
        return (
          <div className="flex flex-col items-center justify-center text-gray-600 p-8 h-full w-full bg-pattern">
            <svg className="animate-spin h-12 w-12 text-[#F8B500] mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-xl font-bold text-gray-900">ระบบกำลังตรวจสอบข้อมูล...</p>
            <p className="text-gray-400 mt-2 text-center max-w-xs">อาจใช้เวลาสักครู่ในการเชื่อมต่อฐานข้อมูลสมาชิก</p>
          </div>
        );
      case 'MEMBER_CONFIRMATION':
        return (
          <div className="flex flex-col items-center justify-center text-gray-800 p-8 text-center w-full h-full bg-pattern overflow-hidden">
            <div className="mb-12 relative flex items-center justify-center">
               <div className="w-32 h-32 bg-green-50 rounded-full animate-pulse-subtle"></div>
               <div className="absolute inset-0 w-32 h-32 bg-green-100 rounded-full animate-ripple-center opacity-0 pointer-events-none"></div>
               <div className="absolute w-24 h-24 bg-white rounded-full flex items-center justify-center border border-green-50 shadow-2xl shadow-green-900/5 animate-success-pop overflow-hidden">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={4.5} 
                      d="M5 13l4 4L19 7" 
                      className="animate-check-draw"
                    />
                  </svg>
               </div>
            </div>
            
            <div className="mb-10 animate-fade-up">
               <h2 className="text-[30px] font-black text-[#111827] tracking-tight">ยืนยันข้อมูลสมาชิก</h2>
            </div>
            
            <div className="bg-white rounded-[32px] p-8 w-full max-w-[360px] text-left mb-10 space-y-6 border border-gray-100 shadow-xl shadow-gray-200/40 animate-fade-up delay-100 overflow-hidden">
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1.5 opacity-70">หมายเลขสมาชิก</p>
                    <p className="text-[20px] font-black text-gray-800 tracking-tight truncate">{userData?.identifier}</p>
                </div>
                <div className="pt-5 border-t border-gray-50">
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1.5 opacity-70">ชื่อ-นามสกุล</p>
                    <p 
                      className="font-black text-gray-800 tracking-tight break-words leading-tight transition-all duration-300 pr-2"
                      style={{ 
                        fontSize: memberName && memberName.length > 15 
                          ? `${Math.max(13, 22 - (memberName.length - 15) * 0.5)}px` 
                          : '22px'
                      }}
                    >
                      {memberName || '...'}
                    </p>
                </div>
            </div>

            <div className="w-full max-w-[360px] space-y-5">
              <div className="animate-fade-up delay-200">
                <button
                  onClick={handleMemberConfirm}
                  className="relative overflow-hidden w-full bg-[#111827] text-white font-bold py-6 px-6 rounded-2xl shadow-xl shadow-gray-200 transition-all duration-300 active:scale-95 hover:bg-black"
                >
                  <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-full h-full -translate-x-full animate-shimmer pointer-events-none"></div>
                  <span className="relative z-10">ยืนยันข้อมูลสมาชิก</span>
                </button>
              </div>
              
              <div className="animate-fade-up delay-300">
                <button
                  onClick={handleMemberClear}
                  className="w-full bg-transparent text-gray-400 font-bold py-2 px-6 rounded-2xl transition-colors hover:text-gray-600 text-sm"
                >
                  ข้อมูลไม่ถูกต้อง? <span className="underline decoration-gray-200 underline-offset-4">กรอกใหม่</span>
                </button>
              </div>
            </div>
          </div>
        );
      case 'PROMPT_REGISTER':
        return (
          <div className="flex flex-col items-center justify-center text-gray-800 p-8 text-center w-full h-full bg-pattern">
            <div className="mb-10">
               <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
               </div>
               <h2 className="text-2xl font-bold text-gray-900 mb-2">ไม่พบข้อมูลสมาชิก</h2>
               <p className="text-gray-500 text-sm">สมัครสมาชิกใหม่ เพื่อรับสิทธิพิเศษ</p>
            </div>

            <div className="w-full max-w-[320px] space-y-4">
              <button
                onClick={handleRegisterClick}
                className="block w-full text-center bg-[#F8B500] text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition-transform duration-200 active:scale-95"
              >
                สมัครสมาชิก
              </button>
              <button
                onClick={resetState}
                className="w-full bg-white text-gray-600 font-bold py-4 px-6 rounded-2xl border border-gray-100 shadow-sm transition-colors active:bg-gray-50"
              >
                กลับไปหน้าหลัก
              </button>
            </div>
          </div>
        );
      case 'COUPON_SELECTION':
      default:
        if (couponEntitlement) {
          return (
            <CouponSelection
              entitlement={couponEntitlement}
              onSelect={handleCouponSelection}
              promotions={currentPromotions}
              onLoginClick={() => setMemberLoginModalOpen(true)}
              usedCouponIds={usedCouponIds}
              onViewHistory={handleViewHistory}
              memberName={memberName}
              userIdentifier={userData?.identifier}
              couponHistory={couponHistory}
              onLogout={handleMemberClear}
            />
          );
        }
        return null;
      case 'COUPON_DETAIL':
        if (selectedCoupon) {
            return (
                <CouponDetail 
                    coupon={selectedCoupon}
                    onUse={handleUseCoupon}
                    onBack={handleGoBackToSelection}
                />
            );
        }
        setView('COUPON_SELECTION');
        return null;
      case 'COUPON':
        return <CouponDisplay qrValue={qrValue} onComplete={handleCouponUsed} onGoBack={handleGoBackToSelection} coupon={selectedCoupon!} couponCode={couponCode} onExpire={handleCouponExpired} />;
      case 'USED':
        return <CouponDisplay qrValue={qrValue} onComplete={() => {}} onGoBack={handleGoBackToSelection} isUsed={true} coupon={selectedCoupon!} couponCode={couponCode} onExpire={() => {}} />;
      case 'HISTORY':
        return <CouponHistory history={couponHistory} onBack={handleGoBackToSelection} />;
      case 'ADMIN_LOGIN':
        return <AdminLogin onBack={resetState} onSuccess={() => setView('ADMIN')} />;
      case 'ADMIN':
        return <AdminDashboard onBack={handleAdminLogout} />;
      case 'ERROR':
        return (
          <div className="flex flex-col items-center justify-center text-gray-800 p-8 h-full text-center w-full bg-pattern">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
               </svg>
            </div>
            <p className="text-xl font-bold text-red-600 mb-2">เกิดข้อผิดพลาด!</p>
            <div className="mb-10 text-gray-500 max-w-xs mx-auto leading-relaxed">
              {errorMessage}
            </div>
            <button
              onClick={resetState}
              className="bg-[#111827] text-white font-bold py-4 px-10 rounded-2xl shadow-xl transition-all active:scale-95"
            >
              ย้อนกลับหน้าแรก
            </button>
          </div>
        );
    }
  };
  
  const containerBG = ['COUPON_SELECTION', 'COUPON_DETAIL', 'HISTORY'].includes(view) ? 'bg-pattern-gray' : 'bg-pattern';

  return (
    <div className={`w-full text-gray-800 relative flex flex-col h-screen h-[100dvh] overflow-hidden ${containerBG}`}>
      <div className="relative z-10 flex flex-col items-center flex-grow w-full h-full overflow-hidden">
          {renderContent()}
      </div>
      {/* Branch Confirmation Modal */}
      {showBranchConfirmation && detectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-up">
            <div className="bg-emerald-50 p-6 flex flex-col items-center text-center border-b border-emerald-100">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-emerald-100">
                <MapPin className="text-emerald-500 w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-emerald-900 mb-1">ยืนยันพิกัดสาขา</h3>
              <p className="text-sm text-emerald-600">คุณกำลังใช้บริการอยู่ที่</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                  <Navigation className="text-slate-700 w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">สาขาที่มาใช้สิทธ์</p>
                  <p className="text-base font-bold text-slate-900">{detectedBranch.name}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => generateCouponCode(detectedBranch.name)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  ข้อมูลถูกต้อง
                </button>
                <button
                  onClick={() => {
                    setShowBranchConfirmation(false);
                    setShowManualBranchSelection(true);
                  }}
                  className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                >
                  ไม่ถูกต้อง กรุณาเลือกสาขา
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Branch Selection Modal */}
      {showManualBranchSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900">เลือกสาขาที่ใช้บริการ</h3>
                <p className="text-xs text-slate-500">กรุณาระบุสาขาที่คุณกำลังใช้บริการ</p>
              </div>
              <button 
                onClick={() => setShowManualBranchSelection(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-3">
                {VISTA_BRANCHES.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => generateCouponCode(branch.name)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/50 transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors shrink-0">
                      <MapPin size={18} className="text-slate-400 group-hover:text-amber-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 group-hover:text-amber-900">{branch.name}</p>
                      <p className="text-[10px] text-slate-400 group-hover:text-amber-700/70">กดเพื่อเลือกสาขานี้</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Location Error Modal */}
      {showLocationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-up">
            <div className="bg-amber-50 p-6 flex flex-col items-center text-center border-b border-amber-100">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-amber-100">
                <AlertCircle className="text-amber-500 w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-amber-900 mb-1">ไม่สามารถระบุพิกัดได้</h3>
              <p className="text-sm text-amber-700/80 px-4">{locationErrorMsg || 'กรุณาอนุญาตให้เข้าถึงตำแหน่งเพื่อเช็คอินอัตโนมัติ'}</p>
            </div>
            
            <div className="p-6 space-y-3">
              <button
                onClick={() => {
                   setShowLocationError(false);
                   setShowManualBranchSelection(true);
                }}
                className="w-full bg-[#111827] text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                เลือกสาขาด้วยตนเอง
              </button>
              
              <button
                onClick={() => setShowLocationError(false)}
                className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberLoginModal
        isOpen={isMemberLoginModalOpen}
        onClose={() => setMemberLoginModalOpen(false)}
        onSubmit={handleValidation}
      />
    </div>
  );
}
