import React, { useState, useEffect, useMemo } from 'react';
import { WeeklyPromotion, CouponInfo } from '../types';
import { db } from '../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { 
  Loader2, Plus, Trash2, LayoutList, ArrowUp, ArrowDown, 
  Ticket, Calendar, Power, Save, Copy, Edit2, Search, 
  CheckCircle2, AlertCircle, Image as ImageIcon
} from 'lucide-react';

const CampaignManager: React.FC = () => {
  const [promotions, setPromotions] = useState<WeeklyPromotion[]>([]);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Derived state for selected promotion
  const selectedPromo = useMemo(() => 
    promotions.find(p => p.id === selectedPromoId) || null
  , [promotions, selectedPromoId]);

  // Filtered promotions for sidebar
  const filteredPromos = useMemo(() => 
    promotions.filter(p => 
      p.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.coupons.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  , [promotions, searchTerm]);

  useEffect(() => {
    const promoRef = collection(db, "promotions");
    const unsubscribe = onSnapshot(promoRef, (querySnapshot) => {
      const firestorePromos = querySnapshot.docs.map(doc => {
        const data = doc.data();
        let startDate: Date;
        let endDate: Date;
        
        if (data.startDate?.toDate) startDate = data.startDate.toDate();
        else if (data.startDate instanceof Date) startDate = data.startDate;
        else startDate = new Date(data.startDate);
        
        if (data.endDate?.toDate) endDate = data.endDate.toDate();
        else if (data.endDate instanceof Date) endDate = data.endDate;
        else endDate = new Date(data.endDate);
        
        return {
          id: doc.id,
          ...data,
          startDate: isNaN(startDate.getTime()) ? new Date() : startDate,
          endDate: isNaN(endDate.getTime()) ? new Date() : endDate,
        } as WeeklyPromotion;
      });

      // Sort by priority
      const sortedPromos = firestorePromos.sort((a, b) => {
        const priorityA = a.priority !== undefined ? a.priority : (a.week || 0);
        const priorityB = b.priority !== undefined ? b.priority : (b.week || 0);
        return priorityA - priorityB;
      });
      
      setPromotions(sortedPromos);
      
      // Select first promo if none selected and we have promos
      if (!selectedPromoId && sortedPromos.length > 0) {
        setSelectedPromoId(sortedPromos[0].id!);
      }
      
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching promotions:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddCampaign = async () => {
    setIsSaving(true);
    try {
      const nextPriority = promotions.length > 0 
        ? Math.max(...promotions.map(p => p.priority || 0)) + 1 
        : 0;
        
      const newPromo: Omit<WeeklyPromotion, 'id'> = {
        week: 0,
        period: 'New Campaign',
        startDate: new Date(),
        endDate: new Date(new Date().setDate(new Date().getDate() + 7)),
        coupons: [],
        isActive: false,
        priority: nextPriority
      };

      const docRef = await addDoc(collection(db, "promotions"), newPromo);
      setSelectedPromoId(docRef.id);
    } catch (error) {
      console.error("Error adding campaign:", error);
      alert('ไม่สามารถเพิ่มแคมเปญได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm('คุณต้องการลบแคมเปญนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) return;
    
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "promotions", id));
      if (selectedPromoId === id) {
        const remaining = promotions.filter(p => p.id !== id);
        setSelectedPromoId(remaining.length > 0 ? remaining[0].id! : null);
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      alert('ไม่สามารถลบแคมเปญได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === promotions.length - 1)) return;

    const newPromos = [...promotions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap positions
    [newPromos[index], newPromos[targetIndex]] = [newPromos[targetIndex], newPromos[index]];
    
    // Update priorities
    const updatedPromos = newPromos.map((p, idx) => ({ ...p, priority: idx }));
    setPromotions(updatedPromos); // Optimistic update

    try {
      const updatePromises = updatedPromos.map(p => 
        updateDoc(doc(db, "promotions", p.id!), { priority: p.priority })
      );
      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error updating order:", error);
      alert('เกิดข้อผิดพลาดในการบันทึกลำดับ');
      // Revert would require re-fetching or keeping previous state
    }
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPromo || !selectedPromo.id) return;

    setIsSaving(true);
    try {
      const { id, ...dataToSave } = selectedPromo;
      await updateDoc(doc(db, "promotions", id), dataToSave);
      alert('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (error) {
      console.error("Error saving campaign:", error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof WeeklyPromotion, value: any) => {
    if (!selectedPromoId) return;
    
    setPromotions(prev => prev.map(p => {
      if (p.id !== selectedPromoId) return p;
      return { ...p, [field]: value };
    }));
  };

  // Coupon Management
  const handleAddCoupon = () => {
    if (!selectedPromoId) return;
    
    const newCoupon: CouponInfo = {
      id: Date.now().toString(),
      name: 'New Coupon',
      cardTitle: 'New Coupon',
      description: 'Description',
      isMemberOnly: false,
      usageLimit: '1 สิทธิ์ / ใบเสร็จ',
      imageUrl: 'https://via.placeholder.com/150',
      validityPeriod: '',
      details: '',
      terms: '',
      targetType: 'all'
    };

    const updatedCoupons = [...(selectedPromo?.coupons || []), newCoupon];
    handleChange('coupons', updatedCoupons);
  };

  const handleUpdateCoupon = (index: number, field: keyof CouponInfo, value: any) => {
    if (!selectedPromo) return;
    
    const updatedCoupons = [...selectedPromo.coupons];
    const updatedCoupon = { ...updatedCoupons[index], [field]: value };

    // Automatically sync isMemberOnly based on targetType
    if (field === 'targetType') {
        updatedCoupon.isMemberOnly = (value === 'members' || value === 'specific');
    }

    updatedCoupons[index] = updatedCoupon;
    handleChange('coupons', updatedCoupons);
  };

  const handleDeleteCoupon = (index: number) => {
    if (!selectedPromo) return;
    if (!window.confirm('ต้องการลบคูปองนี้ใช่หรือไม่?')) return;
    
    const updatedCoupons = selectedPromo.coupons.filter((_, i) => i !== index);
    handleChange('coupons', updatedCoupons);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">จัดการแคมเปญและคูปอง</h3>
          <p className="text-xs text-slate-400 font-medium">สร้างและจัดการโปรโมชั่น คูปอง และเงื่อนไขต่างๆ</p>
        </div>
        <button
          onClick={handleAddCampaign}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-black transition-all shadow-sm"
        >
          <Plus size={16} />
          สร้างแคมเปญใหม่
        </button>
      </div>

      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
        {/* Sidebar List */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col gap-4 h-full overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="ค้นหาแคมเปญ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {filteredPromos.map((promo, index) => (
              <div 
                key={promo.id}
                onClick={() => setSelectedPromoId(promo.id!)}
                className={`p-3 rounded-xl border cursor-pointer transition-all relative group ${selectedPromoId === promo.id ? 'bg-white border-slate-900 shadow-md' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${promo.isActive !== false ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                    <Ticket size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${selectedPromoId === promo.id ? 'text-slate-900' : 'text-slate-600'}`}>
                      {promo.period || 'New Campaign'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${promo.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                      <span className="text-[10px] text-slate-400">
                        {promo.coupons.length} คูปอง
                      </span>
                    </div>
                  </div>
                  
                  {/* Reorder Controls */}
                  {!searchTerm && (
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
                        disabled={index === promotions.length - 1}
                        className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {promotions.length > 1 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(promo.id!); }}
                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    style={{ right: !searchTerm ? '2.5rem' : '0.5rem' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Editor Area */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9 h-full overflow-y-auto custom-scrollbar pb-20">
          {selectedPromo ? (
            <div className="space-y-6">
              {/* Campaign Details Form */}
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-6">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Calendar size={16} className="text-slate-400" />
                    ข้อมูลแคมเปญ
                  </h4>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSavePromo}
                      disabled={isSaving}
                      className="bg-slate-900 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-black transition-all shadow-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      บันทึก
                    </button>
                    <div className="w-px h-6 bg-slate-100 mx-1"></div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                      <span className={`w-2 h-2 rounded-full ${selectedPromo.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                      <span className="text-xs font-bold text-slate-600">{selectedPromo.isActive !== false ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
                    </div>
                    <button
                      onClick={() => handleChange('isActive', !(selectedPromo.isActive !== false))}
                      className={`p-2 rounded-lg transition-colors ${selectedPromo.isActive !== false ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      title={selectedPromo.isActive !== false ? "ปิดแคมเปญ" : "เปิดแคมเปญ"}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อแคมเปญ / ช่วงเวลา</label>
                    <input
                      type="text"
                      value={selectedPromo.period}
                      onChange={(e) => handleChange('period', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none font-bold"
                      placeholder="เช่น Week 1: Summer Sale"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วันที่เริ่มต้น</label>
                    <input
                      type="date"
                      value={selectedPromo.startDate instanceof Date ? selectedPromo.startDate.toISOString().split('T')[0] : ''}
                      onChange={(e) => handleChange('startDate', new Date(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">วันที่สิ้นสุด</label>
                    <input
                      type="date"
                      value={selectedPromo.endDate instanceof Date ? selectedPromo.endDate.toISOString().split('T')[0] : ''}
                      onChange={(e) => handleChange('endDate', new Date(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Coupons List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Ticket size={16} className="text-slate-400" />
                    รายการคูปอง ({selectedPromo.coupons.length})
                  </h4>
                  <button
                    onClick={handleAddCoupon}
                    className="text-xs font-bold text-slate-900 hover:text-slate-600 flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={14} />
                    เพิ่มคูปอง
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {selectedPromo.coupons.map((coupon, index) => (
                    <div key={index} className="bg-white rounded-xl border border-slate-100 p-4 hover:border-slate-300 transition-all group">
                      <div className="flex gap-4 items-start">
                        <div className="w-20 h-20 bg-slate-50 rounded-lg shrink-0 overflow-hidden border border-slate-100 relative group/image">
                          <img src={coupon.imageUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity">
                            <ImageIcon size={16} className="text-white" />
                          </div>
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">ชื่อคูปอง</label>
                              <input
                                type="text"
                                value={coupon.name}
                                onChange={(e) => handleUpdateCoupon(index, 'name', e.target.value)}
                                className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">หัวข้อบัตร</label>
                              <input
                                type="text"
                                value={coupon.cardTitle}
                                onChange={(e) => handleUpdateCoupon(index, 'cardTitle', e.target.value)}
                                className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">รายละเอียด</label>
                            <input
                              type="text"
                              value={coupon.description}
                              onChange={(e) => handleUpdateCoupon(index, 'description', e.target.value)}
                              className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1">กลุ่มเป้าหมาย</label>
                                <select
                                    value={coupon.targetType || 'all'}
                                    onChange={(e) => handleUpdateCoupon(index, 'targetType', e.target.value)}
                                    className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none"
                                >
                                    <option value="all">ทุกคน</option>
                                    <option value="members">สมาชิกเท่านั้น</option>
                                    <option value="specific">ระบุสมาชิก</option>
                                </select>
                            </div>
                            {coupon.targetType === 'specific' && (
                              <div className="col-span-2 md:col-span-4">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1">รหัสสมาชิก (คั่นด้วยคอมมา)</label>
                                <input
                                    type="text"
                                    value={coupon.targetIds ? coupon.targetIds.join(',') : ''}
                                    onChange={(e) => handleUpdateCoupon(index, 'targetIds', e.target.value.split(',').map(id => id.trim()))}
                                    placeholder="เช่น 0812345678, 0987654321"
                                    className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                />
                              </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1">จำกัดสิทธิ์</label>
                                <input
                                    type="text"
                                    value={coupon.usageLimit}
                                    onChange={(e) => handleUpdateCoupon(index, 'usageLimit', e.target.value)}
                                    className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none"
                                />
                            </div>
                             <div className="col-span-2">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1">ลิงก์รูปภาพ</label>
                                <input
                                    type="text"
                                    value={coupon.imageUrl}
                                    onChange={(e) => handleUpdateCoupon(index, 'imageUrl', e.target.value)}
                                    className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none font-mono text-[10px]"
                                />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">เงื่อนไขการใช้งาน (Details)</label>
                              <textarea
                                value={coupon.details}
                                onChange={(e) => handleUpdateCoupon(index, 'details', e.target.value)}
                                rows={3}
                                className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none resize-none"
                                placeholder="รายละเอียดเงื่อนไขการใช้งาน..."
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">ข้อกำหนดและเงื่อนไข (Terms)</label>
                              <textarea
                                value={coupon.terms}
                                onChange={(e) => handleUpdateCoupon(index, 'terms', e.target.value)}
                                rows={3}
                                className="w-full px-2 py-1.5 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-slate-900 outline-none resize-none"
                                placeholder="ข้อกำหนดและเงื่อนไขเพิ่มเติม..."
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteCoupon(index)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button removed from bottom */}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 min-h-[400px]">
              <Ticket size={48} className="mb-4 opacity-50" />
              <p className="font-bold">เลือกแคมเปญเพื่อแก้ไข</p>
              <p className="text-xs">หรือกดปุ่ม "สร้างแคมเปญใหม่" เพื่อเริ่มต้น</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignManager;
