import { useCallback, useEffect, useState } from "react";
import { isWithin, todayISO } from "./dates";
import type { Settlement } from "./settlement";
import { type StoreData, loadStore, saveStore } from "./storage";

/** 오늘이 포함된 정산이 따로 있으면 그쪽을 '이번 정산'으로 삼는다. */
function resolveActive(data: StoreData, today: string): StoreData {
  const active = data.settlements.find((s) => s.id === data.activeId);
  if (active && isWithin(today, active.startDate, active.endDate)) return data;
  const current = data.settlements.find((s) => isWithin(today, s.startDate, s.endDate));
  if (current && (!active || today > active.endDate)) return { ...data, activeId: current.id };
  if (!active && data.settlements.length) return { ...data, activeId: data.settlements[0].id };
  return data;
}

export function useStore() {
  const [data, setData] = useState<StoreData>(() => resolveActive(loadStore(), todayISO()));

  useEffect(() => {
    saveStore(data);
  }, [data]);

  // 다른 탭/창에서 바뀐 내용 반영
  useEffect(() => {
    const onStorage = () => setData(resolveActive(loadStore(), todayISO()));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 자정을 넘기거나 앱을 다시 열었을 때 이번 정산을 다시 고른다
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setData((d) => resolveActive(d, todayISO()));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const active = data.settlements.find((s) => s.id === data.activeId) ?? null;

  const updateSettlement = useCallback((next: Settlement) => {
    setData((d) => ({ ...d, settlements: d.settlements.map((s) => (s.id === next.id ? next : s)) }));
  }, []);

  return { data, setData, active, updateSettlement };
}
