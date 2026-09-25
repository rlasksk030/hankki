import { useCallback, useEffect, useState } from "react";
import type { ISODate, YearMonth } from "./dates";
import { type MonthlySchedule, type StoreData, editShift, saveMealUses, upsertMonth } from "./schedule";
import type { Settlement, Shift } from "./settlement";
import { loadStore, saveStore } from "./storage";

export function useStore() {
  const [data, setData] = useState<StoreData>(() => loadStore());

  useEffect(() => {
    saveStore(data);
  }, [data]);

  // 다른 탭/창에서 바뀐 내용 반영
  useEffect(() => {
    const onStorage = () => setData(loadStore());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** 정산 화면에서 수령 기록이 바뀌면 그 정산 기록에만 저장 */
  const saveMeals = useCallback((view: Settlement) => setData((d) => saveMealUses(d, view)), []);

  /** 날짜 하나의 근무 수정 → 그 달을 쓰는 정산이 모두 다시 계산된다 */
  const setShiftOn = useCallback((date: ISODate, shift: Shift) => setData((d) => editShift(d, date, shift)), []);

  /** 월 근무표 추가/교체 (수령 기록은 유지) */
  const putMonths = useCallback(
    (months: MonthlySchedule[]) => setData((d) => months.reduce((acc, m) => upsertMonth(acc, m), d)),
    [],
  );

  return { data, setData, saveMeals, setShiftOn, putMonths };
}

export type { YearMonth };
