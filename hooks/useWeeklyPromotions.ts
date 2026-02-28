
import { useState, useEffect } from 'react';
import { PROMOTIONS } from '../constants';
import { WeeklyPromotion, UserData } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export const useWeeklyPromotions = (userData: UserData | null) => {
  const [promotions, setPromotions] = useState<WeeklyPromotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const promoRef = collection(db, "promotions");
    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(promoRef, (snapshot) => {
      if (snapshot.empty) {
        setPromotions(PROMOTIONS);
      } else {
        const fetchedPromos = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            ...data,
            // Handle Firestore timestamps safely
            startDate: data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate),
            endDate: data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate),
          } as WeeklyPromotion;
        });
        setPromotions(fetchedPromos);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching promotions:", error);
      setPromotions(PROMOTIONS);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

  const currentPromotions = promotions
    .filter(p => {
      // Show promotions that overlap with the current month AND are active
      if (p.isActive === false) return false;
      return p.startDate <= endOfMonth && p.endDate >= startOfMonth;
    })
    .map(p => {
      const promoStartDate = p.startDate;
      // Set time to 00:00:00 for date-only comparison if needed, 
      // but here we just ensure we compare against current local time
      const isBeforePromoStart = now < promoStartDate;

      const updatedCoupons = p.coupons.filter(c => {
        // Targeting logic
        if (!c.targetType || c.targetType === 'all') return true;
        
        if (c.targetType === 'members') {
          return userData !== null && userData.identifier !== 'Guest';
        }
        
        if (c.targetType === 'specific') {
          if (!userData || !c.targetIds) return false;
          return c.targetIds.includes(userData.identifier);
        }
        
        return true;
      }).map(c => {
        let isLocked = false;
        
        if (isBeforePromoStart) {
          isLocked = true;
        } else {
          if (c.activeDay !== undefined && currentDay < c.activeDay) {
            isLocked = true;
          }
        }

        return {
          ...c,
          isLocked,
          promoStartDate: p.startDate 
        };
      });

      return {
        ...p,
        coupons: updatedCoupons
      };
    })
    .filter(p => p.coupons.length > 0) // Only show promotions that have at least one valid coupon for the user
    .sort((a, b) => {
      // Sort by priority first
      const priorityA = a.priority !== undefined ? a.priority : (a.week || 0);
      const priorityB = b.priority !== undefined ? b.priority : (b.week || 0);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Sort by availability (unlocked first) then by date
      const aAvailable = a.coupons.some(c => !(c as any).isLocked);
      const bAvailable = b.coupons.some(c => !(c as any).isLocked);
      
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      
      return a.startDate.getTime() - b.startDate.getTime();
    });

  return { currentPromotions, isLoading };
};

export default useWeeklyPromotions;
