import {
  type ISODate,
  type YearMonth,
  isWithin,
  periodDates,
  settlementPeriod,
} from "./dates";

/** 간편식 계산 기준일: 실제 날짜 수와 관계없이 항상 30일 */
export const BASE_DAYS = 30;

export type Shift = "A" | "B" | "C" | "OFF";
export const SHIFTS: Shift[] = ["A", "B", "C", "OFF"];

export interface ShiftDay {
  date: ISODate;
  shift: Shift;
  source: "image" | "manual";
  /** 0~1. 수동 입력은 1 */
  confidence: number;
}

export interface MealUse {
  id: string;
  date: ISODate;
  createdAt: string;
}

export interface Settlement {
  /** 기준월 기준 고유값. 예: "2026-09" */
  id: string;
  baseYear: number;
  baseMonth: number;
  startDate: ISODate;
  endDate: ISODate;
  workDays: number;
  mealAllowance: number;
  mealUses: MealUse[];
  shifts: ShiftDay[];
  createdAt: string;
  updatedAt: string;
}

export const LOW_CONFIDENCE = 0.7;

export function isWorkShift(shift: Shift): boolean {
  return shift === "A" || shift === "B" || shift === "C";
}

export function countShifts(shifts: ShiftDay[]): Record<Shift, number> {
  const counts: Record<Shift, number> = { A: 0, B: 0, C: 0, OFF: 0 };
  for (const s of shifts) counts[s.shift] += 1;
  return counts;
}

/** 근무일수 = A + B + C 날짜 수 */
export function countWorkDays(shifts: ShiftDay[]): number {
  return shifts.filter((s) => isWorkShift(s.shift)).length;
}

/** 간편식 총 가능 횟수 = 30 - 근무일수 (0 미만 불가) */
export function mealAllowanceFor(workDays: number): number {
  return Math.max(0, BASE_DAYS - workDays);
}

/** 남은 간편식 = 총 가능 횟수 - 실제 수령 횟수 (0 미만 불가) */
export function remainingMeals(s: Pick<Settlement, "mealAllowance" | "mealUses">): number {
  return Math.max(0, s.mealAllowance - s.mealUses.length);
}

export function settlementId(base: YearMonth): string {
  return `${base.year}-${String(base.month).padStart(2, "0")}`;
}

/** 근무표가 바뀌면 파생값(workDays, mealAllowance)을 다시 계산한다. */
export function recompute(s: Settlement, now: Date = new Date()): Settlement {
  const workDays = countWorkDays(s.shifts);
  return {
    ...s,
    workDays,
    mealAllowance: mealAllowanceFor(workDays),
    updatedAt: now.toISOString(),
  };
}

/** 정산기간 전체 날짜에 대해 근무표를 채운다. 빠진 날짜는 휴무로 둔다. */
export function normalizeShifts(base: YearMonth, shifts: ShiftDay[]): ShiftDay[] {
  const byDate = new Map(shifts.map((s) => [s.date, s]));
  return periodDates(base).map(
    (date) => byDate.get(date) ?? { date, shift: "OFF", source: "manual", confidence: 1 },
  );
}

export function createSettlement(
  base: YearMonth,
  shifts: ShiftDay[],
  now: Date = new Date(),
  mealUses: MealUse[] = [],
): Settlement {
  const { startDate, endDate } = settlementPeriod(base);
  const stamp = now.toISOString();
  return recompute(
    {
      id: settlementId(base),
      baseYear: base.year,
      baseMonth: base.month,
      startDate,
      endDate,
      workDays: 0,
      mealAllowance: 0,
      mealUses: mealUses.filter((m) => isWithin(m.date, startDate, endDate)),
      shifts: normalizeShifts(base, shifts),
      createdAt: stamp,
      updatedAt: stamp,
    },
    now,
  );
}

/** 사용자가 직접 근무 상태를 바꾸면 confidence = 1, source = manual */
export function setShift(s: Settlement, date: ISODate, shift: Shift, now: Date = new Date()): Settlement {
  return recompute(
    {
      ...s,
      shifts: s.shifts.map((d) =>
        d.date === date ? { date, shift, source: "manual", confidence: 1 } : d,
      ),
    },
    now,
  );
}

export function setShiftInList(shifts: ShiftDay[], date: ISODate, shift: Shift): ShiftDay[] {
  return shifts.map((d) => (d.date === date ? { date, shift, source: "manual", confidence: 1 } : d));
}

export function hasMealOn(s: Settlement, date: ISODate): boolean {
  return s.mealUses.some((m) => m.date === date);
}

export type AddMealResult =
  | { ok: true; settlement: Settlement }
  | { ok: false; reason: "duplicate" | "exhausted" | "out-of-period" };

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 간편식 수령 기록. 같은 날짜 중복 불가, 남은 횟수 0이면 불가. */
export function addMealUse(s: Settlement, date: ISODate, now: Date = new Date()): AddMealResult {
  if (!isWithin(date, s.startDate, s.endDate)) return { ok: false, reason: "out-of-period" };
  if (hasMealOn(s, date)) return { ok: false, reason: "duplicate" };
  if (remainingMeals(s) <= 0) return { ok: false, reason: "exhausted" };
  const use: MealUse = { id: newId(), date, createdAt: now.toISOString() };
  const mealUses = [...s.mealUses, use].sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, settlement: { ...s, mealUses, updatedAt: now.toISOString() } };
}

export function removeMealUse(s: Settlement, date: ISODate, now: Date = new Date()): Settlement {
  return {
    ...s,
    mealUses: s.mealUses.filter((m) => m.date !== date),
    updatedAt: now.toISOString(),
  };
}

export function lowConfidenceDays(shifts: ShiftDay[]): ShiftDay[] {
  return shifts.filter((s) => s.confidence < LOW_CONFIDENCE);
}

export function shiftOn(s: { shifts: ShiftDay[] }, date: ISODate): ShiftDay | undefined {
  return s.shifts.find((d) => d.date === date);
}

export function shiftLabel(shift: Shift): string {
  return shift === "OFF" ? "휴" : shift;
}
