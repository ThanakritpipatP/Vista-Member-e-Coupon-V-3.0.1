import React from 'react';
import { CouponHistoryEntry } from '../types';
import Logo from './Logo';
import { useLanguage } from '../contexts/LanguageContext';
import { History } from 'lucide-react';

interface CouponHistoryProps {
  history: CouponHistoryEntry[];
  onBack: () => void;
}

const HistoryItem: React.FC<{ item: CouponHistoryEntry }> = ({ item }) => {
    const { t, language } = useLanguage();
    const { coupon, status, date, couponCode } = item;
    const statusText = status === 'Used' ? t('used') : t('expired');
    const statusColor = status === 'Used' 
        ? 'text-green-600 bg-green-100' 
        : 'text-gray-600 bg-gray-200';
    const formattedDate = new Date(date).toLocaleString(language === 'TH' ? 'th-TH' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden flex p-4 items-start relative space-x-4 border border-transparent">
            <div className="w-16 h-16 flex-shrink-0 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                {coupon.imageUrl ? (
                    <img src={coupon.imageUrl} alt={coupon.name} className="w-full h-full object-cover" />
                ) : (
                    <Logo className="w-10 h-10 text-gray-500" />
                )}
            </div>
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-800 text-base leading-tight pr-2">{coupon.cardTitle}</h3>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColor}`}>{statusText}</span>
                </div>
                <p className="text-gray-600 text-sm mt-1">{coupon.description}</p>
                <p className="text-gray-500 text-xs mt-2">{formattedDate}</p>
                <p className="text-gray-500 text-xs mt-1">{t('code')}: <span className="font-mono">{couponCode}</span></p>
            </div>
        </div>
    );
};

const CouponHistory: React.FC<CouponHistoryProps> = ({ history, onBack }) => {
  const { t } = useLanguage();
  return (
    <div className="w-full bg-white flex flex-col h-full self-stretch">
      <header className="flex items-center justify-between p-4 bg-white shadow-sm sticky top-0 z-20 flex-shrink-0 border-b border-transparent">
        <button onClick={onBack} aria-label={t('back')} className="text-gray-600 hover:text-gray-900 p-2 -ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-800">{t('couponHistory')}</h1>
        <div className="w-6"></div> {/* Spacer to center title */}
      </header>

      <main className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-gray-500 h-full pt-20">
            <History className="h-16 w-16 text-gray-400 mb-4" strokeWidth={1.5} />
            <h2 className="text-xl font-semibold text-gray-700">{t('noHistory')}</h2>
            <p className="mt-1">{t('noHistoryDesc')}</p>
          </div>
        ) : (
          history.map((item, index) => <HistoryItem key={`${item.coupon.id}-${index}`} item={item} />)
        )}
      </main>
    </div>
  );
};

export default CouponHistory;
