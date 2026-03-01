import React, { useState, useEffect } from 'react';
import { AdSettings } from '../types';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import { Save, Loader2, Image as ImageIcon, Type, Palette, Eye, EyeOff, Plus, Trash2, Megaphone, LayoutList, ArrowUp, ArrowDown } from 'lucide-react';
import DeleteConfirmationModal from './DeleteConfirmationModal';

const DEFAULT_AD_SETTINGS: Omit<AdSettings, 'id'> = {
  badgeText: 'โปรโมชั่นพิเศษ',
  title: 'ซัมเมอร์ ซูเปอร์ เซล!',
  description: 'ลดสูงสุด 50% สำหรับเมนูพรีเมียมทุกรายการ เฉพาะสุดสัปดาห์นี้เท่านั้น',
  buttonText: 'ดูรายละเอียด',
  imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=1000&auto=format&fit=crop',
  gradientStart: '#1e293b',
  gradientEnd: '#0f172a',
  isActive: true,
  badgeColor: '#F8B500',
  badgeBgColor: '#2A2005', // Using hex for consistency
  titleColor: '#FFFFFF',
  descColor: '#94a3b8',
  buttonTextColor: '#FFFFFF',
  buttonBgColor: '#F8B500',
  order: 0
};

const AdSettingsPanel: React.FC = () => {
  const [ads, setAds] = useState<AdSettings[]>([]);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [popup, setPopup] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [adToDelete, setAdToDelete] = useState<string | null>(null);

  // Derived state for the currently selected ad
  const selectedAd = ads.find(a => a.id === selectedAdId) || null;

  useEffect(() => {
    if (popup.show) {
      const timer = setTimeout(() => {
        setPopup(prev => ({ ...prev, show: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [popup.show]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const colRef = collection(db, 'ad_slots');
        const snap = await getDocs(colRef);
        
        if (!snap.empty) {
          const loadedAds = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdSettings));
          // Sort by order
          loadedAds.sort((a, b) => (a.order || 0) - (b.order || 0));
          setAds(loadedAds);
          setSelectedAdId(loadedAds[0].id || null);
        } else {
          // Check legacy single document
          const legacyRef = doc(db, 'app_settings', 'ad_slot');
          const legacySnap = await getDoc(legacyRef);
          
          if (legacySnap.exists()) {
             const legacyData = legacySnap.data() as AdSettings;
             // Migrate to collection
             const newDoc = await addDoc(colRef, { ...legacyData, order: 0 });
             const newAd = { ...legacyData, id: newDoc.id, order: 0 };
             setAds([newAd]);
             setSelectedAdId(newDoc.id);
          } else {
             // Create default
             const newDoc = await addDoc(colRef, DEFAULT_AD_SETTINGS);
             const newAd = { ...DEFAULT_AD_SETTINGS, id: newDoc.id } as AdSettings;
             setAds([newAd]);
             setSelectedAdId(newDoc.id);
          }
        }
      } catch (error) {
        console.error("Error fetching ad settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAd || !selectedAd.id) return;

    setIsSaving(true);
    try {
      const docRef = doc(db, 'ad_slots', selectedAd.id);
      // Remove id from data to be saved
      const { id, ...dataToSave } = selectedAd;
      await updateDoc(docRef, dataToSave);
      setPopup({ show: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว', type: 'success' });
    } catch (error) {
      console.error("Error saving ad settings:", error);
      setPopup({ show: true, message: 'เกิดข้อผิดพลาดในการบันทึก', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSlot = async () => {
    setIsSaving(true);
    try {
        const nextOrder = ads.length > 0 ? Math.max(...ads.map(a => a.order || 0)) + 1 : 0;
        const newAdData = { ...DEFAULT_AD_SETTINGS, order: nextOrder };
        const newDoc = await addDoc(collection(db, 'ad_slots'), newAdData);
        const newAd = { ...newAdData, id: newDoc.id } as AdSettings;
        setAds(prev => [...prev, newAd]);
        setSelectedAdId(newDoc.id);
    } catch (error) {
        console.error("Error adding slot:", error);
        setPopup({ show: true, message: 'ไม่สามารถเพิ่ม Slot ได้', type: 'error' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === ads.length - 1)) return;

    const newAds = [...ads];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap positions in array
    [newAds[index], newAds[targetIndex]] = [newAds[targetIndex], newAds[index]];
    
    // Re-assign order based on new index to ensure consistency
    const updatedAds = newAds.map((ad, idx) => ({ ...ad, order: idx }));
    
    setAds(updatedAds);

    // Update Firestore for all affected items
    try {
        const updatePromises = updatedAds.map(ad => 
            updateDoc(doc(db, 'ad_slots', ad.id!), { order: ad.order })
        );
        await Promise.all(updatePromises);
    } catch (error) {
        console.error("Error updating order:", error);
        setPopup({ show: true, message: 'เกิดข้อผิดพลาดในการบันทึกลำดับ', type: 'error' });
        // Revert state if needed
        setAds(ads); 
    }
  };

  const handleDeleteSlot = (id: string) => {
    setAdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteSlot = async () => {
    if (!adToDelete) return;
    
    setIsSaving(true);
    try {
        await deleteDoc(doc(db, 'ad_slots', adToDelete));
        const newAds = ads.filter(a => a.id !== adToDelete);
        setAds(newAds);
        if (selectedAdId === adToDelete) {
            setSelectedAdId(newAds.length > 0 ? newAds[0].id! : null);
        }
        setPopup({ show: true, message: 'ลบ Slot โฆษณาเรียบร้อยแล้ว', type: 'success' });
    } catch (error) {
        console.error("Error deleting slot:", error);
        setPopup({ show: true, message: 'ไม่สามารถลบ Slot ได้', type: 'error' });
    } finally {
        setIsSaving(false);
        setIsDeleteModalOpen(false);
        setAdToDelete(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAds(prev => prev.map(ad => 
        ad.id === selectedAdId ? { ...ad, [name]: value } : ad
    ));
  };

  const handleToggleActive = () => {
    if (!selectedAdId) return;
    setAds(prev => prev.map(ad => 
        ad.id === selectedAdId ? { ...ad, isActive: !ad.isActive } : ad
    ));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">จัดการโฆษณา</h3>
          <p className="text-xs text-slate-400 font-medium">ปรับแต่งเนื้อหาและรูปแบบของพื้นที่โฆษณาในหน้าคูปอง</p>
        </div>
        <div className="flex items-center gap-3">
            <button
                onClick={handleAddSlot}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-black transition-all shadow-sm"
            >
                <Plus size={16} />
                เพิ่ม Slot โฆษณา
            </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Sidebar List */}
        <div className="col-span-12 md:col-span-3 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <LayoutList size={16} className="text-slate-400" />
                รายการโฆษณา
            </h4>
            <div className="space-y-2">
                {ads.map((ad, index) => (
                    <div 
                        key={ad.id}
                        onClick={() => setSelectedAdId(ad.id!)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all relative group ${selectedAdId === ad.id ? 'bg-white border-slate-900 shadow-md' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-200 overflow-hidden shrink-0">
                                <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${selectedAdId === ad.id ? 'text-slate-900' : 'text-slate-600'}`}>
                                    {ad.title || 'ไม่มีหัวข้อ'}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${ad.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                    <span className="text-[10px] text-slate-400">{ad.isActive ? 'แสดงผล' : 'ซ่อน'}</span>
                                </div>
                            </div>
                            
                            {/* Reorder Controls */}
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={() => handleMoveOrder(index, 'up')}
                                    disabled={index === 0}
                                    className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                >
                                    <ArrowUp size={12} />
                                </button>
                                <button 
                                    onClick={() => handleMoveOrder(index, 'down')}
                                    disabled={index === ads.length - 1}
                                    className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                >
                                    <ArrowDown size={12} />
                                </button>
                            </div>
                        </div>
                        {ads.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteSlot(ad.id!); }}
                                className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                style={{ right: '2.5rem' }} // Adjust position to not overlap with arrows if needed, or keep as is
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* Editor & Preview */}
        <div className="col-span-12 md:col-span-9 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {selectedAd ? (
                <>
                    {/* Form */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6 h-fit">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Megaphone size={16} className="text-slate-400" />
                                แก้ไขข้อมูล
                            </h4>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                    <span className={`w-2 h-2 rounded-full ${selectedAd.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                    <span className="text-xs font-bold text-slate-600">{selectedAd.isActive ? 'แสดงผล' : 'ซ่อน'}</span>
                                </div>
                                <button
                                    onClick={handleToggleActive}
                                    className={`p-2 rounded-lg transition-colors ${selectedAd.isActive ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                    title={selectedAd.isActive ? "ซ่อนโฆษณา" : "แสดงโฆษณา"}
                                >
                                    {selectedAd.isActive ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">เนื้อหาโฆษณา</h4>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">1. ข้อความป้ายกำกับ (Badge)</label>
                                        <input
                                            type="text"
                                            name="badgeText"
                                            value={selectedAd.badgeText}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                            placeholder="เช่น โปรโมชั่นพิเศษ"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">2. หัวข้อ (Title)</label>
                                        <input
                                            type="text"
                                            name="title"
                                            value={selectedAd.title}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold"
                                            placeholder="เช่น Summer Super Sale!"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">3. รายละเอียด (Description)</label>
                                        <textarea
                                            name="description"
                                            value={selectedAd.description}
                                            onChange={handleChange}
                                            rows={3}
                                            className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none"
                                            placeholder="รายละเอียดโปรโมชั่น..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">4. ข้อความปุ่ม (Button Text)</label>
                                        <input
                                            type="text"
                                            name="buttonText"
                                            value={selectedAd.buttonText}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                            placeholder="เช่น ดูรายละเอียด"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">ลิงก์ปุ่ม (Button Link)</label>
                                        <input
                                            type="text"
                                            name="buttonLink"
                                            value={selectedAd.buttonLink || ''}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all font-mono text-xs"
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">การตกแต่ง</h4>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">5. ลิงก์รูปภาพ (Image URL)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                name="imageUrl"
                                                value={selectedAd.imageUrl}
                                                onChange={handleChange}
                                                className="flex-1 px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all font-mono text-xs"
                                                placeholder="https://..."
                                            />
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                <img src={selectedAd.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100')} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">สีเริ่มต้น (Gradient Start)</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    name="gradientStart"
                                                    value={selectedAd.gradientStart}
                                                    onChange={handleChange}
                                                    className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                />
                                                <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.gradientStart}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">สีสิ้นสุด (Gradient End)</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    name="gradientEnd"
                                                    value={selectedAd.gradientEnd}
                                                    onChange={handleChange}
                                                    className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                />
                                                <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.gradientEnd}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Color Customization */}
                                    <div className="pt-4 border-t border-slate-50">
                                        <label className="block text-xs font-bold text-slate-500 mb-3">ปรับแต่งสีข้อความ (Text Colors)</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีป้ายกำกับ (Badge)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="badgeColor"
                                                        value={selectedAd.badgeColor || '#F8B500'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.badgeColor}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีพื้นหลังป้าย (Badge BG)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="badgeBgColor"
                                                        value={selectedAd.badgeBgColor || '#2A2005'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.badgeBgColor}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีหัวข้อ (Title)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="titleColor"
                                                        value={selectedAd.titleColor || '#FFFFFF'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.titleColor}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีรายละเอียด (Desc)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="descColor"
                                                        value={selectedAd.descColor || '#94a3b8'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.descColor}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีข้อความปุ่ม (Button Text)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="buttonTextColor"
                                                        value={selectedAd.buttonTextColor || '#FFFFFF'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.buttonTextColor}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">สีพื้นหลังปุ่ม (Button BG)</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="color"
                                                        name="buttonBgColor"
                                                        value={selectedAd.buttonBgColor || '#F8B500'}
                                                        onChange={handleChange}
                                                        className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                                                    />
                                                    <span className="text-xs font-mono text-slate-400 uppercase">{selectedAd.buttonBgColor}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-50 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all shadow-lg shadow-slate-200 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    บันทึกการเปลี่ยนแปลง
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Preview */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Eye size={16} className="text-slate-400" />
                            ตัวอย่างการแสดงผล (Preview)
                        </h4>
                        
                        <div className="bg-gray-50 p-8 rounded-3xl border border-slate-100 flex items-center justify-center min-h-[400px] sticky top-8">
                            <div className="w-[340px] bg-white rounded-[32px] shadow-2xl overflow-hidden border-[8px] border-slate-900 relative">
                                {/* Mock Status Bar */}
                                <div className="h-6 bg-slate-900 w-full"></div>
                                
                                <div className="p-4 space-y-4 bg-white min-h-[500px]">
                                    {/* Mock Header */}
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-full bg-slate-100"></div>
                                        <div className="space-y-1">
                                            <div className="w-24 h-3 bg-slate-100 rounded"></div>
                                            <div className="w-16 h-2 bg-slate-100 rounded"></div>
                                        </div>
                                    </div>

                                    {/* Ad Component Preview */}
                                    {selectedAd.isActive ? (
                                        <div className="w-full rounded-2xl p-5 relative overflow-hidden shadow-lg text-white"
                                            style={{ background: `linear-gradient(to right, ${selectedAd.gradientStart}, ${selectedAd.gradientEnd})` }}
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
                                                                color: selectedAd.badgeColor || '#F8B500',
                                                                backgroundColor: selectedAd.badgeBgColor || 'rgba(248, 181, 0, 0.2)',
                                                                borderColor: selectedAd.badgeBgColor || 'rgba(248, 181, 0, 0.2)'
                                                            }}
                                                        >
                                                            {selectedAd.badgeText}
                                                        </span>
                                                    </div>
                                                    <h3 
                                                        className="text-lg font-bold mb-1 leading-tight"
                                                        style={{ color: selectedAd.titleColor || '#FFFFFF' }}
                                                    >
                                                        {selectedAd.title}
                                                    </h3>
                                                    <p 
                                                        className="text-xs mb-4 line-clamp-2"
                                                        style={{ color: selectedAd.descColor || '#94a3b8' }}
                                                    >
                                                        {selectedAd.description}
                                                    </p>
                                                    
                                                    <button 
                                                        className="text-xs font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-colors flex items-center gap-1"
                                                        style={{ 
                                                            color: selectedAd.buttonTextColor || '#FFFFFF',
                                                            backgroundColor: selectedAd.buttonBgColor || '#F8B500'
                                                        }}
                                                    >
                                                        {selectedAd.buttonText}
                                                    </button>
                                                </div>
                                                
                                                {/* Image Area */}
                                                <div className="w-36 h-36 shrink-0 relative">
                                                    <img 
                                                        src={selectedAd.imageUrl}
                                                        alt="Ad" 
                                                        className="w-full h-full object-cover rounded-xl shadow-md border-2 border-white/10"
                                                        onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150')}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-medium">
                                            พื้นที่โฆษณาถูกซ่อนอยู่
                                        </div>
                                    )}

                                    {/* Mock Content */}
                                    <div className="space-y-3 pt-4">
                                        <div className="w-32 h-4 bg-slate-100 rounded"></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="h-32 bg-slate-50 rounded-xl"></div>
                                            <div className="h-32 bg-slate-50 rounded-xl"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="col-span-12 md:col-span-9 flex flex-col items-center justify-center h-64 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <LayoutList size={48} className="mb-4 opacity-50" />
                    <p className="font-bold">เลือกรายการโฆษณาเพื่อแก้ไข</p>
                    <p className="text-xs">หรือกดปุ่ม "เพิ่ม Slot โฆษณา" เพื่อสร้างใหม่</p>
                </div>
            )}
        </div>
      </div>
      
      {/* Popup Notification */}
      {popup.show && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-up transition-all ${
          popup.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="p-1 bg-white/20 rounded-full">
            {popup.type === 'success' ? <Save size={18} /> : <Trash2 size={18} />}
          </div>
          <span className="font-bold text-sm">{popup.message}</span>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDeleteSlot}
        title="ลบ Slot โฆษณา"
        message="คุณต้องการลบ Slot โฆษณานี้ใช่หรือไม่? การกระทำนี้ไม่สามารถเรียกคืนได้"
        confirmText="ลบโฆษณา"
        cancelText="ยกเลิก"
      />
    </div>
  );
};

export default AdSettingsPanel;
