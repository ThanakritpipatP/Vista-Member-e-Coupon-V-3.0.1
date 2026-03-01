
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { UserStatus, CouponInfo, WeeklyPromotion } from '../types';
import Logo from './Logo';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// --- CouponCard component: Optimized with dynamic scaling ---
interface CouponCardProps {
  coupon: CouponInfo & { isLocked?: boolean, promoStartDate?: Date };
  onSelect: (coupon: CouponInfo) => void;
  isUsed?: boolean;
  isNearExpiry?: boolean;
  isActive: boolean; // Added isActive prop
}

const CouponCard: React.FC<CouponCardProps> = ({ coupon, onSelect, isUsed = false, isNearExpiry = false, isActive }) => {
  const isMember = coupon.isMemberOnly;
  const isLocked = coupon.isLocked;
  
  const unlockText = useMemo(() => {
    if (!isLocked) return '';
    if (coupon.activeDay) {
      const monthIndex = new Date().getMonth();
      return `เริ่มใช้ได้วันที่ ${coupon.activeDay} ${THAI_MONTHS[monthIndex]} 69`;
    }
    if (coupon.promoStartDate) {
      const d = coupon.promoStartDate;
      return `เริ่มใช้ได้วันที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} 69`;
    }
    return 'ยังไม่เปิดให้ใช้งาน';
  }, [isLocked, coupon.activeDay, coupon.promoStartDate]);

  // Dynamic Styles based on Active State
  const containerClasses = `inline-block align-top w-[280px] flex-shrink-0 rounded-[32px] overflow-hidden bg-white border border-white snap-center transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
    isActive 
      ? 'scale-100 opacity-100 coupon-shadow z-10' 
      : 'scale-[0.92] opacity-50 z-0 grayscale-[0.3]'
  } ${isLocked ? 'grayscale-[0.8]' : ''}`;

  return (
    <div className={containerClasses}>
      {/* 1. Image Section */}
      <div className="relative aspect-[4/4.4] w-full overflow-hidden bg-[#1A1A1A]">
        {coupon.imageUrl ? (
          <img src={coupon.imageUrl} alt={coupon.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white bg-gradient-to-br from-slate-700 to-slate-900">
            <h1 className="text-4xl brand-logo-text">vista</h1>
            <h1 className="text-4xl brand-logo-text -mt-1">café</h1>
          </div>
        )}
        
        {isMember && (
          <div className="absolute top-4 left-0 z-30">
            <div className="bg-[#F8B500] text-white text-[10px] font-bold pl-4 pr-5 py-1.5 rounded-r-full shadow-lg">
              Member Only
            </div>
          </div>
        )}

        {isLocked && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-40 backdrop-blur-[2px]">
             <div className="bg-white/90 w-14 h-14 rounded-full shadow-2xl mb-4 flex items-center justify-center border border-white/20">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
               </svg>
             </div>
             <div className="bg-black/40 px-5 py-2 rounded-full border border-white/30 backdrop-blur-md shadow-lg mx-4">
               <p className="text-white font-bold text-[12px] whitespace-nowrap overflow-hidden text-ellipsis text-center">
                 {unlockText}
               </p>
             </div>
          </div>
        )}
      </div>

      <div className="relative h-6 flex items-center">
        <div className="absolute left-[-12px] w-6 h-6 rounded-full bg-[#FBF7F0] border-r border-gray-100 shadow-inner"></div>
        <div className="w-full border-t border-dashed border-gray-200 mx-6"></div>
        <div className="absolute right-[-12px] w-6 h-6 rounded-full bg-[#FBF7F0] border-l border-gray-100 shadow-inner"></div>
      </div>

      <div className="px-6 pb-6 flex flex-col">
        <div className="mb-3">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-bold text-[18px] text-gray-900 leading-tight truncate flex-grow pr-2">
              {coupon.cardTitle}
            </h3>
            
            {isNearExpiry && !isLocked && (
              <div className="flex-shrink-0 mt-0.5">
                <div className="bg-gradient-to-r from-[#FF5F6D] to-[#FFC371] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md flex items-center space-x-1 backdrop-blur-sm border border-white/10 whitespace-nowrap animate-pulse">
                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                  <span>ใกล้หมดเวลา</span>
                </div>
              </div>
            )}
          </div>
          
          <p className="text-gray-500 text-[13px] leading-snug line-clamp-1">
            {coupon.description}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="bg-gray-100 text-gray-400 text-[10px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap">
            {coupon.usageLimit}
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) onSelect(coupon);
            }}
            disabled={isLocked}
            className={`relative overflow-hidden flex items-center space-x-2 border-2 px-4 py-1.5 rounded-xl font-bold text-[13px] transition-all active:scale-[0.95] ${
              isLocked
                ? 'border-gray-100 text-gray-300' 
                : 'border-[#F8B500] text-[#F8B500] hover:bg-[#F8B500] hover:text-white'
            }`}
          >
            {!isLocked && (
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full h-full -translate-x-full animate-shimmer pointer-events-none"></div>
            )}
            <span className="relative z-10">
              {isLocked ? 'ยังไม่ถึงเวลา' : 'กดรับสิทธิ์'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- HistoryButton component ---
interface HistoryButtonProps {
  onClick: () => void;
  stats?: { used: number, expired: number, remaining: number };
}

const HistoryButton: React.FC<HistoryButtonProps> = ({ onClick, stats }) => (
  <button 
    onClick={onClick}
    className="relative flex items-center justify-between bg-white text-black p-3 px-4 rounded-[20px] shadow-lg shadow-gray-200/40 border border-white group w-full text-left transition-transform active:scale-[0.98]"
  >
    <div className="flex items-center space-x-3 overflow-hidden">
      <div className="bg-[#64748b] w-10 h-10 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="overflow-hidden">
        <p className="font-bold text-[15px] text-gray-900 leading-tight truncate whitespace-nowrap">ประวัติการใช้คูปอง</p>
        <p className="text-gray-400 text-[11px] truncate whitespace-nowrap">
          {stats 
            ? `ใช้แล้ว ${stats.used} | หมดอายุ ${stats.expired} | คงเหลือ ${stats.remaining}`
            : 'ตรวจสอบคูปองที่ใช้แล้วหรือหมดอายุ'}
        </p>
      </div>
    </div>
    <div className="bg-gray-50 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  </button>
);

interface CouponSelectionProps {
  entitlement: UserStatus.MEMBER | UserStatus.NON_MEMBER;
  onSelect: (coupon: CouponInfo) => void;
  promotions: WeeklyPromotion[];
  onLoginClick: () => void;
  usedCouponIds: string[];
  onViewHistory: () => void;
  memberName?: string | null;
  userIdentifier?: string | null;
  couponHistory: any[];
  onLogout?: () => void;
}

const CouponSelection: React.FC<CouponSelectionProps> = ({ entitlement, onSelect, promotions, onLoginClick, usedCouponIds, onViewHistory, memberName, userIdentifier, couponHistory, onLogout }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const greetingInfo = useMemo(() => {
    const hour = new Date().getHours();
    const name = memberName ? `คุณ${memberName}` : 'คุณลูกค้า';
    
    if (hour >= 5 && hour < 12) {
      return { main: `อรุณสวัสดิ์`, name: name, sub: 'ขอให้วันนี้เป็นเช้าที่สดใส พร้อมรับสิ่งดีๆ นะคะ' };
    } else if (hour >= 12 && hour < 17) {
      return { main: `สวัสดีตอนบ่าย`, name: name, sub: 'พักดื่มเครื่องดื่มเย็นๆ สักแก้ว ให้หายเหนื่อยนะคะ' };
    } else if (hour >= 17 && hour < 21) {
      return { main: `สวัสดีตอนเย็น`, name: name, sub: 'เหนื่อยมาทั้งวัน แวะมาเติมพลังที่ Vista Café นะคะ' };
    } else {
      return { main: `ราตรีสวัสดิ์`, name: name, sub: 'พักผ่อนฝันดี และรักษาด้วยสุขภาพนะคะ' };
    }
  }, [memberName]);
  
  const allAvailableCoupons = useMemo(() => {
    const now = Date.now();
    const NEAR_EXPIRY_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours

    const coupons = promotions.flatMap(p => {
      const isStarted = now >= p.startDate.getTime();
      const isNearExpiry = isStarted && (p.endDate.getTime() - now) < NEAR_EXPIRY_THRESHOLD;
      
      // Filter based on entitlement and targeting
      const filteredCoupons = p.coupons.filter(c => {
        // 1. Check Member Only flag (Basic check)
        if (c.isMemberOnly && entitlement !== UserStatus.MEMBER) return false;

        // 2. Check Target Type (Advanced check)
        if (c.targetType === 'specific') {
           // If specific, user MUST be logged in and their ID must be in the list
           if (!userIdentifier) return false;
           if (!c.targetIds || c.targetIds.length === 0) return false;
           
           // Check if identifier matches any target ID
           // Normalize both to string and trim for safety
           const normalizedUserId = String(userIdentifier).trim();
           return c.targetIds.some(id => String(id).trim() === normalizedUserId);
        }
        
        if (c.targetType === 'member') {
            // Explicit member targeting
            if (entitlement !== UserStatus.MEMBER) return false;
        }

        // Default 'all' or undefined falls through (subject to isMemberOnly check above)
        return true;
      });
        
      return filteredCoupons.map(coupon => ({
        ...coupon,
        isNearExpiry: isNearExpiry
      }));
    });

    return coupons.filter(c => !usedCouponIds.includes(c.id));
  }, [promotions, entitlement, usedCouponIds, userIdentifier]);

  const memberCouponsExist = useMemo(() => promotions.some(p => p.coupons.some(c => c.isMemberOnly)), [promotions]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      // Calculate active index based on the center of the viewport
      // item width (280) + space-x (20) = 300
      const itemFullWidth = 300; 
      const index = Math.round(scrollLeft / itemFullWidth);
      if (index !== activeIndex && index >= 0 && index < allAvailableCoupons.length) {
        setActiveIndex(index);
      }
    }
  };

  const couponStats = useMemo(() => {
    const used = couponHistory.filter(h => h.status === 'Used').length;
    const expired = couponHistory.filter(h => h.status === 'Expired').length;
    const remaining = allAvailableCoupons.length;
    return { used, expired, remaining };
  }, [couponHistory, allAvailableCoupons]);

  if (allAvailableCoupons.length === 0) {
    return (
        <div className="p-10 text-gray-800 w-full text-center flex flex-col items-center justify-center h-full bg-pattern-gray">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Vista <span className="text-[#F8B500]">e-Coupon</span></h1>
            <p className="text-gray-500 mb-10">ขณะนี้ยังไม่มีคูปองใหม่ รอติดตามกิจกรรมในครั้งต่อไปนะคะ</p>
            <div className="w-full max-w-[340px]">
              <HistoryButton onClick={onViewHistory} />
            </div>
        </div>
    );
  }
  
  return (
    <div className="bg-pattern-gray text-gray-800 w-full self-stretch flex flex-col h-full overflow-hidden">
      <header className="pt-10 pb-4 px-6 flex-shrink-0">
        <div className="border-b border-gray-100 pb-3 flex justify-between items-start">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 leading-tight mb-2">
              Vista <span className="text-[#F8B500]">e-Coupon</span>
            </h1>
            
            <div className="animate-fade-up delay-100">
              <h2 className="text-[15.5px] font-bold text-gray-800 leading-tight mb-0.5 flex items-baseline">
                 <span className="opacity-60 font-medium mr-2 text-[12px] flex-shrink-0">{greetingInfo.main}</span>
                 <span 
                  className="text-[#166534] truncate"
                  style={{ fontSize: memberName && memberName.length > 20 ? '13px' : '15.5px' }}
                 >
                   {greetingInfo.name}
                 </span>
              </h2>
              <p className="text-gray-400 text-[10.5px] font-medium leading-none italic opacity-80 whitespace-nowrap overflow-hidden text-ellipsis">
                {greetingInfo.sub}
              </p>
            </div>
          </div>
          
          {entitlement === UserStatus.MEMBER && (
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="ออกจากระบบ"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <main className="flex-grow flex flex-col justify-start overflow-hidden">
        <div className="px-6 mb-6">
           <HistoryButton onClick={onViewHistory} stats={couponStats} />
        </div>

        <div className="flex-grow flex flex-col overflow-hidden">
          <div className="px-6 mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-gray-900 uppercase tracking-wider">คูปองแนะนำสำหรับคุณ</h2>
          </div>
          
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="w-full overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory flex items-start h-full"
          >
            {/* 
                pt-8: Space for cards to scale up without clipping top shadows 
                px-[calc(50%-140px)]: Padding to center the first and last cards 
            */}
            <div className="flex space-x-5 px-[calc(50%-140px)] pt-8 pb-12">
              {allAvailableCoupons.map((coupon, idx) => (
                <CouponCard
                  key={`${coupon.id}-${idx}`}
                  coupon={coupon as any}
                  onSelect={onSelect}
                  isNearExpiry={(coupon as any).isNearExpiry}
                  isActive={idx === activeIndex}
                />
              ))}
            </div>
          </div>

          {allAvailableCoupons.length > 1 && (
            <div className="flex items-center justify-center space-x-2 py-4 flex-shrink-0">
              {allAvailableCoupons.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === activeIndex 
                      ? 'w-8 bg-[#F8B500]' 
                      : 'w-1.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      
      {entitlement === UserStatus.NON_MEMBER && memberCouponsExist && (
        <footer className="px-6 pb-8 pt-2 flex-shrink-0 bg-white/50 backdrop-blur-sm border-t border-white/20">
          <button
            onClick={onLoginClick}
            className="w-full bg-[#111827] text-white font-bold py-4 px-8 rounded-[20px] shadow-xl transition-transform active:scale-[0.98] text-[15px]"
          >
            เข้าสู่ระบบสมาชิกเพื่อรับคูปองเพิ่ม
          </button>
        </footer>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-[320px] rounded-[24px] p-6 shadow-2xl transform transition-all scale-100 animate-scale-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-2">ยืนยันการออกจากระบบ</h3>
              <p className="text-gray-500 text-sm mb-6">
                คุณต้องการออกจากระบบสมาชิกใช่หรือไม่?
              </p>
              
              <div className="flex space-x-3 w-full">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors active:scale-95"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    if (onLogout) {
                      onLogout();
                    } else {
                      localStorage.removeItem('vista_member_token');
                      localStorage.removeItem('vista_member_id');
                      window.location.reload();
                    }
                    setShowLogoutConfirm(false);
                  }}
                  className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 shadow-lg shadow-red-500/30 transition-colors active:scale-95"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponSelection;
