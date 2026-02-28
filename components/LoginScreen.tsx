
import React, { useState, useEffect } from 'react';
import { UserData } from '../types';
import { ArrowLeft, User, ArrowRight, Facebook, Instagram, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface LoginScreenProps {
  onSubmit: (data: UserData) => void | Promise<void>;
  onRegisterClick: () => void;
  autoLoginId?: string | null;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onSubmit, onRegisterClick, autoLoginId }) => {
  const [identifier, setIdentifier] = useState('');
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  // Auto-fill and Auto-submit with a safer delay if autoLoginId is provided
  useEffect(() => {
    if (autoLoginId && autoLoginId.length === 10) {
      setIdentifier(autoLoginId);
      setIsAutoSubmitting(true);
      
      // Increased delay to 3s to ensure Google Sheets has enough time to sync 
      // the new member record before the validation request arrives.
      const timer = setTimeout(() => {
        onSubmit({ identifier: autoLoginId });
        setIsAutoSubmitting(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [autoLoginId, onSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (identifier.length === 10 && !isAutoSubmitting) {
      onSubmit({ identifier });
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'EN' ? 'TH' : 'EN');
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#FAFAFA] text-gray-800 font-sans">
      
      {/* Header */}
      <header className="flex items-center justify-center py-6 relative">
        <button 
           onClick={toggleLanguage}
           className="absolute right-6 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all active:scale-95"
         >
           <Globe size={14} />
           {language}
         </button>
      </header>

      <div className="flex-1 flex flex-col px-6 pb-8 max-w-md mx-auto w-full">
        
        {/* Hero Card */}
        <div className="w-full aspect-[16/9] rounded-3xl overflow-hidden mb-8 shadow-lg relative bg-white">
          <img 
            src="https://img5.pic.in.th/file/secure-sv1/Logo-Vistacafe-037de1ea6dd2bcea96.jpg" 
            alt="Vista Cafe Logo" 
            className="w-full h-full object-cover"
          />
        </div>

        {/* Welcome Text */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
            {t('welcome')}
          </h2>
          <p className="text-gray-500 text-sm font-medium">
            {t('subTitle')}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="identifier" className="block text-sm font-bold text-gray-900">
              {t('labelId')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="identifier"
                type="tel"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ''))}
                placeholder={t('placeholderId')}
                disabled={isAutoSubmitting}
                className={`block w-full pl-11 pr-4 py-4 bg-white border ${isAutoSubmitting ? 'border-amber-300 bg-amber-50' : 'border-gray-200'} rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F8B500] focus:border-transparent transition-all shadow-sm text-lg`}
                required
                inputMode="tel"
                pattern="[0-9]{10}"
                maxLength={10}
                autoComplete="tel"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={identifier.length !== 10 || isAutoSubmitting}
            className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg shadow-amber-500/20 text-lg font-bold text-white bg-[#F8B500] hover:bg-[#E5A800] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F8B500] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isAutoSubmitting ? t('btnProcessing') : t('btnLogin')}
            {!isAutoSubmitting && <ArrowRight className="ml-2 h-5 w-5" />}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-[#FAFAFA] text-gray-400 font-medium">{t('Have Vista Member?')}</span>
          </div>
        </div>

        {/* Register Button */}
        <button
          type="button"
          onClick={onRegisterClick}
          disabled={isAutoSubmitting}
          className="w-full flex items-center justify-center py-4 px-4 border border-gray-200 rounded-xl text-base font-bold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all active:scale-[0.98] shadow-sm"
        >
          {t('btnRegister')}
        </button>

        {/* Social Login */}
        <div className="mt-8 flex justify-center space-x-6">
          <button className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:bg-gray-50 hover:scale-110 transition-all duration-300 group">
            <Facebook className="w-5 h-5 text-[#1877F2] group-hover:text-[#1877F2]" />
          </button>
          <button className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:bg-gray-50 hover:scale-110 transition-all duration-300 group">
            <Instagram className="w-5 h-5 text-[#E4405F] group-hover:text-[#E4405F]" />
          </button>
          <button className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:bg-gray-50 hover:scale-110 transition-all duration-300 group">
            <svg className="w-5 h-5 text-black group-hover:text-black" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-8 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            {t('footerPrefix')} <a href="#" className="underline hover:text-gray-600">{t('terms')}</a> {t('and')} <a href="#" className="underline hover:text-gray-600">{t('privacy')}</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
