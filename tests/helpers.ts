import type { YearMonth } from "../src/lib/dates";
import { type MonthlySchedule, makeMonth } from "../src/lib/schedule";
import type { Shift, ShiftDay } from "../src/lib/settlement";
import { EXPECTED_MONTHS } from "./expected";

export const NOW = new Date(2026, 8, 25, 12, 0, 0);

export function monthDays(ym: YearMonth, shifts: Shift[]): ShiftDay[] {
  return shifts.map((shift, i) => ({
    date: `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
    shift,
    source: "image",
    confidence: 0.95,
  }));
}

/** 정답표로 월 근무표를 만든다 */
export function expectedMonth(ym: YearMonth): MonthlySchedule {
  const id = `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  return makeMonth(ym, monthDays(ym, EXPECTED_MONTHS[id]), NOW);
}

export class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
