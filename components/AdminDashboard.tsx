
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CouponInfo, Branch, WeeklyPromotion } from '../types';
import { PROMOTIONS, VISTA_BRANCHES } from '../constants';
import { getUsageLogs, importLogsFromCSV, getCouponsFromFirestore, addCouponToFirestore, updateCouponInFirestore, deleteCouponFromFirestore, cleanupDuplicateLogs, getMembers, updateMemberInFirestore, getMemberUsageLogs, deleteAllUsageLogs, fixMissingTimestamps } from '../services/api';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, onSnapshot, query, orderBy, limit, writeBatch, where } from 'firebase/firestore';
import { LayoutDashboard, Ticket, Users, BarChart3, Settings, Plus, Edit2, Trash2, Search, ChevronRight, ChevronLeft, Upload, Loader2, CheckCircle2, AlertCircle, RefreshCw, X, Calendar, Clock, TrendingUp, MapPin, Copy, Power, MoreVertical, ExternalLink, History, ArrowUp, Download, Megaphone, Phone } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart as RePieChart, Pie, Cell, Legend, AreaChart, Area 
} from 'recharts';
import AdSettingsPanel from './AdSettingsPanel';
import CampaignManager from './CampaignManager';

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'customers' | 'analytics' | 'system' | 'audit' | 'ads'>('dashboard');
  const [promotions, setPromotions] = useState<WeeklyPromotion[]>([]);
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isFixingData, setIsFixingData] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentCustomerPage, setCurrentCustomerPage] = useState(1);
  const [currentAuditPage, setCurrentAuditPage] = useState(1);
  const itemsPerPage = 30;
  const [operationProgress, setOperationProgress] = useState<{ current: number, total: number, message: string } | null>(null);
  const [importStatus, setImportStatus] = useState<{ success: number, failed: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Create a mapping of identifiers to real member names from Firebase
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach(m => {
      const firstName = m.firstName || '';
      const lastName = m.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'สมาชิก Vista Café';
      
      const addId = (id: any) => {
        if (!id) return;
        const s = String(id).trim();
        if (!s) return;
        map.set(s, fullName);
        const digits = s.replace(/\D/g, '');
        if (digits) {
          map.set(digits, fullName);
          if (digits.startsWith('0')) {
            map.set(digits.substring(1), fullName);
          } else if (digits.length === 9) {
            map.set('0' + digits, fullName);
          }
        }
      };

      addId(m.id);
      addId(m.phone);
      addId(m.contactPhone);
      addId(m.memberId);
      addId(m.phoneNumber);
    });
    return map;
  }, [members]);

  const getMemberDisplayName = (log: any) => {
    if (!log.identifier || log.identifier === 'Guest') return 'Guest';
    
    const cleanId = log.identifier.replace(/\D/g, '');
    // Try lookup by various identifier formats
    const realName = memberMap.get(log.identifier) || 
                     memberMap.get(cleanId) || 
                     memberMap.get('0' + cleanId) || 
                     (cleanId.startsWith('0') ? memberMap.get(cleanId.substring(1)) : null);
    
    return realName || log.memberName || 'Guest';
  };
  const [editingMember, setEditingMember] = useState<any>(null);
  const [viewingMemberHistory, setViewingMemberHistory] = useState<any>(null);
  const [memberHistoryLogs, setMemberHistoryLogs] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<'history' | 'unused'>('history');
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const couponUsageLogs = useMemo(() => {
    return usageLogs.filter(log => log.type !== 'ad_click');
  }, [usageLogs]);

  // Helper to format date for HTML date inputs (YYYY-MM-DD) using local time
  const formatLocalDate = (date: any) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [analyticsRange, setAnalyticsRange] = useState<{ start: string, end: string }>({
    start: formatLocalDate(Date.now() - 13 * 24 * 60 * 60 * 1000),
    end: formatLocalDate(Date.now())
  });
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [targetBranchForMigration, setTargetBranchForMigration] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [selectedCouponId, setSelectedCouponId] = useState<string>('all');
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'campaign' | 'coupon' | null;
    id: string | null;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: null,
    id: null,
    title: '',
    message: '',
    confirmText: 'ยืนยันการลบ'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isClearingAdStats, setIsClearingAdStats] = useState(false);

  const handleClearAdStats = () => {
    // Check if there are any ad clicks to delete
    const hasAdClicks = usageLogs.some(log => log.type === 'ad_click');
    if (!hasAdClicks) {
        alert('ไม่พบข้อมูลสถิติโฆษณาในระบบ');
        return;
    }

    setDeleteModal({
      isOpen: true,
      type: null,
      id: 'clear_ad_stats',
      title: 'ยืนยันการลบสถิติ',
      message: 'คุณต้องการลบสถิติการคลิกโฆษณาทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
      confirmText: 'ลบข้อมูล',
      onConfirm: async () => {
        setIsClearingAdStats(true);
        try {
          const q = query(collection(db, 'usage_logs'), where('type', '==', 'ad_click'));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            alert('ไม่พบข้อมูลสถิติโฆษณา');
            setIsClearingAdStats(false);
            return;
          }

          const total = snapshot.docs.length;
          let deletedCount = 0;
          const BATCH_SIZE = 400; // Safe limit below 500
          
          // Process in chunks
          for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
            
            chunk.forEach(doc => {
              // Double safety check: Verify client-side that this is indeed an ad_click log
              const data = doc.data();
              if (data.type === 'ad_click') {
                batch.delete(doc.ref);
              }
            });
            
            await batch.commit();
            deletedCount += chunk.length;
          }
          
          await fetchLogs(); // Refresh data
          alert(`ลบสถิติเรียบร้อยแล้ว (${deletedCount} รายการ)`);
        } catch (error) {
          console.error('Error clearing ad stats:', error);
          alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setIsClearingAdStats(false);
        }
      }
    });
  };

  useEffect(() => {
    fetchLogs();
    fetchMembers();
    
    // Real-time audit logs listener
    const auditRef = collection(db, "audit_logs");
    const unsubscribeAudit = onSnapshot(auditRef, (querySnapshot) => {
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(doc.data().timestamp)
      })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setAuditLogs(logs);
    });
    
    // Real-time promotions listener
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
        };
      });

      // Only merge with default promotions if Firestore is empty
      // This prevents deleted campaigns from reappearing as undeletable "default data"
      const mergedPromos = [...firestorePromos];
      if (firestorePromos.length === 0) {
        PROMOTIONS.forEach(defaultPromo => {
          mergedPromos.push(defaultPromo as any);
        });
      }
      
      const sortedPromos = mergedPromos.sort((a: any, b: any) => {
        const priorityA = a.priority !== undefined ? a.priority : (a.week || 0);
        const priorityB = b.priority !== undefined ? b.priority : (b.week || 0);
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        const timeA = a.startDate instanceof Date ? a.startDate.getTime() : new Date(a.startDate).getTime();
        const timeB = b.startDate instanceof Date ? b.startDate.getTime() : new Date(b.startDate).getTime();
        return timeA - timeB;
      });
      
      setPromotions(sortedPromos as any);
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to promotions:", error);
      setPromotions(PROMOTIONS);
      setIsLoading(false);
    });

    // Real-time usage logs listener
    const usageLogsRef = collection(db, "usage_logs");
    const q = query(usageLogsRef, orderBy("timestamp", "desc"));
    const unsubscribeUsage = onSnapshot(q, (querySnapshot) => {
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsageLogs(logs);
    }, (error) => {
      console.error("Error listening to usage logs:", error);
      // Fallback if index is missing
      onSnapshot(usageLogsRef, (querySnapshot) => {
        const logs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a: any, b: any) => {
          const getLogTime = (log: any) => {
            if (log.timestamp?.toDate) return log.timestamp.toDate().getTime();
            if (log.timestamp?.seconds) return log.timestamp.seconds * 1000;
            if (log.createdAt) {
              const d = new Date(log.createdAt);
              return isNaN(d.getTime()) ? 0 : d.getTime();
            }
            return 0;
          };
          return getLogTime(b) - getLogTime(a);
        });
        setUsageLogs(logs);
      });
    });

    return () => {
      unsubscribe();
      unsubscribeAudit();
      unsubscribeUsage();
    };
  }, []);

  useEffect(() => {
    if (importStatus) {
      const timer = setTimeout(() => {
        setImportStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [importStatus]);

  const addAuditLog = async (action: string, details: string, targetId?: string, targetType?: string) => {
    try {
      const adminUser = auth.currentUser;
      const adminName = adminUser?.email || adminUser?.displayName || 'Admin';
      
      await addDoc(collection(db, "audit_logs"), {
        action,
        details,
        targetId: targetId || null,
        targetType: targetType || null,
        adminName: adminName,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Error adding audit log:", error);
    }
  };

  const executeDelete = async () => {
    const { type, id, onConfirm } = deleteModal;
    
    if (onConfirm) {
      await onConfirm();
      setDeleteModal(prev => ({ ...prev, isOpen: false }));
      return;
    }

    setDeleteModal(prev => ({ ...prev, isOpen: false }));
  };

  const fetchMembers = async () => {
    setIsLoading(true);
    const data = await getMembers();
    setMembers(data);
    setMemberCount(data.length);
    setIsLoading(false);
  };

  const handleEditMember = (member: any) => {
    setEditingMember(member);
    setIsMemberModalOpen(true);
  };

  const handleViewMemberHistory = async (member: any) => {
    setViewingMemberHistory(member);
    setHistoryTab('history');
    setIsHistoryModalOpen(true);
    setIsLoading(true);
    
    // Collect all possible IDs for the member to search in usage history
    const possibleIds = [
      member.memberId,
      member.identifier,
      member.id,
      member.contactPhone,
      member.phoneNumber,
      member.phone
    ].filter(id => id && typeof id === 'string' && id.trim() !== '');

    // Remove duplicates
    const uniqueIds = [...new Set(possibleIds)];

    const logs = await getMemberUsageLogs(uniqueIds);
    setMemberHistoryLogs(logs);
    setIsLoading(false);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    
    const formData = new FormData(e.target as HTMLFormElement);
    const firstNameRaw = formData.get('firstName');
    const lastNameRaw = formData.get('lastName');
    const phoneRaw = formData.get('phone');
    const emailRaw = formData.get('email');
    const lineIdRaw = formData.get('lineId');
    const birthDateRaw = formData.get('birthDate');
    const pointsRaw = formData.get('points');
    const addressRaw = formData.get('address');
    
    const firstName = typeof firstNameRaw === 'string' ? firstNameRaw : '';
    const lastName = typeof lastNameRaw === 'string' ? lastNameRaw : '';
    const phone = typeof phoneRaw === 'string' ? phoneRaw : '';
    const email = typeof emailRaw === 'string' ? emailRaw : '';
    const lineId = typeof lineIdRaw === 'string' ? lineIdRaw : '';
    const birthDate = typeof birthDateRaw === 'string' ? birthDateRaw : '';
    const points = typeof pointsRaw === 'string' ? parseInt(pointsRaw) || 0 : 0;
    const address = typeof addressRaw === 'string' ? addressRaw : '';

    // Prepare data for update, referencing existing fields in database
    const updatedData: any = {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone,
      email,
      lineId,
      birthDate,
      points,
      address
    };

    // Check if there are other phone number fields, sync them to avoid creating new fields
    if (editingMember.phoneNumber !== undefined) updatedData.phoneNumber = phone;
    if (editingMember.contactPhone !== undefined) updatedData.contactPhone = phone;

    try {
      await updateMemberInFirestore(editingMember.id, updatedData);
      await addAuditLog('Update Member', `Updated member info for "${updatedData.name}" (${editingMember.id})`, editingMember.id, 'member');
      alert('บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว');
      setIsMemberModalOpen(false);
      fetchMembers();
    } catch (error) {
      console.error("Save member failed:", error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    const logs = await getUsageLogs();
    setUsageLogs(logs);
    setIsLoading(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; 
      
      // Manually format to ensure "DD MMM, YYYY HH:mm"
      const day = String(date.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day} ${month}, ${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateStr;
    }
  };

  const syncPromotionsToFirestore = async () => {
    setDeleteModal({
      isOpen: true,
      type: null,
      id: 'sync',
      title: 'ยืนยันการซิงค์ข้อมูล',
      message: 'คุณต้องการนำเข้าข้อมูลโปรโมชั่นเริ่มต้นไปยัง Firestore ใช่หรือไม่? ระบบจะตรวจสอบและเพิ่มเฉพาะรายการที่ยังไม่มีในฐานข้อมูล',
      confirmText: 'ยืนยันการซิงค์',
      onConfirm: async () => {
        setIsSyncing(true);
        setOperationProgress({ current: 0, total: PROMOTIONS.length, message: 'กำลังเริ่มการซิงค์ข้อมูล...' });
        try {
          const promoRef = collection(db, "promotions");
          const querySnapshot = await getDocs(promoRef);
          const existingPromos = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              week: data.week,
              startDate: data.startDate?.toDate ? data.startDate.toDate().getTime() : new Date(data.startDate).getTime()
            };
          });
          
          let addedCount = 0;
          for (let i = 0; i < PROMOTIONS.length; i++) {
            const promo = PROMOTIONS[i];
            setOperationProgress({ current: i + 1, total: PROMOTIONS.length, message: `กำลังซิงค์: ${promo.period}` });
            
            const promoStartTime = promo.startDate.getTime();
            const isExisting = existingPromos.some(p => p.week === promo.week && p.startDate === promoStartTime);

            if (!isExisting) {
              await addDoc(promoRef, {
                ...promo,
                startDate: promo.startDate,
                endDate: promo.endDate,
                priority: promo.priority || promo.week || 0,
                createdAt: serverTimestamp(),
                isActive: true
              });
              addedCount++;
            }
          }
          alert(`ซิงค์ข้อมูลสำเร็จ! เพิ่มข้อมูลใหม่ ${addedCount} รายการ`);
          await addAuditLog('Sync Promotions', `Synced ${addedCount} default promotions to Firestore`, 'sync', 'system');
        } catch (error) {
          console.error("Sync failed:", error);
          alert('การซิงค์ล้มเหลว: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          setIsSyncing(false);
          setOperationProgress(null);
        }
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').map(row => row.split(','));
      
      const headers = rows[0].map(h => h.trim());
      const dataRows = rows.slice(1).filter(row => row.length > 1);

      const logsToImport = dataRows.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          const h = header.trim();
          let key = h;
          
          // Use includes for flexibility with Thai/English headers
          if (h.includes('วัน/เวลา') || h.toLowerCase().includes('date')) key = 'createdAt';
          else if (h.includes('เวลา') || h.toLowerCase() === 'time') key = 'timeOnly';
          else if (h.includes('หมายเลขสมาชิก') || h.toLowerCase().includes('member id')) key = 'identifier';
          else if (h.includes('ชื่อ-นามสกุล') || h.toLowerCase().includes('name')) key = 'memberName';
          else if (h.includes('รหัสคูปอง') || h.toLowerCase().includes('coupon code')) key = 'couponCode';
          else if (h.includes('ชื่อคูปอง') || h.toLowerCase().includes('coupon name') || h.toLowerCase() === 'coupon') key = 'couponName';
          else if (h.includes('รายละเอียด') || h.toLowerCase().includes('description')) key = 'couponDescription';
          else if (h.includes('สาขา') || h.toLowerCase().includes('branch')) key = 'branchName';
          else if (h.includes('สถานะ') || h.toLowerCase().includes('status')) key = 'status';
          
          let val = row[index]?.trim() || '';
          
          if (key === 'createdAt' && val) {
            // Robust date parsing for CSV - Prioritize DD/MM/YYYY for Thai context
            try {
              let d: Date | null = null;
              const parts = val.split(/[\/\-\s:]/);
              
              if (parts.length >= 3) {
                let day = parseInt(parts[0]);
                let month = parseInt(parts[1]) - 1;
                let year = parseInt(parts[2]);
                
                // Basic validation to ensure it's likely DD/MM/YYYY
                // If day > 12, it must be the day. If month > 12, it's invalid or a different format.
                if (day > 0 && day <= 31 && month >= 0 && month < 12) {
                  if (year > 2400) year -= 543; // Handle Buddhist Era
                  if (year < 100) year += 2000;
                  
                  // Create date and check if it's valid
                  const testDate = new Date(year, month, day);
                  if (!isNaN(testDate.getTime())) {
                    // If there's time info in parts[3], [4] etc.
                    if (parts.length >= 5) {
                      testDate.setHours(parseInt(parts[3]) || 0);
                      testDate.setMinutes(parseInt(parts[4]) || 0);
                      testDate.setSeconds(parseInt(parts[5]) || 0);
                    }
                    d = testDate;
                  }
                }
              }
              
              // Fallback to native parsing if manual parsing didn't work
              if (!d || isNaN(d.getTime())) {
                d = new Date(val);
              }
              
              if (d && !isNaN(d.getTime())) {
                val = d.toISOString();
              }
            } catch (e) {
              console.warn("Date parsing failed for:", val);
            }
          }
          
          if (key === 'identifier') {
            const digitsOnly = val.replace(/\D/g, '');
            if (digitsOnly.length === 9) {
              val = '0' + digitsOnly;
            } else {
              val = digitsOnly || val;
            }
          }
          
          obj[key] = val;
        });

        // Combine Date and Time if separate
        if (obj.createdAt && obj.timeOnly) {
            try {
                const dateObj = new Date(obj.createdAt);
                const timeParts = obj.timeOnly.split(':');
                if (!isNaN(dateObj.getTime()) && timeParts.length >= 2) {
                    dateObj.setHours(parseInt(timeParts[0]) || 0);
                    dateObj.setMinutes(parseInt(timeParts[1]) || 0);
                    dateObj.setSeconds(parseInt(timeParts[2]) || 0);
                    obj.createdAt = dateObj.toISOString();
                }
            } catch (e) {
                console.warn("Failed to combine date and time:", e);
            }
        }

        // Additional status check: if no status but "Expired" is found in other fields
        if (!obj.status || obj.status === '') {
          if (JSON.stringify(obj).includes('Expired')) {
            obj.status = 'Expired';
          } else {
            obj.status = 'Used'; // Default if not specified
          }
        }

        // Fallback for couponCode if missing
        if (!obj.couponCode && obj.couponName) {
            obj.couponCode = obj.couponName;
        }

        return obj;
      });

      setOperationProgress({ current: 0, total: logsToImport.length, message: 'กำลังนำเข้าข้อมูล...' });
      try {
        const chunkSize = 100;
        let success = 0;
        let failed = 0;
        
        for (let i = 0; i < logsToImport.length; i += chunkSize) {
          const chunk = logsToImport.slice(i, i + chunkSize);
          const result = await importLogsFromCSV(chunk);
          success += result.success;
          failed += result.failed;
          setOperationProgress(prev => prev ? { ...prev, current: Math.min(i + chunkSize, logsToImport.length) } : null);
        }
        
        setImportStatus({ success, failed });
        fetchLogs();
      } catch (error) {
        console.error('Import failed:', error);
        alert('การนำเข้าข้อมูลล้มเหลว');
      } finally {
        setIsImporting(false);
        setOperationProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCleanup = async () => {
    setDeleteModal({
      isOpen: true,
      type: null,
      id: 'cleanup',
      title: 'ยืนยันการล้างข้อมูลซ้ำ',
      message: 'คุณต้องการลบประวัติการใช้งานที่ซ้ำกันใช่หรือไม่? ระบบจะตรวจสอบจาก รหัสสมาชิก, รหัสคูปอง และเวลาที่ใช้งาน',
      confirmText: 'ยืนยันการล้างข้อมูล',
      onConfirm: async () => {
        setIsCleaning(true);
        setOperationProgress({ current: 0, total: 0, message: 'กำลังล้างข้อมูลที่ซ้ำกัน...' });
        try {
          const result = await cleanupDuplicateLogs();
          alert(`ลบข้อมูลที่ซ้ำกันสำเร็จทั้งหมด ${result.deleted} รายการ`);
          fetchLogs();
        } catch (error) {
          console.error("Cleanup failed:", error);
          alert('การล้างข้อมูลล้มเหลว');
        } finally {
          setIsCleaning(false);
          setOperationProgress(null);
        }
      }
    });
  };

  const handleDeleteAllLogs = async () => {
    setDeleteModal({
      isOpen: true,
      type: null,
      id: 'delete-all',
      title: 'ยืนยันการลบข้อมูลทั้งหมด',
      message: 'คำเตือน: คุณต้องการลบประวัติการใช้งาน "ทั้งหมด" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้ และข้อมูลจะถูกลบออกจากระบบอย่างถาวร',
      confirmText: 'ยืนยันลบทั้งหมด',
      onConfirm: async () => {
        setIsDeletingAll(true);
        setOperationProgress({ current: 0, total: 100, message: 'กำลังลบข้อมูลทั้งหมดจาก Firebase...' });
        try {
          const result = await deleteAllUsageLogs();
          alert(`ลบข้อมูลทั้งหมดสำเร็จ: ลบไปทั้งหมด ${result.deleted} รายการ`);
          fetchLogs();
        } catch (error) {
          console.error("Delete all failed:", error);
          alert('การลบข้อมูลล้มเหลว');
        } finally {
          setIsDeletingAll(false);
          setOperationProgress(null);
        }
      }
    });
  };

  const handleFixData = async () => {
    setIsFixingData(true);
    setOperationProgress({ current: 0, total: 100, message: 'กำลังตรวจสอบและแก้ไขข้อมูล...' });
    try {
      const result = await fixMissingTimestamps();
      await addAuditLog('Fix Data', `Fixed missing timestamps for ${result.fixed} logs`, null, 'system');
      alert(`แก้ไขข้อมูลเรียบร้อยแล้ว ${result.fixed} รายการ`);
      fetchLogs();
    } catch (error) {
      console.error("Fix data failed:", error);
      alert('เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
    } finally {
      setIsFixingData(false);
      setOperationProgress(null);
    }
  };



  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setShowScrollTop(contentRef.current.scrollTop > 400);
      }
    };
    
    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (contentElement) {
        contentElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage, currentCustomerPage, currentAuditPage, activeTab]);

  const stats = [
    { label: 'คูปองที่ใช้งานแล้วทั้งหมด', value: usageLogs.length.toString(), icon: Ticket, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'สมาชิกในระบบ', value: memberCount.toString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'สาขาที่เปิดให้บริการ', value: VISTA_BRANCHES.length.toString(), icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  // Analytics Data Processing
   const getAnalyticsData = () => {
    // Separate logs
    const couponLogs = usageLogs.filter(l => l.type !== 'ad_click');
    const adLogs = usageLogs.filter(l => l.type === 'ad_click');

    // Filter logs by branch first if selected
    let filteredBaseLogs = selectedBranch === 'all' 
      ? couponLogs 
      : couponLogs.filter(log => log.branchName === selectedBranch);

    // Filter by Campaign
    if (selectedCampaignId !== 'all') {
      const campaign = promotions.find(p => p.id === selectedCampaignId);
      if (campaign) {
        const couponIds = new Set(campaign.coupons.map(c => c.id));
        filteredBaseLogs = filteredBaseLogs.filter(log => couponIds.has(log.couponId));
      }
    }

    // Filter by Coupon
    if (selectedCouponId !== 'all') {
      filteredBaseLogs = filteredBaseLogs.filter(log => log.couponId === selectedCouponId);
    }

    // 1. Redemption by Day (Based on selected range)
    const startDate = new Date(analyticsRange.start);
    const endDate = new Date(analyticsRange.end);
    
    // Calculate number of days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const days = [...Array(Math.min(diffDays, 90))].map((_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      return formatLocalDate(d);
    });

    const dailyData = days.map(date => {
      const count = filteredBaseLogs.filter(log => {
        try {
          // Handle both ISO string and Firestore Timestamp
          let d: Date | null = null;
          if (log.timestamp?.toDate) {
            d = log.timestamp.toDate();
          } else if (log.createdAt) {
            d = new Date(log.createdAt);
          }
          
          if (!d || isNaN(d.getTime())) return false;
          
          const logDate = formatLocalDate(d);
          const status = (log.status || '').toLowerCase();
          const isSuccess = status === 'used' || status === 'ใช้แล้ว' || status === 'success' || status === 'สำเร็จ';
          
          return logDate === date && isSuccess;
        } catch (e) {
          return false;
        }
      }).length;
      
      const d = new Date(date);
      const formattedDate = isNaN(d.getTime()) ? date : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      return { name: formattedDate, count };
    });

    // Filter usage logs for the selected range for other charts too
    const filteredLogs = filteredBaseLogs.filter(log => {
      try {
        let d: Date | null = null;
        if (log.timestamp?.toDate) {
          d = log.timestamp.toDate();
        } else if (log.createdAt) {
          d = new Date(log.createdAt);
        }
        if (!d || isNaN(d.getTime())) return false;
        const logDate = formatLocalDate(d);
        return logDate >= analyticsRange.start && logDate <= analyticsRange.end;
      } catch (e) {
        return false;
      }
    });

    // 2. Redemption by Coupon
    const couponCounts: Record<string, number> = {};
    filteredLogs.forEach(log => {
      const status = (log.status || '').toLowerCase();
      const isSuccess = status === 'used' || status === 'ใช้แล้ว' || status === 'success' || status === 'สำเร็จ';
      if (isSuccess) {
        const name = log.couponName || 'Unknown';
        couponCounts[name] = (couponCounts[name] || 0) + 1;
      }
    });
    const couponData = Object.entries(couponCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 3. Redemption by Branch
    const branchCounts: Record<string, number> = {};
    filteredLogs.forEach(log => {
      const status = (log.status || '').toLowerCase();
      const isSuccess = status === 'used' || status === 'ใช้แล้ว' || status === 'success' || status === 'สำเร็จ';
      if (isSuccess) {
        const name = log.branchName || 'ไม่ระบุสาขา';
        branchCounts[name] = (branchCounts[name] || 0) + 1;
      }
    });
    const branchData = Object.entries(branchCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Status Distribution
    const statusCounts = {
      Used: filteredLogs.filter(l => {
        const s = (l.status || '').toLowerCase();
        return s === 'used' || s === 'ใช้แล้ว' || s === 'success' || s === 'สำเร็จ';
      }).length,
      Expired: filteredLogs.filter(l => {
        const s = (l.status || '').toLowerCase();
        return s.startsWith('expired') || s === 'หมดอายุ';
      }).length,
      Other: filteredLogs.filter(l => {
        const s = (l.status || '').toLowerCase();
        const isSuccess = s === 'used' || s === 'ใช้แล้ว' || s === 'success' || s === 'สำเร็จ';
        const isExpired = s.startsWith('expired') || s === 'หมดอายุ';
        return !isSuccess && !isExpired;
      }).length
    };
    const statusData = [
      { name: 'ใช้งานแล้ว', value: statusCounts.Used, color: '#10b981' },
      { name: 'หมดอายุ', value: statusCounts.Expired, color: '#ef4444' },
      { name: 'อื่นๆ', value: statusCounts.Other, color: '#94a3b8' }
    ].filter(d => d.value > 0);

    // 5. Utilization (Current/Selected Period)
    let utilizationData = [
       { name: 'ใช้สิทธิ์แล้ว', value: 0, color: '#10b981' },
       { name: 'ยังไม่ใช้สิทธิ์', value: 0, color: '#e2e8f0' }
    ];
    let utilizationTotal = 0;

    if (memberCount > 0) {
        if (selectedCampaignId !== 'all') {
            const activePromo = promotions.find(p => p.id === selectedCampaignId);
            if (activePromo) {
                let couponsCount = activePromo.coupons.length;
                if (selectedCouponId !== 'all') {
                    couponsCount = 1;
                }
        
                const totalPotential = memberCount * couponsCount;
                
                const promoStart = activePromo.startDate instanceof Date ? activePromo.startDate : new Date(activePromo.startDate);
                const promoEnd = activePromo.endDate instanceof Date ? activePromo.endDate : new Date(activePromo.endDate);
                const promoCouponIds = new Set(activePromo.coupons.map((c: any) => c.id));
                
                const usedCount = filteredBaseLogs.filter(log => {
                   if (selectedCouponId !== 'all' && log.couponId !== selectedCouponId) return false;
                   if (!promoCouponIds.has(log.couponId)) return false;
        
                   const d = log.createdAt ? new Date(log.createdAt) : (log.timestamp?.toDate ? log.timestamp.toDate() : null);
                   if (!d) return false;
                   if (d < promoStart || d > promoEnd) return false;
                   const s = (log.status || '').toLowerCase();
                   return s === 'used' || s === 'ใช้แล้ว' || s === 'success' || s === 'สำเร็จ';
                }).length;
                
                const unusedCount = Math.max(0, totalPotential - usedCount);
                
                utilizationData = [
                  { name: 'ใช้สิทธิ์แล้ว', value: usedCount, color: '#10b981' },
                  { name: 'ยังไม่ใช้สิทธิ์', value: unusedCount, color: '#cbd5e1' }
                ];
                utilizationTotal = totalPotential;
            }
        } else {
            // Aggregate all promotions active within the range
            const rangeStart = new Date(analyticsRange.start);
            const rangeEnd = new Date(analyticsRange.end);
            
            // Adjust rangeEnd to be end of day
            rangeEnd.setHours(23, 59, 59, 999);
            
            const relevantPromos = promotions.filter(p => {
                const pStart = p.startDate instanceof Date ? p.startDate : new Date(p.startDate);
                const pEnd = p.endDate instanceof Date ? p.endDate : new Date(p.endDate);
                // Check overlap
                return pStart <= rangeEnd && pEnd >= rangeStart;
            });
            
            if (relevantPromos.length > 0) {
                let totalCouponsCount = 0;
                const relevantCouponIds = new Set();
                
                relevantPromos.forEach(p => {
                    if (selectedCouponId !== 'all') {
                         const hasCoupon = p.coupons.some((c: any) => c.id === selectedCouponId);
                         if (hasCoupon) {
                             totalCouponsCount += 1;
                             relevantCouponIds.add(selectedCouponId);
                         }
                    } else {
                        totalCouponsCount += p.coupons.length;
                        p.coupons.forEach((c: any) => relevantCouponIds.add(c.id));
                    }
                });
                
                const totalPotential = memberCount * totalCouponsCount;
                
                // Count used logs that belong to these promotions AND are within range
                // filteredLogs is already filtered by date range and selectedCouponId
                const usedCount = filteredLogs.filter(log => {
                    const s = (log.status || '').toLowerCase();
                    const isUsed = s === 'used' || s === 'ใช้แล้ว' || s === 'success' || s === 'สำเร็จ';
                    if (!isUsed) return false;
                    
                    // Ensure the log belongs to one of the relevant promotions
                    return relevantCouponIds.has(log.couponId);
                }).length;
                
                const unusedCount = Math.max(0, totalPotential - usedCount);
                
                utilizationData = [
                   { name: 'ใช้สิทธิ์แล้ว', value: usedCount, color: '#10b981' },
                   { name: 'ยังไม่ใช้สิทธิ์', value: unusedCount, color: '#cbd5e1' }
                ];
                utilizationTotal = totalPotential;
            }
        }
    }

    // Ad Analytics
    const filteredAdLogs = adLogs.filter(log => {
        try {
            let d: Date | null = null;
            if (log.timestamp?.toDate) {
                d = log.timestamp.toDate();
            } else if (log.createdAt) {
                d = new Date(log.createdAt);
            }
            
            if (!d || isNaN(d.getTime())) return false;
            
            const logDate = formatLocalDate(d);
            return logDate >= analyticsRange.start && logDate <= analyticsRange.end;
        } catch (e) {
            return false;
        }
    });

    const adClickCounts: Record<string, number> = {};
    filteredAdLogs.forEach(log => {
        const title = log.adTitle || 'Untitled Ad';
        adClickCounts[title] = (adClickCounts[title] || 0) + 1;
    });

    const adAnalyticsData = Object.entries(adClickCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return { 
        dailyData, 
        couponData, 
        branchData, 
        statusData, 
        utilizationData, 
        utilizationTotal, 
        totalInRange: filteredLogs.length, 
        diffDays,
        adAnalyticsData,
        totalAdClicks: filteredAdLogs.length
    };
  };

  const analytics = getAnalyticsData();

  const availableCoupons = useMemo(() => {
    if (selectedCampaignId === 'all') {
      const allCoupons = promotions.flatMap(p => p.coupons);
      const uniqueCoupons = Array.from(new Map(allCoupons.map(c => [c.id, c])).values());
      return uniqueCoupons;
    } else {
      const campaign = promotions.find(p => p.id === selectedCampaignId);
      return campaign ? campaign.coupons : [];
    }
  }, [promotions, selectedCampaignId]);

  const unusedCoupons = useMemo(() => {
    if (!viewingMemberHistory || !promotions.length) return [];

    const now = new Date();
    const usedCouponIds = new Set(memberHistoryLogs.map(log => log.couponId));

    const available: any[] = [];

    for (const promo of promotions) {
      if (promo.isActive === false) continue;
      
      // Check date range
      const start = promo.startDate instanceof Date ? promo.startDate : new Date(promo.startDate);
      const end = promo.endDate instanceof Date ? promo.endDate : new Date(promo.endDate);
      
      if (now < start || now > end) continue;

      for (const coupon of promo.coupons) {
        // Check if already used
        if (usedCouponIds.has(coupon.id)) continue;

        // Check targeting
        if (coupon.targetType === 'specific') {
           if (!coupon.targetIds?.includes(viewingMemberHistory.identifier)) continue;
        }
        
        // Check member only
        if (coupon.isMemberOnly && viewingMemberHistory.identifier === 'Guest') continue;

        available.push({
          ...coupon,
          promoPeriod: promo.period,
          endDate: end
        });
      }
    }
    return available;
  }, [viewingMemberHistory, promotions, memberHistoryLogs]);

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-slate-900 overflow-hidden w-full">
      {/* Progress Overlay */}
      {operationProgress && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-900">
              <Loader2 className="animate-spin" size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{operationProgress.message}</h3>
              <p className="text-xs text-slate-400 font-medium">กรุณารอสักครู่ ระบบกำลังดำเนินการ...</p>
            </div>
            
            {operationProgress.total > 0 && (
              <div className="space-y-3">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-900 transition-all duration-300 ease-out"
                    style={{ width: `${(operationProgress.current / operationProgress.total) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>ความคืบหน้า</span>
                  <span>{Math.round((operationProgress.current / operationProgress.total) * 100)}%</span>
                </div>
                <p className="text-[10px] text-slate-300 font-medium">
                  {operationProgress.current.toLocaleString()} / {operationProgress.total.toLocaleString()} รายการ
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-100 flex flex-col hidden md:flex shrink-0">
        <div className="p-8 flex-grow">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">V</span>
            </div>
            <h1 className="font-black text-base tracking-tight text-slate-900">Vista Admin</h1>
          </div>

          <nav className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-4">เมนูหลัก</p>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <LayoutDashboard size={18} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
              <span className="text-sm">แดชบอร์ด</span>
            </button>
            <button 
              onClick={() => setActiveTab('campaigns')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'campaigns' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Ticket size={18} strokeWidth={activeTab === 'campaigns' ? 2.5 : 2} />
              <span className="text-sm">จัดการแคมเปญ</span>
            </button>
            <button 
              onClick={() => setActiveTab('ads')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'ads' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Megaphone size={18} strokeWidth={activeTab === 'ads' ? 2.5 : 2} />
              <span className="text-sm">จัดการโฆษณา</span>
            </button>
            <button 
              onClick={() => setActiveTab('customers')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'customers' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Users size={18} strokeWidth={activeTab === 'customers' ? 2.5 : 2} />
              <span className="text-sm">จัดการข้อมูลสมาชิก</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <BarChart3 size={18} strokeWidth={activeTab === 'analytics' ? 2.5 : 2} />
              <span className="text-sm">รายงานและวิเคราะห์</span>
            </button>

            <div className="pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-4">ระบบ</p>
              <button 
                onClick={() => setActiveTab('system')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'system' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <Settings size={18} strokeWidth={activeTab === 'system' ? 2.5 : 2} />
                <span className="text-sm">ตั้งค่าระบบ</span>
              </button>
              <button 
                onClick={() => setActiveTab('audit')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${activeTab === 'audit' ? 'bg-slate-50 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <History size={18} strokeWidth={activeTab === 'audit' ? 2.5 : 2} />
                <span className="text-sm">ประวัติการแก้ไข</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="mt-auto p-8 border-t border-slate-100 flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-sm font-bold"
          >
            <X size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <header className="h-16 border-b border-slate-100 px-8 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              {activeTab === 'dashboard' && 'ภาพรวมระบบ'}
              {activeTab === 'campaigns' && 'จัดการแคมเปญและคูปอง'}
              {activeTab === 'ads' && 'จัดการโฆษณา'}
              {activeTab === 'customers' && 'ข้อมูลสมาชิก'}
              {activeTab === 'analytics' && 'รายงานสถิติ'}
              {activeTab === 'system' && 'ตั้งค่าระบบ'}
              {activeTab === 'audit' && 'ประวัติการแก้ไข (Audit Logs)'}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
          </div>
        </header>

        {/* Content Area */}
        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 custom-scrollbar relative bg-gray-50/50"
        >
          {showScrollTop && (
            <button 
              onClick={scrollToTop}
              className="fixed bottom-8 right-8 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-800 transition-all z-50 animate-fade-in"
            >
              <ArrowUp size={20} />
            </button>
          )}
          {importStatus && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between animate-fade-up">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={24} />
                <div>
                  <p className="text-sm font-bold text-emerald-900">นำเข้าข้อมูลสำเร็จ!</p>
                  <p className="text-xs text-emerald-600 font-medium">สำเร็จ: {importStatus.success}, ล้มเหลว: {importStatus.failed}</p>
                </div>
              </div>
              <button onClick={() => setImportStatus(null)} className="text-emerald-400 hover:text-emerald-600">
                <Trash2 size={18} />
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-10 animate-fade-in">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {stats.map((stat, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-400">
                      <stat.icon size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900">{stat.value}</span>
                      <span className="text-[10px] font-bold text-slate-300 uppercase">ทั้งหมด</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Activity Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">กิจกรรมล่าสุด</h3>
                  <button onClick={fetchLogs} className="text-[10px] font-bold text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-1">
                    {isLoading ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                    รีเฟรช
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-50">
                        <th className="py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">เวลา</th>
                        <th className="py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">สมาชิก</th>
                        <th className="py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">คูปอง</th>
                        <th className="py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">สาขา</th>
                        <th className="py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {isLoading ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-300 text-xs font-medium">กำลังโหลดข้อมูล...</td>
                        </tr>
                      ) : couponUsageLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-300 text-xs font-medium">ไม่มีกิจกรรมล่าสุด</td>
                        </tr>
                      ) : (
                        couponUsageLogs
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((log, i) => (
                          <tr key={log.id || i} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 text-[10px] font-medium text-slate-400">
                              {formatDate(log.createdAt)}
                            </td>
                            <td className="py-4">
                              <p className="text-xs font-bold text-slate-900">{getMemberDisplayName(log)}</p>
                              <p className="text-[9px] text-slate-300 font-medium">
                                {log.identifier && log.identifier.length === 9 && !isNaN(Number(log.identifier)) 
                                  ? '0' + log.identifier 
                                  : log.identifier}
                              </p>
                            </td>
                            <td className="py-4">
                              <span className="text-xs font-medium text-slate-600">{log.couponName}</span>
                            </td>
                            <td className="py-4 text-xs text-slate-400">{log.branchName || '-'}</td>
                            <td className="py-4">
                              <div className="flex items-center gap-1.5">
                                {(() => {
                                  const status = log.status || '';
                                  const isSuccess = status === 'Used' || status === 'ใช้แล้ว' || status === 'สำเร็จ' || status === 'Success';
                                  const isExpired = status.startsWith('Expired') || status === 'หมดอายุ';
                                  
                                  return (
                                    <>
                                      <div className={`w-1 h-1 rounded-full ${isSuccess ? 'bg-emerald-500' : (isExpired ? 'bg-red-500' : 'bg-slate-200')}`}></div>
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isSuccess ? 'text-emerald-600' : (isExpired ? 'text-red-500' : 'text-slate-400')}`}>
                                        {isSuccess ? 'Used' : (isExpired ? 'Expired' : status)}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {couponUsageLogs.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      แสดง {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, couponUsageLogs.length)} จาก {couponUsageLogs.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 border border-slate-100 rounded-lg text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, Math.ceil(couponUsageLogs.length / itemsPerPage)) }, (_, i) => {
                          const pageNum = i + 1;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        {Math.ceil(couponUsageLogs.length / itemsPerPage) > 5 && <span className="text-slate-300 px-1">...</span>}
                      </div>
                      <button 
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(couponUsageLogs.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(couponUsageLogs.length / itemsPerPage)}
                        className="p-2 border border-slate-100 rounded-lg text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-all"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'campaigns' && <CampaignManager />}

          {activeTab === 'ads' && <AdSettingsPanel />}

          {activeTab === 'customers' && (
            <div className="space-y-6 animate-fade-in pb-20">
              {/* Header & Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Users className="text-slate-900" size={24} />
                    จัดการข้อมูลสมาชิก
                  </h3>
                  <p className="text-sm text-slate-500 font-medium">จัดการรายชื่อสมาชิก ดูประวัติ และแก้ไขข้อมูล</p>
                </div>
                <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-lg shadow-slate-900/10 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">สมาชิกทั้งหมด</p>
                    <h4 className="text-3xl font-black">{members.length.toLocaleString()}</h4>
                  </div>
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <Users size={20} className="text-white" />
                  </div>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-10">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="ค้นหาด้วยชื่อ, เบอร์โทร, หรือรหัสสมาชิก..." 
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentCustomerPage(1); // Reset page on search
                    }}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-900/10 text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setCurrentCustomerPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-200 rounded-full"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <span>เรียงตาม:</span>
                  <select className="bg-slate-50 border-none rounded-lg py-1.5 pl-3 pr-8 text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer">
                    <option>ล่าสุด</option>
                    <option>ชื่อ A-Z</option>
                  </select>
                </div>
              </div>

              {/* Members Table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20">#</th>
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">ข้อมูลสมาชิก</th>
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">การติดต่อ</th>
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">วันที่สมัคร</th>
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {isLoading && members.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 size={32} className="animate-spin text-slate-300" />
                              <p className="text-sm font-bold text-slate-400">กำลังโหลดข้อมูลสมาชิก...</p>
                            </div>
                          </td>
                        </tr>
                      ) : members.filter(m => {
                        const fullName = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                        const identifier = m.contactPhone || m.memberId || m.identifier || m.id;
                        const phone = m.phoneNumber || m.phone || m.contactPhone || '';
                        const q = searchQuery.toLowerCase();
                        return fullName.toLowerCase().includes(q) || 
                               identifier.toLowerCase().includes(q) ||
                               phone.includes(q);
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                <Search size={24} className="text-slate-300" />
                              </div>
                              <p className="text-sm font-bold text-slate-400">ไม่พบสมาชิกที่ค้นหา</p>
                              <button onClick={() => setSearchQuery('')} className="text-xs font-bold text-slate-900 hover:underline">
                                ล้างคำค้นหา
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        members
                          .filter(m => {
                            const fullName = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                            const identifier = m.contactPhone || m.memberId || m.identifier || m.id;
                            const phone = m.phoneNumber || m.phone || m.contactPhone || '';
                            const q = searchQuery.toLowerCase();
                            return fullName.toLowerCase().includes(q) || 
                                   identifier.toLowerCase().includes(q) ||
                                   phone.includes(q);
                          })
                          .slice((currentCustomerPage - 1) * itemsPerPage, currentCustomerPage * itemsPerPage)
                          .map((member, i) => {
                            const fullName = member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim();
                            const identifier = member.contactPhone || member.memberId || member.identifier || member.id;
                            const phone = member.phoneNumber || member.phone || member.contactPhone || identifier;
                            const joinDate = member.createdAt ? (member.createdAt.seconds ? new Date(member.createdAt.seconds * 1000) : new Date(member.createdAt)) : null;

                            return (
                              <tr key={member.id || i} className="group hover:bg-slate-50/80 transition-colors">
                                <td className="py-4 px-6">
                                  <span className="text-xs font-bold text-slate-300 font-mono">
                                    {(currentCustomerPage - 1) * itemsPerPage + i + 1}
                                  </span>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-black text-xs border border-white shadow-sm">
                                      {fullName ? fullName.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{fullName || 'ไม่ระบุชื่อ'}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 font-mono">ID: {identifier}</span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center">
                                      <Phone size={12} />
                                    </div>
                                    <span className="text-xs font-bold font-mono">{phone || '-'}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <span className="text-xs font-medium text-slate-500">
                                    {joinDate ? joinDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex gap-2 justify-end">
                                    <button 
                                      onClick={() => handleEditMember(member)}
                                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-slate-100"
                                      title="แก้ไขข้อมูล"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleViewMemberHistory(member)}
                                      className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-slate-100"
                                      title="ดูประวัติ"
                                    >
                                      <History size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {members.length > 0 && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-400">
                      แสดง {Math.min((currentCustomerPage - 1) * itemsPerPage + 1, members.length)} - {Math.min(currentCustomerPage * itemsPerPage, members.length)} จาก {members.length} รายการ
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentCustomerPage(prev => Math.max(1, prev - 1))}
                        disabled={currentCustomerPage === 1}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-black text-slate-700 px-2">
                        หน้า {currentCustomerPage} / {Math.ceil(members.filter(m => {
                            const fullName = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                            const identifier = m.contactPhone || m.memberId || m.identifier || m.id;
                            const phone = m.phoneNumber || m.phone || m.contactPhone || '';
                            const q = searchQuery.toLowerCase();
                            return fullName.toLowerCase().includes(q) || 
                                   identifier.toLowerCase().includes(q) ||
                                   phone.includes(q);
                          }).length / itemsPerPage) || 1}
                      </span>
                      <button 
                        onClick={() => setCurrentCustomerPage(prev => Math.min(Math.ceil(members.filter(m => {
                            const fullName = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                            const identifier = m.contactPhone || m.memberId || m.identifier || m.id;
                            const phone = m.phoneNumber || m.phone || m.contactPhone || '';
                            const q = searchQuery.toLowerCase();
                            return fullName.toLowerCase().includes(q) || 
                                   identifier.toLowerCase().includes(q) ||
                                   phone.includes(q);
                          }).length / itemsPerPage), prev + 1))}
                        disabled={currentCustomerPage >= Math.ceil(members.filter(m => {
                            const fullName = m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                            const identifier = m.contactPhone || m.memberId || m.identifier || m.id;
                            const phone = m.phoneNumber || m.phone || m.contactPhone || '';
                            const q = searchQuery.toLowerCase();
                            return fullName.toLowerCase().includes(q) || 
                                   identifier.toLowerCase().includes(q) ||
                                   phone.includes(q);
                          }).length / itemsPerPage)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-10 animate-fade-in pb-12">
              {/* Date Filter */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">ตัวกรองช่วงเวลา</h3>
                  <p className="text-[10px] text-slate-400 font-medium">เลือกช่วงเวลาที่ต้องการดูสถิติ (สูงสุด 90 วัน)</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">สาขา</label>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none"
                    >
                      <option value="all">ทั้งหมด</option>
                      {VISTA_BRANCHES.map(branch => (
                        <option key={branch.id} value={branch.name}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">แคมเปญ</label>
                    <select
                      value={selectedCampaignId}
                      onChange={(e) => {
                        setSelectedCampaignId(e.target.value);
                        setSelectedCouponId('all');
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none max-w-[150px]"
                    >
                      <option value="all">ทั้งหมด</option>
                      {promotions.map(promo => (
                        <option key={promo.id} value={promo.id}>{promo.period || `Week ${promo.week}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">คูปอง</label>
                    <select
                      value={selectedCouponId}
                      onChange={(e) => setSelectedCouponId(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none max-w-[150px]"
                    >
                      <option value="all">ทั้งหมด</option>
                      {availableCoupons.map(coupon => (
                        <option key={coupon.id} value={coupon.id}>{coupon.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">เริ่มต้น</label>
                    <input 
                      type="date" 
                      value={analyticsRange.start}
                      onChange={(e) => setAnalyticsRange(prev => ({ ...prev, start: e.target.value }))}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">สิ้นสุด</label>
                    <input 
                      type="date" 
                      value={analyticsRange.end}
                      onChange={(e) => setAnalyticsRange(prev => ({ ...prev, end: e.target.value }))}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none"
                    />
                  </div>
                  <button 
                    onClick={fetchLogs}
                    className="mt-4 p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-colors"
                    title="รีเฟรชข้อมูล"
                  >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  </button>
                  <button 
                    onClick={() => {
                        // Export logic
                        const headers = ['Date', 'Time', 'Branch', 'Coupon', 'Status', 'Member ID', 'Member Name'];
                        const csvContent = [
                            headers.join(','),
                            ...couponUsageLogs.filter(log => {
                                // Apply same filters as analytics
                                let d: Date | null = null;
                                if (log.timestamp?.toDate) d = log.timestamp.toDate();
                                else if (log.createdAt) d = new Date(log.createdAt);
                                if (!d || isNaN(d.getTime())) return false;
                                const logDate = formatLocalDate(d);
                                
                                if (logDate < analyticsRange.start || logDate > analyticsRange.end) return false;
                                if (selectedBranch !== 'all' && log.branchName !== selectedBranch) return false;
                                
                                // Campaign/Coupon filters
                                if (selectedCampaignId !== 'all') {
                                    const campaign = promotions.find(p => p.id === selectedCampaignId);
                                    if (campaign) {
                                        const couponIds = new Set(campaign.coupons.map(c => c.id));
                                        if (!couponIds.has(log.couponId)) return false;
                                    }
                                }
                                if (selectedCouponId !== 'all' && log.couponId !== selectedCouponId) return false;

                                return true;
                            }).map(log => {
                                let d: Date | null = null;
                                if (log.timestamp?.toDate) d = log.timestamp.toDate();
                                else if (log.createdAt) d = new Date(log.createdAt);
                                
                                let dateStr = '-';
                                let timeStr = '-';
                                
                                if (d) {
                                    const day = String(d.getDate()).padStart(2, '0');
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const year = d.getFullYear() + 543;
                                    dateStr = `${day}/${month}/${year}`;
                                    
                                    const hours = String(d.getHours()).padStart(2, '0');
                                    const minutes = String(d.getMinutes()).padStart(2, '0');
                                    const seconds = String(d.getSeconds()).padStart(2, '0');
                                    timeStr = `${hours}:${minutes}:${seconds}`;
                                }
                                
                                return [
                                    dateStr,
                                    timeStr,
                                    log.branchName || '-',
                                    log.couponName || log.couponCode || '-',
                                    log.status || '-',
                                    log.identifier || log.memberId || '-',
                                    log.memberName || '-'
                                ].join(',');
                            })
                        ].join('\n');

                        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.setAttribute('href', url);
                        link.setAttribute('download', `usage_report_${analyticsRange.start}_${analyticsRange.end}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }}
                    className="mt-4 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                    title="ดาวน์โหลดรายงาน (CSV)"
                  >
                    <Download size={14} />
                    <span className="text-[10px] font-bold">Export</span>
                  </button>
                </div>
              </div>

              {/* Summary Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">อัตราการใช้งานสำเร็จ</p>
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-2xl font-black text-slate-900">
                      {analytics.totalInRange > 0 
                        ? Math.round((analytics.statusData.find(d => d.name === 'ใช้งานแล้ว')?.value || 0) / analytics.totalInRange * 100) 
                        : 0}%
                    </h4>
                    <TrendingUp size={14} className="text-emerald-500" />
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">เฉลี่ยต่อวัน (ช่วงเวลาที่เลือก)</p>
                  <h4 className="text-2xl font-black text-slate-900">
                    {Math.round(analytics.dailyData.reduce((acc, curr) => acc + curr.count, 0) / analytics.diffDays)}
                  </h4>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">สาขาที่มีการใช้งานสูงสุด</p>
                  <h4 className="text-sm font-black text-slate-900 truncate">
                    {analytics.branchData[0]?.name || '-'}
                  </h4>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">คูปองยอดนิยม</p>
                  <h4 className="text-sm font-black text-slate-900 truncate">
                    {analytics.couponData[0]?.name || '-'}
                  </h4>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Trend Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">แนวโน้มการใช้งานคูปอง</h3>
                      <p className="text-[10px] text-slate-400 font-medium">สถิติการใช้งานในช่วงเวลาที่เลือก</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">ใช้งานแล้ว</span>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.dailyData}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fontWeight: 600, fill: '#94a3b8'}}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fontWeight: 600, fill: '#94a3b8'}}
                        />
                        <Tooltip 
                          contentStyle={{
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                            fontSize: '12px', 
                            fontWeight: 'bold',
                            backgroundColor: '#ffffff',
                            color: '#0f172a'
                          }}
                          itemStyle={{ color: '#10b981' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">สัดส่วนสถานะคูปอง</h3>
                  <div className="h-[250px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={analytics.statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analytics.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                            fontSize: '12px', 
                            fontWeight: 'bold',
                            backgroundColor: '#ffffff',
                            color: '#0f172a'
                          }}
                        />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-900">{couponUsageLogs.length}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">ทั้งหมด</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {analytics.statusData.map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{backgroundColor: item.color}}></div>
                          <span className="text-[10px] font-bold text-slate-500">{item.name}</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Coupons */}
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2">
                    <Ticket size={16} className="text-slate-400" />
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">5 อันดับคูปองยอดนิยม</h3>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.couponData} layout="vertical" margin={{left: 40}}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fontWeight: 700, fill: '#475569'}}
                          width={100}
                        />
                        <Tooltip 
                          cursor={{fill: '#f8fafc'}}
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                        />
                        <Bar dataKey="count" fill="#0f172a" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Branch Performance */}
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-slate-400" />
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">การใช้งานแยกตามสาขา</h3>
                  </div>
                  <div className="overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-50">
                            <th className="pb-3 text-[10px] font-black text-slate-300 uppercase tracking-widest">ชื่อสาขา</th>
                            <th className="pb-3 text-[10px] font-black text-slate-300 uppercase tracking-widest text-right">จำนวนครั้ง</th>
                            <th className="pb-3 text-[10px] font-black text-slate-300 uppercase tracking-widest text-right">สัดส่วน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {analytics.branchData.map((branch, i) => (
                            <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 text-[11px] font-bold text-slate-700">{branch.name}</td>
                              <td className="py-3 text-[11px] font-black text-slate-900 text-right">{branch.count}</td>
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-slate-900 rounded-full" 
                                      style={{width: `${(branch.count / (couponUsageLogs.filter(l => l.status === 'Used' || l.status === 'ใช้แล้ว' || l.status === 'Success').length || 1)) * 100}%`}}
                                    ></div>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400">
                                    {Math.round((branch.count / (couponUsageLogs.filter(l => l.status === 'Used' || l.status === 'ใช้แล้ว' || l.status === 'Success').length || 1)) * 100)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ad Analytics Section */}
              <div className="space-y-6 pt-8 border-t border-slate-100">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Megaphone size={20} className="text-slate-900" />
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">สถิติโฆษณา (Ad Analytics)</h3>
                    </div>
                    <button 
                        onClick={handleClearAdStats}
                        disabled={isClearingAdStats || !usageLogs.some(l => l.type === 'ad_click')}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isClearingAdStats ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span className="text-xs font-bold">ล้างสถิติโฆษณา</span>
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">จำนวนการคลิกทั้งหมด</p>
                        <h4 className="text-2xl font-black text-slate-900">{analytics.totalAdClicks}</h4>
                    </div>
                    
                    <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">ยอดคลิกแยกตามโฆษณา</p>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.adAnalyticsData} layout="vertical" margin={{left: 40, right: 20}}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fontWeight: 700, fill: '#475569'}}
                                        width={150}
                                    />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                                    />
                                    <Bar dataKey="count" fill="#F8B500" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                 </div>
              </div>


            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-10 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Data Management Card */}
                <div className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900">
                      <RefreshCw size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">การซิงค์ข้อมูล (Data Synchronization)</h3>
                      <p className="text-[10px] text-slate-400 font-medium">ซิงค์ข้อมูลเริ่มต้นและตรวจสอบความถูกต้องของฐานข้อมูล</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-900">ซิงค์โปรโมชั่น (Sync Promotions)</p>
                        <p className="text-[10px] text-slate-400">นำเข้าข้อมูลโปรโมชั่นเริ่มต้นไปยัง Firestore</p>
                      </div>
                      <button 
                        onClick={syncPromotionsToFirestore}
                        disabled={isSyncing}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-lg font-bold text-[10px] text-slate-900 hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSyncing ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                        ซิงค์ข้อมูล
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-900">ล้างข้อมูลซ้ำ (Cleanup Duplicates)</p>
                        <p className="text-[10px] text-slate-400">ลบข้อมูลประวัติการใช้งานที่ซ้ำกันออกจากระบบ</p>
                      </div>
                      <button 
                        onClick={handleCleanup}
                        disabled={isCleaning}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-lg font-bold text-[10px] text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isCleaning ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                        ล้างข้อมูลซ้ำ
                      </button>
                    </div>

                    <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900">อัปเดตชื่อสาขา (Migrate Branch Names)</p>
                          <p className="text-[10px] text-slate-400">อัปเดตชื่อสาขาเก่า และระบุสาขาสำหรับรายการที่ไม่มีชื่อสาขา</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">เลือกสาขาสำหรับรายการที่ "ไม่ระบุสาขา"</label>
                            <select
                                value={targetBranchForMigration}
                                onChange={(e) => setTargetBranchForMigration(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900/5 focus:outline-none"
                            >
                                <option value="">-- ไม่เลือก (ข้ามรายการที่ไม่มีสาขา) --</option>
                                {VISTA_BRANCHES.map(branch => (
                                <option key={branch.id} value={branch.name}>{branch.name}</option>
                                ))}
                            </select>
                            </div>
                            <button 
                            onClick={async () => {
                                if (!confirm('คุณต้องการอัปเดตชื่อสาขาเก่าทั้งหมดให้เป็นชื่อใหม่ใช่หรือไม่? การดำเนินการนี้อาจใช้เวลาสักครู่')) return;
                                
                                setIsSyncing(true);
                                try {
                                const logsRef = collection(db, 'usage_logs');
                                const snapshot = await getDocs(logsRef);
                                let updatedCount = 0;
                                
                                const batchSize = 500;
                                let batch = writeBatch(db);
                                let operationCounter = 0;

                                for (const docSnapshot of snapshot.docs) {
                                    const data = docSnapshot.data();
                                    const currentBranchName = data.branchName ? String(data.branchName).trim() : '';
                                    let newBranchName = currentBranchName;
                                    
                                    // 1. Map old names to new names (Handle potential whitespace)
                                    if (currentBranchName === 'สาขาเดอะมอลล์งามวงศ์วาน') {
                                        newBranchName = 'สาขาเดอะมอลล์งามวงศ์วาน ชั้น G';
                                    } else if (currentBranchName === 'สาขาโรงพยาบาลจุฬาลงกรณ์') {
                                        newBranchName = 'สาขาอาคารภูมิสิริฯ ชั้น 11 รพ. จุฬา';
                                    }

                                    // 2. Handle empty/undefined branch names if target selected
                                    if ((!newBranchName || newBranchName === '-' || newBranchName === '') && targetBranchForMigration) {
                                        newBranchName = targetBranchForMigration;
                                    }

                                    if (newBranchName && newBranchName !== currentBranchName) {
                                        batch.update(doc(db, 'usage_logs', docSnapshot.id), { branchName: newBranchName });
                                        updatedCount++;
                                        operationCounter++;
                                    }

                                    if (operationCounter >= batchSize) {
                                        await batch.commit();
                                        batch = writeBatch(db);
                                        operationCounter = 0;
                                    }
                                }
                                
                                if (operationCounter > 0) {
                                    await batch.commit();
                                }
                                
                                alert(`อัปเดตข้อมูลเรียบร้อยแล้ว จำนวน ${updatedCount} รายการ`);
                                fetchLogs(); // Refresh data
                                } catch (error) {
                                console.error('Error migrating branches:', error);
                                alert('เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
                                } finally {
                                setIsSyncing(false);
                                }
                            }}
                            disabled={isSyncing}
                            className="bg-white border border-slate-200 px-4 py-2 rounded-lg font-bold text-[10px] text-blue-600 hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2 h-[34px]"
                            >
                            {isSyncing ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                            อัปเดตสาขา
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-400 italic">* ระบบจะเปลี่ยนชื่อสาขาเก่า (งามวงศ์วาน, จุฬาฯ) ให้เป็นชื่อใหม่โดยอัตโนมัติ ส่วนรายการที่ไม่มีชื่อสาขาจะถูกเปลี่ยนเป็นสาขาที่เลือกในช่องนี้</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-900">แก้ไขดัชนีข้อมูล (Fix Data Indexing)</p>
                        <p className="text-[10px] text-slate-400">แก้ไขข้อมูลเก่าที่ไม่มี Timestamp เพื่อให้แสดงผลในการเรียงลำดับได้ถูกต้อง</p>
                      </div>
                      <button 
                        onClick={handleFixData}
                        disabled={isFixingData}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-lg font-bold text-[10px] text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isFixingData ? <Loader2 className="animate-spin" size={12} /> : <Settings size={12} />}
                        แก้ไขข้อมูล
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-red-50/50 rounded-xl border border-red-100">
                      <div>
                        <p className="text-xs font-bold text-red-900">ลบประวัติทั้งหมด (Delete All Logs)</p>
                        <p className="text-[10px] text-red-400">ลบประวัติการใช้งาน "ทั้งหมด" ออกจากระบบอย่างถาวร</p>
                      </div>
                      <button 
                        onClick={handleDeleteAllLogs}
                        disabled={isDeletingAll}
                        className="bg-white border border-red-200 px-4 py-2 rounded-lg font-bold text-[10px] text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isDeletingAll ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                        ลบข้อมูลทั้งหมด
                      </button>
                    </div>
                  </div>
                </div>

                {/* Import/Export Card */}
                <div className="bg-white p-8 rounded-2xl border border-slate-100 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900">
                      <Upload size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">นำเข้าและส่งออก (Import & Export)</h3>
                      <p className="text-[10px] text-slate-400 font-medium">จัดการข้อมูลจากแหล่งภายนอก</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                        <Upload size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">นำเข้าประวัติการใช้งาน (Import Usage Logs)</p>
                        <p className="text-[10px] text-slate-400">อัปโหลดไฟล์ CSV เพื่อนำเข้าประวัติการใช้งาน</p>
                      </div>
                      <input 
                        type="file" 
                        accept=".csv" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold text-[10px] hover:bg-black transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isImporting ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
                        เลือกไฟล์ CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-900">
                      <History size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">บันทึกการตรวจสอบระบบ (Audit Logs)</h3>
                      <p className="text-[10px] text-slate-400 font-medium">บันทึกการแก้ไขข้อมูลโดยผู้ดูแลระบบ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">รายการทั้งหมด:</span>
                    <span className="text-xs font-black text-slate-900 bg-white px-2 py-1 rounded-lg shadow-sm border border-slate-100">{auditLogs.length}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">วัน/เวลา</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ผู้ดูแล</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">การกระทำ</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">รายละเอียด</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">เป้าหมาย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                              <History size={48} strokeWidth={1} />
                              <p className="text-sm font-medium">ยังไม่มีประวัติการแก้ไขในระบบ</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-900">
                                  {log.timestamp instanceof Date ? log.timestamp.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Invalid Date'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {log.timestamp instanceof Date ? log.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                  {log.adminName?.charAt(0) || 'A'}
                                </div>
                                <span className="text-xs font-bold text-slate-700">{log.adminName || 'Admin'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-tighter ${
                                log.action.includes('Delete') ? 'bg-red-50 text-red-600' : 
                                log.action.includes('Update') || log.action.includes('Edit') ? 'bg-amber-50 text-amber-600' : 
                                log.action.includes('Create') || log.action.includes('Add') ? 'bg-emerald-50 text-emerald-600' : 
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-xs text-slate-600 font-medium max-w-md line-clamp-2">{log.details}</p>
                            </td>
                            <td className="px-6 py-4">
                              {log.targetType && (
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{log.targetType}</span>
                                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">{log.targetId || '-'}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 pb-6 z-40 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <LayoutDashboard size={20} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
          <span className="text-[9px] font-bold uppercase tracking-wide">Overview</span>
        </button>
        <button 
          onClick={() => setActiveTab('campaigns')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'campaigns' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Ticket size={20} strokeWidth={activeTab === 'campaigns' ? 2.5 : 2} />
          <span className="text-[9px] font-bold uppercase tracking-wide">Campaigns</span>
        </button>
        <button 
          onClick={() => setActiveTab('customers')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'customers' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Users size={20} strokeWidth={activeTab === 'customers' ? 2.5 : 2} />
          <span className="text-[9px] font-bold uppercase tracking-wide">Members</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'analytics' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <BarChart3 size={20} strokeWidth={activeTab === 'analytics' ? 2.5 : 2} />
          <span className="text-[9px] font-bold uppercase tracking-wide">Stats</span>
        </button>
        <button 
          onClick={() => setActiveTab('system')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'system' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Settings size={20} strokeWidth={activeTab === 'system' ? 2.5 : 2} />
          <span className="text-[9px] font-bold uppercase tracking-wide">System</span>
        </button>
      </div>

      {/* Modal for Edit Member */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">แก้ไขข้อมูลสมาชิก</h3>
              <button onClick={() => setIsMemberModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMember} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รหัสสมาชิก</label>
                <input 
                  type="text" 
                  value={editingMember?.identifier || ''}
                  disabled
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-400 cursor-not-allowed"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ชื่อ</label>
                  <input 
                    name="firstName"
                    type="text" 
                    defaultValue={editingMember?.firstName || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">นามสกุล</label>
                  <input 
                    name="lastName"
                    type="text" 
                    defaultValue={editingMember?.lastName || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เบอร์โทรศัพท์</label>
                  <input 
                    name="phone"
                    type="text" 
                    defaultValue={editingMember?.phone || editingMember?.phoneNumber || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">อีเมล</label>
                  <input 
                    name="email"
                    type="email" 
                    defaultValue={editingMember?.email || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line ID</label>
                  <input 
                    name="lineId"
                    type="text" 
                    defaultValue={editingMember?.lineId || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">วันเกิด</label>
                  <input 
                    name="birthDate"
                    type="date" 
                    defaultValue={editingMember?.birthDate || ''}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">คะแนนสะสม</label>
                <input 
                  name="points"
                  type="number" 
                  defaultValue={editingMember?.points || 0}
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ที่อยู่</label>
                <textarea 
                  name="address"
                  rows={3}
                  defaultValue={editingMember?.address || ''}
                  className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-slate-200 resize-none"
                />
              </div>
              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-xs hover:bg-black transition-all"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Member History */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-scale-up flex flex-col max-h-[80vh]">
            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">รายละเอียดการใช้งาน</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-1">{viewingMemberHistory?.name} • {viewingMemberHistory?.identifier}</p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-8 pt-4 pb-0 flex gap-4 border-b border-slate-50">
              <button 
                onClick={() => setHistoryTab('history')}
                className={`pb-3 text-xs font-bold transition-all relative ${historyTab === 'history' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                ประวัติการใช้ ({memberHistoryLogs.length})
                {historyTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900 rounded-full"></div>}
              </button>
              <button 
                onClick={() => setHistoryTab('unused')}
                className={`pb-3 text-xs font-bold transition-all relative ${historyTab === 'unused' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              >
                คูปองที่ยังไม่ใช้ ({unusedCoupons.length})
                {historyTab === 'unused' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900 rounded-full"></div>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                  <Loader2 className="animate-spin mb-2" size={24} />
                  <p className="text-[10px] font-bold uppercase tracking-widest">กำลังโหลดข้อมูล...</p>
                </div>
              ) : historyTab === 'history' ? (
                memberHistoryLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-300 text-xs font-medium">
                    ไม่พบประวัติการใช้คูปอง
                  </div>
                ) : (
                  <div className="space-y-3">
                    {memberHistoryLogs.map((log, idx) => (
                      <div key={log.id || idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/30 flex items-center justify-between">
                        <div className="flex gap-4 items-center">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400">
                            <Ticket size={16} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{log.couponName}</p>
                            <p className="text-[9px] text-slate-400">{formatDate(log.createdAt)} • {log.branchName || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const status = log.status || '';
                                    const isSuccess = status === 'Used' || status === 'ใช้แล้ว' || status === 'สำเร็จ' || status === 'Success';
                                    const isExpired = status.startsWith('Expired') || status === 'หมดอายุ';
                            
                            return (
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-md ${isSuccess ? 'bg-emerald-50 text-emerald-600' : (isExpired ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400')}`}>
                                {isSuccess ? 'ใช้งานแล้ว' : (isExpired ? 'หมดอายุ' : status.toUpperCase())}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                unusedCoupons.length === 0 ? (
                  <div className="text-center py-12 text-slate-300 text-xs font-medium">
                    ไม่พบคูปองที่ยังไม่ได้ใช้
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unusedCoupons.map((coupon, idx) => (
                      <div key={coupon.id || idx} className="p-4 rounded-xl border border-slate-100 bg-white flex items-center justify-between hover:border-slate-200 transition-all shadow-sm">
                        <div className="flex gap-4 items-center">
                          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                            <img src={coupon.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{coupon.name}</p>
                            <p className="text-[9px] text-slate-400 font-medium mt-0.5">{coupon.promoPeriod}</p>
                            <p className="text-[9px] text-slate-400">หมดอายุ: {formatDate(coupon.endDate)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Available
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmationModal 
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={executeDelete}
        title={deleteModal.title}
        message={deleteModal.message}
        confirmText={deleteModal.confirmText}
      />

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        @keyframes scale-up {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-up {
          animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
