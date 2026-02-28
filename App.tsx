import React, { useState, useCallback, useEffect } from 'react';
import { UserData, UserStatus, CouponInfo, CouponHistoryEntry } from './types';
import { VISTA_BRANCHES, COUPON_PREFIX_MEMBER, COUPON_PREFIX_GUEST } from './constants';
import { MapPin, Navigation, Settings, X, CheckCircle2, AlertCircle, ChevronRight, ArrowLeft, User, Check, Database } from 'lucide-react';
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
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

type ViewState = 'LOGIN' | 'VALIDATING' | 'MEMBER_CONFIRMATION' | 'PROMPT_REGISTER' | 'COUPON_SELECTION' | 'COUPON_DETAIL' | 'COUPON' | 'USED' | 'ERROR' | 'HISTORY' | 'REGISTER' | 'ADMIN' | 'ADMIN_LOGIN';

function MainApp() {
  const { t } = useLanguage();
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
  const [progress, setProgress] = useState(0);

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
        
        setProgress(100);
        await new Promise(resolve => setTimeout(resolve, 500));

        if (isAutoLogin) {
          setView('COUPON_SELECTION');
        } else {
          setView('MEMBER_CONFIRMATION');
        }
      } else if (result.status === UserStatus.NON_MEMBER) {
        setProgress(100);
        await new Promise(resolve => setTimeout(resolve, 500));
        setCouponEntitlement(UserStatus.NON_MEMBER);
        setView('PROMPT_REGISTER');
      } else {
        setErrorMessage(t('errorMemberNotFound'));
        setView('ERROR');
      }
    } catch (error) {
      console.error('Full Validation Error:', error);
      let message = t('errorValidation');
      
      if (error instanceof Error) {
        const errText = error.message.toLowerCase();
        if (errText.includes('script error')) {
          message = t('errorScript');
        } else if (errText.includes('timeout')) {
          message = t('errorTimeout');
        } else {
          message = error.message;
        }
      } else if (String(error).toLowerCase().includes('script error')) {
        message = t('errorConnection');
      }
      
      setErrorMessage(message);
      setView('ERROR');
    }
  }, [t]);

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

  // Animate progress bar when validating
  useEffect(() => {
    if (view === 'VALIDATING') {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          // Random increment between 1 and 3
          return Math.min(prev + Math.random() * 2 + 1, 95);
        });
      }, 100);
      return () => clearInterval(interval);
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
        setLocationErrorMsg(e instanceof Error ? e.message : t('errorLocation'));
        setShowLocationError(true);
        setView('COUPON_DETAIL'); // Stay on detail view but show modal
    }
  }, [selectedCoupon, triggerGeolocation, t]);
  
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
          <p className="text-xl font-bold text-gray-900">{t('loadingCoupons')}</p>
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
              title={t('backToHome')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {/* Tooltip text showing on hover */}
              <span className="absolute left-16 bg-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-gray-50 whitespace-nowrap">
                {t('backToHome')}
              </span>
            </button>
            
            <div className="flex-grow w-full relative h-full">
              <iframe 
                src="https://vista-caf-member-register-system-186896723259.us-west1.run.app/" 
                className="w-full h-full border-none"
                title={t('registerTitle')}
              />
            </div>
          </div>
        );
      case 'VALIDATING':
        return (
          <div className="flex flex-col w-full h-full bg-white relative">
            {/* Header */}
            <div className="flex items-center justify-center px-6 py-4 relative">
               <button 
                onClick={() => setView('LOGIN')}
                className="absolute left-6 p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <h1 className="text-lg font-bold text-gray-900">{t('checkingInfo')}</h1>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-20">
               {/* Spinner */}
               <div className="relative mb-8 w-32 h-32 flex items-center justify-center">
                  {/* Outer Ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-amber-50"></div>
                  {/* Spinning Ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-[#F8B500] border-t-transparent animate-spin"></div>
                  
                  {/* Icon */}
                  <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-[#F8B500] shadow-sm">
                     <Database size={32} />
                  </div>
               </div>

               <h2 className="text-xl font-bold text-gray-900 mb-3 text-center">{t('validatingSystem')}</h2>
               <p className="text-gray-400 text-center text-sm mb-12 max-w-xs font-medium leading-relaxed">
                 {t('validatingWait')}
               </p>

               {/* Progress Bar */}
               <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-xs font-bold text-[#F8B500]">
                     <span>{t('processing')}</span>
                     <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                     <div 
                        className="bg-[#F8B500] h-full rounded-full animate-pulse shadow-[0_0_10px_rgba(248,181,0,0.4)] transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                     ></div>
                  </div>
               </div>
            </div>
          </div>
        );
      case 'MEMBER_CONFIRMATION':
        return (
          <div className="flex flex-col w-full h-full bg-[#FAFAFA] relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <button 
                onClick={() => setView('LOGIN')}
                className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
              <h1 className="text-lg font-bold text-gray-900">{t('confirmMember')}</h1>
              <div className="w-10"></div> {/* Spacer for centering */}
            </div>

            <div className="flex-1 flex flex-col items-center px-6 pt-8 pb-24 overflow-y-auto">
              {/* Check Circle */}
              <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mb-8 shadow-sm ring-8 ring-amber-50">
                <div className="w-16 h-16 bg-[#F8B500] rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                  <Check size={32} className="text-white" strokeWidth={3} />
                </div>
              </div>

              {/* Title & Description */}
              <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center tracking-tight">
                {t('checkInfo')}
              </h2>
              <p className="text-gray-500 text-center mb-10 max-w-xs leading-relaxed font-medium">
                {t('checkInfoDesc')}
              </p>

              {/* Info Card */}
              <div className="w-full bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative overflow-hidden">
                {/* Name Section */}
                <div className="flex items-start gap-4 mb-8 relative z-10">
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-[#F8B500] shrink-0">
                    <User size={24} />
                  </div>
                  <div>
                    <p className="text-[#F8B500] text-xs font-bold mb-1 uppercase tracking-wide">{t('name')}</p>
                    <p className="text-xl font-bold text-gray-900 leading-tight">
                      {memberName || 'Unknown Member'}
                    </p>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-50 mb-8"></div>

                {/* Member ID Section */}
                <div className="flex justify-between items-end relative z-10">
                  <div>
                    <p className="text-[#F8B500] text-xs font-bold mb-1 uppercase tracking-wide">
                      {t('memberId')}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight font-mono">
                      {userData?.identifier}
                    </p>
                  </div>
                </div>

                {/* Decorative Background Elements */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-50/50 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-orange-50/50 rounded-full blur-3xl"></div>
              </div>
            </div>

            {/* Bottom Action Area */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-20 pb-safe">
              <button
                onClick={handleMemberConfirm}
                className="w-full bg-[#F8B500] hover:bg-[#E5A800] text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                {t('confirmInfo')} <ChevronRight size={24} />
              </button>
              
              <button 
                onClick={handleMemberClear}
                className="w-full mt-4 text-center text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
              >
                {t('incorrectInfoLink')}
              </button>
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
               <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('memberNotFound')}</h2>
               <p className="text-gray-500 text-sm">{t('registerPrompt')}</p>
            </div>

            <div className="w-full max-w-[320px] space-y-4">
              <button
                onClick={handleRegisterClick}
                className="block w-full text-center bg-[#F8B500] text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition-transform duration-200 active:scale-95"
              >
                {t('btnRegister')}
              </button>
              <button
                onClick={resetState}
                className="w-full bg-white text-gray-600 font-bold py-4 px-6 rounded-2xl border border-gray-100 shadow-sm transition-colors active:bg-gray-50"
              >
                {t('backToHome')}
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
            <p className="text-xl font-bold text-red-600 mb-2">{t('errorTitle')}</p>
            <div className="mb-10 text-gray-500 max-w-xs mx-auto leading-relaxed">
              {errorMessage}
            </div>
            <button
              onClick={resetState}
              className="bg-[#111827] text-white font-bold py-4 px-10 rounded-2xl shadow-xl transition-all active:scale-95"
            >
              {t('backToHome')}
            </button>
          </div>
        );
    }
  };
  
  return (
    <div className="w-full text-gray-800 relative flex flex-col h-screen h-[100dvh] overflow-hidden bg-white">
      <div className="relative z-10 flex flex-col items-center flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar">
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
              <h3 className="text-lg font-bold text-emerald-900 mb-1">{t('confirmBranch')}</h3>
              <p className="text-sm text-emerald-600">{t('usingServiceAt')}</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                  <Navigation className="text-slate-700 w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('branch')}</p>
                  <p className="text-base font-bold text-slate-900">{detectedBranch.name}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => generateCouponCode(detectedBranch.name)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  {t('infoCorrect')}
                </button>
                <button
                  onClick={() => {
                    setShowBranchConfirmation(false);
                    setShowManualBranchSelection(true);
                  }}
                  className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                >
                  {t('infoIncorrect')}
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
                <h3 className="text-lg font-bold text-slate-900">{t('selectBranch')}</h3>
                <p className="text-xs text-slate-500">{t('selectBranchPrompt')}</p>
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
                      <p className="text-[10px] text-slate-400 group-hover:text-amber-700/70">{t('tapToSelect')}</p>
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
              <h3 className="text-lg font-bold text-amber-900 mb-1">{t('locationError')}</h3>
              <p className="text-sm text-amber-700/80 px-4">{locationErrorMsg || t('locationErrorPrompt')}</p>
            </div>
            
            <div className="p-6 space-y-3">
              <button
                onClick={() => {
                   setShowLocationError(false);
                   setShowManualBranchSelection(true);
                }}
                className="w-full bg-[#111827] text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {t('selectBranchManual')}
              </button>
              
              <button
                onClick={() => setShowLocationError(false)}
                className="w-full bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
              >
                {t('cancel')}
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

export default function App() {
  return (
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  );
}
