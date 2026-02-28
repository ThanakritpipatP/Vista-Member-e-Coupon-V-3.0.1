import React, { useState } from 'react';
import { UserData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface MemberLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserData) => void;
}

const MemberLoginModal: React.FC<MemberLoginModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [identifier, setIdentifier] = useState('');
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (identifier.length === 10) {
      onSubmit({ identifier });
    }
  };

  const handleClear = () => {
    setIdentifier('');
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm transform transition-all p-6 text-center border border-transparent">
        <h2 className="text-xl font-bold text-gray-900 mb-2 whitespace-pre-line">{t('memberLoginTitle')}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t('memberLoginDesc')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="modal-identifier" className="sr-only">{t('phoneNumber')}</label>
            <div className="relative">
              <input
                id="modal-identifier"
                type="tel"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ''))}
                placeholder={t('placeholderId')}
                className="w-full bg-gray-100 placeholder-gray-400 text-gray-900 rounded-lg py-3 px-4 pr-10 border-2 border-gray-200 focus:border-[#F8B500] focus:ring-1 focus:ring-[#F8B500] focus:outline-none transition-colors duration-200"
                required
                inputMode="tel"
                pattern="[0-9]{10}"
                maxLength={10}
                title={t('placeholderId')}
                autoComplete="tel"
              />
              {identifier.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="pt-2 flex flex-col space-y-3">
            <button
              type="submit"
              className="w-full bg-[#F8B500] text-white font-bold py-3 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={identifier.length !== 10}
            >
              {t('checkPrivilege')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-transparent text-gray-500 font-semibold py-2 px-6 rounded-full hover:bg-gray-100 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MemberLoginModal;
