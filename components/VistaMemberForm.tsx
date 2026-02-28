import React, { useState } from 'react';
import { UserData } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface VistaMemberFormProps {
  onSubmit: (data: UserData) => void;
}

const VistaMemberForm: React.FC<VistaMemberFormProps> = ({ onSubmit }) => {
  const [memberId, setMemberId] = useState('');
  const { t } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (memberId) {
      onSubmit({ identifier: memberId });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="memberId" className="block text-sm font-medium mb-1">{t('memberIdLabel')}</label>
        <input
          id="memberId"
          type="text"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder={t('enterMemberId')}
          className="w-full bg-white/20 placeholder-white/50 rounded-lg py-3 px-4 border-2 border-transparent focus:border-white focus:bg-white/30 focus:outline-none transition-colors duration-200"
          required
          inputMode="text"
        />
      </div>
      <div className="pt-2">
        <button
          type="submit"
          className="w-full bg-white text-[#F8B500] font-bold py-3 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!memberId}
        >
          {t('getCoupon')}
        </button>
      </div>
    </form>
  );
};

export default VistaMemberForm;
