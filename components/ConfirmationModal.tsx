import React from 'react';
import { CouponInfo, Branch } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  coupon: CouponInfo | null;
  isLocating: boolean;
  nearestBranch: Branch | null;
  locationError: string | null;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onConfirm, onCancel, coupon, isLocating, nearestBranch, locationError }) => {
  const { t } = useLanguage();

  if (!isOpen || !coupon) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm transform transition-all p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('confirmCouponSelection')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t('reviewCouponDetails')}</p>

        <div className="bg-gray-50 rounded-lg p-6 text-center w-full mb-6 border border-gray-200 flex items-center justify-center min-h-[100px]">
          <p className="text-lg text-gray-800 font-medium">{coupon.description}</p>
        </div>

        <div className="bg-gray-100 rounded-lg p-3 text-center w-full mb-6">
            <p className="text-xs text-gray-500">{t('nearestBranch')}</p>
            {isLocating ? (
                <p className="font-semibold animate-pulse text-gray-500">{t('searching')}</p>
            ) : locationError ? (
                <p className="font-semibold text-red-500">{locationError}</p>
            ) : nearestBranch ? (
                <p className="font-semibold text-gray-800">{nearestBranch.name}</p>
            ) : (
                <p className="font-semibold text-gray-600">{t('noNearbyBranch')}</p>
            )}
        </div>
        
        <div className="flex flex-col space-y-3">
          <button
            onClick={onConfirm}
            className="w-full bg-[#F8B500] text-white font-bold py-3 px-6 rounded-full shadow-lg transition-transform duration-200 hover:scale-105"
          >
            {t('confirmAndRedeem')}
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-transparent text-gray-500 font-semibold py-2 px-6 rounded-full hover:bg-gray-100 transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
