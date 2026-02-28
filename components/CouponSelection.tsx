import React, { useMemo, useState, useRef, useEffect } from 'react';
import { UserStatus, CouponInfo, WeeklyPromotion, AdSettings } from '../types';
import { Search, Bell, History, ChevronRight, ChevronLeft, Zap, Home, Grid, User, LogOut, X, Utensils, ConciergeBell, Package, Store, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

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

const CouponSelection: React.FC<CouponSelectionProps> = ({ 
  entitlement, 
  onSelect, 
  promotions, 
  onLoginClick, 
  usedCouponIds, 
  onViewHistory, 
  memberName, 
  userIdentifier, 
  couponHistory, 
  onLogout 
}) => {
  const { t, language, setLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [ads, setAds] = useState<AdSettings[]>([]);

  useEffect(() => {
    const fetchAdSettings = async () => {
      try {
        const colRef = collection(db, 'ad_slots');
        const snap = await getDocs(colRef);
        
        if (!snap.empty) {
           const loadedAds = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdSettings));
           // Sort by order
           loadedAds.sort((a, b) => (a.order || 0) - (b.order || 0));
           setAds(loadedAds.filter(a => a.isActive));
        } else {
           // Fallback to legacy
           const docRef = doc(db, 'app_settings', 'ad_slot');
           const docSnap = await getDoc(docRef);
           if (docSnap.exists()) {
             const data = docSnap.data() as AdSettings;
             if (data.isActive) {
                setAds([data]);
             }
           }
        }
      } catch (error) {
        console.error("Error fetching ad settings:", error);
      }
    };
    fetchAdSettings();
  }, []);

  const handleAdClick = async (ad: AdSettings) => {
    if (ad.buttonLink) {
      setWebViewUrl(ad.buttonLink);
      
      // Log the click
      try {
        await addDoc(collection(db, 'usage_logs'), {
          type: 'ad_click',
          adId: ad.id || 'unknown',
          adTitle: ad.title || 'Untitled Ad',
          adLink: ad.buttonLink,
          identifier: userIdentifier || 'Guest',
          memberName: memberName || 'Guest',
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
          status: 'clicked'
        });
      } catch (error) {
        console.error("Error logging ad click:", error);
      }
    }
  };

  const allAvailableCoupons = useMemo(() => {
    const now = Date.now();
    const NEAR_EXPIRY_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours

    const coupons = promotions.flatMap(p => {
      const isStarted = now >= p.startDate.getTime();
      const isNearExpiry = isStarted && (p.endDate.getTime() - now) < NEAR_EXPIRY_THRESHOLD;
      
      const filteredCoupons = p.coupons.filter(c => {
        // Filter out used coupons
        if (usedCouponIds.includes(c.id)) return false;

        if (c.isMemberOnly && entitlement !== UserStatus.MEMBER) return false;
        if (c.targetType === 'specific') {
           if (!userIdentifier) return false;
           if (!c.targetIds || c.targetIds.length === 0) return false;
           const normalizedUserId = String(userIdentifier).trim();
           return c.targetIds.some(id => String(id).trim() === normalizedUserId);
        }
        if (c.targetType === 'members') {
            if (entitlement !== UserStatus.MEMBER) return false;
        }
        return true;
      });
        
      return filteredCoupons.map(coupon => ({
        ...coupon,
        isNearExpiry: isNearExpiry,
        isLocked: coupon.isLocked
      }));
    });

    return coupons;
  }, [promotions, entitlement, usedCouponIds, userIdentifier]);

  const filteredCoupons = useMemo(() => {
    if (!searchQuery.trim()) return allAvailableCoupons;
    const lowerQuery = searchQuery.toLowerCase();
    return allAvailableCoupons.filter(coupon => 
      coupon.name.toLowerCase().includes(lowerQuery) ||
      coupon.description.toLowerCase().includes(lowerQuery) ||
      (coupon.cardTitle && coupon.cardTitle.toLowerCase().includes(lowerQuery))
    );
  }, [allAvailableCoupons, searchQuery]);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: false });

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setScrollState({
        canLeft: scrollLeft > 0,
        canRight: scrollLeft < scrollWidth - clientWidth - 10 // buffer
      });
    }
  };

  React.useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [filteredCoupons]);

  const greetingInfo = useMemo(() => {
    const hour = new Date().getHours();
    const name = memberName ? memberName : 'Guest';
    
    if (hour >= 5 && hour < 12) {
      return { main: t('goodMorning'), name: name, sub: t('couponsReady') };
    } else if (hour >= 12 && hour < 17) {
      return { main: t('goodAfternoon'), name: name, sub: t('couponsReady') };
    } else if (hour >= 17 && hour < 21) {
      return { main: t('goodEvening'), name: name, sub: t('couponsReady') };
    } else {
      return { main: t('goodNight'), name: name, sub: t('couponsReady') };
    }
  }, [memberName, t]);

  const activeCouponsCount = allAvailableCoupons.filter(c => !usedCouponIds.includes(c.id)).length;

  return (
    <div className="min-h-screen bg-white pb-24 font-sans w-full">
      {/* Header */}
      <header className="bg-white px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm/50 backdrop-blur-md bg-white/90">
        {isSearchOpen ? (
          <div className="flex items-center w-full gap-2 animate-fade-in">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search') || "Search..."}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#F8B500]/20 text-gray-800"
                autoFocus
              />
            </div>
            <button 
              onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} 
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-amber-50 shrink-0">
                  <img 
                    src="https://img5.pic.in.th/file/secure-sv1/Logo-Vistacafe-037de1ea6dd2bcea96.th.jpg" 
                    alt="Vista Cafe Logo" 
                    className="w-full h-full object-cover"
                  />
               </div>
               <div className="flex flex-col">
                 <h1 className="text-xs font-bold text-gray-500">Vista e-Coupon</h1>
               </div>
            </div>
            <div className="flex gap-3">
               <button 
                 onClick={() => setIsSearchOpen(true)}
                 className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
               >
                 <Search size={20} />
               </button>
               <button 
                onClick={() => setLanguage(language === 'TH' ? 'EN' : 'TH')}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors font-bold text-xs"
               >
                 {language === 'TH' ? 'EN' : 'TH'}
               </button>
               <button className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors relative">
                  <Bell size={20} />
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
               </button>
            </div>
          </>
        )}
      </header>

      <main className="px-6 pt-4 space-y-5 w-full">
        {/* Greeting - Hide when searching */}
        {!isSearchOpen && (
          <div className="animate-fade-in">
             <h2 className="text-[20px] font-bold text-gray-900 leading-[1.1]">
               {greetingInfo.main} <br/>
               <span className="text-gray-900">{t('greeting')} {greetingInfo.name}</span>
             </h2>
             <p className="text-gray-500 text-xs mt-1 font-medium">
               {t('youHave')} <span className="text-[#F8B500] font-bold">{activeCouponsCount} {t('couponsUnit')}</span> {t('readyToUseToday')}
             </p>
          </div>
        )}

        {/* Ad Slot */}
        {!isSearchOpen && ads.length > 0 && (
          <div className="animate-fade-up delay-75">
             <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-6 px-6 no-scrollbar">
               {ads.map((ad, index) => (
                 <div 
                   key={ad.id || index}
                   className="snap-center shrink-0 w-full rounded-2xl p-5 relative overflow-hidden shadow-lg text-white"
                   style={{ 
                     background: `linear-gradient(to right, ${ad.gradientStart}, ${ad.gradientEnd})` 
                   }}
                 >
                    {/* Decorative Circle */}
                    <div className="absolute -right-4 -bottom-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                    <div className="absolute right-4 top-4 w-12 h-12 bg-[#F8B500]/20 rounded-full blur-xl"></div>
                    
                    <div className="relative z-10 flex justify-between items-center">
                        <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span 
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border"
                                    style={{ 
                                        color: ad.badgeColor || '#F8B500',
                                        backgroundColor: ad.badgeBgColor || 'rgba(248, 181, 0, 0.2)',
                                        borderColor: ad.badgeBgColor || 'rgba(248, 181, 0, 0.2)'
                                    }}
                                >
                                    {ad.badgeText || t('specialPromo') || 'Special Promo'}
                                </span>
                            </div>
                            <h3 
                                className="text-lg font-bold mb-1 leading-tight"
                                style={{ color: ad.titleColor || '#FFFFFF' }}
                            >
                                {ad.title || t('adTitle') || 'Summer Super Sale!'}
                            </h3>
                            <p 
                                className="text-xs mb-4 line-clamp-2"
                                style={{ color: ad.descColor || '#94a3b8' }}
                            >
                                {ad.description || t('adDesc') || 'Get 50% off on all premium menu items this weekend only.'}
                            </p>
                            
                            <button 
                                onClick={() => handleAdClick(ad)}
                                className="text-xs font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-colors flex items-center gap-1 active:scale-95"
                                style={{ 
                                    color: ad.buttonTextColor || '#FFFFFF',
                                    backgroundColor: ad.buttonBgColor || '#F8B500',
                                    cursor: ad.buttonLink ? 'pointer' : 'default'
                                }}
                            >
                                {ad.buttonText || t('checkItOut') || 'Check it out'} <ChevronRight size={14} />
                            </button>
                        </div>
                        
                        {/* Image Area */}
                        <div className="w-40 h-40 shrink-0 relative">
                            <img 
                                src={ad.imageUrl || "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=1000&auto=format&fit=crop"}
                                alt="Ad" 
                                className="w-full h-full object-cover rounded-xl shadow-md border-2 border-white/10"
                                onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150')}
                            />
                        </div>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* Recommended Section */}
        <div className="animate-fade-up delay-100 relative group/list">
           <div className="flex justify-between items-end mb-3 px-1">
              <h3 className="text-base font-bold text-gray-900">
                {searchQuery ? t('searchResults') || 'Search Results' : t('recommended')}
              </h3>
              {!searchQuery && (
                <button className="text-[#F8B500] text-xs font-bold hover:text-[#E5A800] transition-colors">{t('seeMore')}</button>
              )}
           </div>

           {/* Navigation Arrows - Only show if not searching (since search results might be few or filtered differently) */}
           {!searchQuery && scrollState.canLeft && (
             <button 
               onClick={() => {
                 if (scrollContainerRef.current) {
                   scrollContainerRef.current.scrollBy({ left: -280, behavior: 'smooth' });
                 }
               }}
               className="absolute left-0 top-[60%] -translate-y-1/2 z-20 w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:text-[#F8B500] hover:scale-110 transition-all"
             >
               <ChevronLeft size={20} />
             </button>
           )}

           {!searchQuery && scrollState.canRight && (
             <button 
               onClick={() => {
                 if (scrollContainerRef.current) {
                   scrollContainerRef.current.scrollBy({ left: 280, behavior: 'smooth' });
                 }
               }}
               className="absolute right-0 top-[60%] -translate-y-1/2 z-20 w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:text-[#F8B500] hover:scale-110 transition-all"
             >
               <ChevronRight size={20} />
             </button>
           )}

           <div 
              ref={scrollContainerRef}
              onScroll={checkScroll}
              className="flex overflow-x-auto gap-4 pb-6 -mx-6 px-6 no-scrollbar snap-x snap-mandatory scroll-smooth"
           >
              {filteredCoupons.length > 0 ? (
                filteredCoupons.map((coupon) => {
                  const isUsed = usedCouponIds.includes(coupon.id);
                  const isLocked = (coupon as any).isLocked;
                  
                  return (
                   <div 
                     key={coupon.id} 
                     className={`min-w-[280px] bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 snap-center overflow-hidden flex flex-col ${isUsed ? 'opacity-60 grayscale' : ''}`}
                   >
                      <div className="relative h-48 w-full group shrink-0">
                         {coupon.imageUrl ? (
                           <img src={coupon.imageUrl} className="w-full h-full object-cover bg-gray-50 transition-transform duration-700 group-hover:scale-105" alt={coupon.name} />
                         ) : (
                           <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 font-bold">No Image</div>
                         )}
                         
                         {/* Badge */}
                         {!isUsed && !isLocked && (coupon.isMemberOnly || coupon.targetType === 'members' || coupon.targetType === 'specific') && (
                           <span className="absolute top-3 right-3 bg-white/95 backdrop-blur text-gray-900 text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm tracking-wide uppercase">
                              {t('member exclusive')}
                           </span>
                         )}
                         
                         {isLocked && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px]">
                                <span className="text-white font-bold flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/20 backdrop-blur-md">
                                    {t('comingSoon')}
                                </span>
                            </div>
                         )}
                      </div>
                      
                      <div className="p-4 flex flex-col flex-grow">
                         <h4 className="font-bold text-gray-900 text-[17px] mb-1 leading-tight truncate">{coupon.name}</h4>
                         <p className="text-gray-500 text-xs mb-4 font-medium line-clamp-2 h-8">
                           {coupon.description}
                         </p>

                         <div className="mt-auto">
                            <button
                              onClick={() => !isUsed && !isLocked && onSelect(coupon)}
                              disabled={isUsed || isLocked}
                              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm ${
                                isUsed
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : isLocked 
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-amber-50 text-[#F8B500] hover:bg-amber-100 hover:shadow-lg hover:shadow-amber-100'
                              }`}
                            >
                               {isUsed ? (
                                 t('used')
                               ) : isLocked ? (
                                 t('locked')
                               ) : (
                                 <>
                                   <Zap size={16} fill="currentColor" className="animate-pulse" /> {t('redeemNow')}
                                 </>
                               )}
                            </button>
                         </div>
                      </div>
                   </div>
                  );
                })
              ) : (
                <div className="w-full text-center py-10 bg-white rounded-[24px] border border-dashed border-gray-200">
                  <p className="text-gray-400 font-medium">{searchQuery ? (t('noSearchResults') || 'No coupons found') : t('noCoupons')}</p>
                </div>
              )}
           </div>
        </div>
        
        {/* Explore Categories (Static Visual) */}
        <div className="pb-32">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('exploreCategories')}</h3>
            <div className="flex justify-between gap-2 overflow-x-auto pb-2 no-scrollbar">
                <CategoryButton icon={<Utensils size={28} />} label={t('menu')} />
                <CategoryButton icon={<ConciergeBell size={28} />} label={t('service')} />
                <CategoryButton icon={<Package size={28} />} label={t('snackbox')} />
                <CategoryButton icon={<Store size={28} />} label={t('branch')} />
            </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2 flex justify-between items-center z-40 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
         <NavButton icon={<Home size={24} />} label={t('home')} active />
         <NavButton icon={<Grid size={24} />} label={t('myCoupons')} />
         <NavButton icon={<History size={24} />} label={t('history')} onClick={onViewHistory} />
         <NavButton icon={<User size={24} />} label={t('profile')} onClick={() => setShowLogoutConfirm(true)} />
      </div>

      {/* WebView Modal */}
      {webViewUrl && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
            <button 
              onClick={() => setWebViewUrl(null)}
              className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
            <h3 className="font-bold text-gray-900 truncate max-w-[200px] text-sm">{webViewUrl}</h3>
            <button 
              onClick={() => window.open(webViewUrl, '_blank')}
              className="p-2 -mr-2 text-[#F8B500] hover:bg-amber-50 rounded-full transition-colors"
            >
              <ExternalLink size={20} />
            </button>
          </div>
          <div className="flex-1 w-full h-full bg-gray-50 relative">
             <iframe 
               src={webViewUrl} 
               className="w-full h-full border-none"
               title="External Content"
               sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
             />
          </div>
        </div>
      )}

      {/* Logout Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-[320px] rounded-[24px] p-6 shadow-2xl transform transition-all scale-100 animate-scale-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 ring-4 ring-red-50">
                <LogOut className="h-8 w-8 text-red-500 ml-1" />
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('logoutConfirmTitle')}</h3>
              <p className="text-gray-500 text-sm mb-6">
                {t('logoutConfirm')}
              </p>
              
              <div className="flex space-x-3 w-full">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors active:scale-95"
                >
                  {t('cancel')}
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
                  {t('logout')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${active ? 'text-[#F8B500]' : 'text-gray-400 hover:text-gray-600'}`}
  >
    {icon}
    <span className={`text-[10px] font-bold ${active ? 'text-[#F8B500]' : 'text-gray-400'}`}>{label}</span>
  </button>
);

const CategoryButton = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
    <div className="flex flex-col items-center gap-2 min-w-[72px]">
        <div className="w-[72px] h-[72px] bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-gray-100 hover:border-amber-200 hover:bg-amber-50 transition-colors cursor-pointer">
            {icon}
        </div>
        <span className="text-[11px] font-bold text-gray-600">{label}</span>
    </div>
);

export default CouponSelection;
