// 월별 근무표 + 정산기간별 수령 기록 (저장 구조 v2)
//
// - 근무표는 달마다 한 번만 저장한다(MonthlySchedule). 같은 10월 근무표를
//   9.21~10.20 정산과 10.21~11.20 정산에 중복 저장하지 않는다.
// - 정산(SettlementRecord)은 간편식 수령 기록만 가진다. 근무일·간편식 횟수는
//   저장하지 않고 월별 근무표에서 기준월 21일 ~ 다음 달 20일을 모아 매번 계산한다.
import {
  type ISODate,
  type YearMonth,
  addMonths,
  formatYearMonth,
  isWithin,
  parseISODate,
  periodDates,
  settlementPeriod,
} from "./dates";
import {
  type MealUse,
  type Settlement,
  type Shift,
  type ShiftDay,
  countWorkDays,
  mealAllowanceFor,
  settlementId,
} from "./settlement";

export interface MonthlySchedule {
  /** 예: "2026-10" */
  id: string;
  year: number;
  month: number;
  /** 날짜순. 새로 분석한 달은 1일~말일 전체 */
  days: ShiftDay[];
  updatedAt: string;
}

export interface SettlementRecord {
  /** 기준월 id. 예: "2026-09" = 9.21 ~ 10.20 */
  id: string;
  baseYear: number;
  baseMonth: number;
  startDate: ISODate;
  endDate: ISODate;
  mealUses: MealUse[];
  createdAt: string;
  updatedAt: string;
}

export const SCHEMA_VERSION = 2;

export interface StoreData {
  schemaVersion: typeof SCHEMA_VERSION;
  months: MonthlySchedule[];
  settlements: SettlementRecord[];
}

export function emptyStore(): StoreData {
  return { schemaVersion: SCHEMA_VERSION, months: [], settlements: [] };
}

export const monthId = settlementId;

export function monthOf(date: ISODate): YearMonth {
  const { year, month } = parseISODate(date);
  return { year, month };
}

export function toYearMonth(id: string): YearMonth {
  const [year, month] = id.split("-").map(Number);
  return { year, month };
}

export function makeMonth(ym: YearMonth, days: ShiftDay[], now: Date = new Date()): MonthlySchedule {
  const id = monthId(ym);
  return {
    id,
    year: ym.year,
    month: ym.month,
    days: days.filter((d) => d.date.startsWith(`${id}-`)).sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: now.toISOString(),
  };
}

function dayMap(months: MonthlySchedule[]): Map<ISODate, ShiftDay> {
  const map = new Map<ISODate, ShiftDay>();
  for (const m of months) for (const d of m.days) map.set(d.date, d);
  return map;
}

function sortMonths(months: MonthlySchedule[]): MonthlySchedule[] {
  return [...months].sort((a, b) => a.id.localeCompare(b.id));
}

function sortRecords(records: SettlementRecord[]): SettlementRecord[] {
  return [...records].sort((a, b) => b.id.localeCompare(a.id));
}

// ---------- 정산기간 계산 ----------

export type PeriodStatus =
  | { available: true; view: Settlement }
  | { available: false; missing: YearMonth[] };

/** 기준월 정산을 월별 근무표에서 계산한다. 필요한 날짜가 하나라도 없으면 계산하지 않는다. */
export function periodStatus(data: StoreData, base: YearMonth, now: Date = new Date()): PeriodStatus {
  const map = dayMap(data.months);
  const dates = periodDates(base);
  const missingIds = new Set<string>();
  for (const d of dates) if (!map.has(d)) missingIds.add(monthId(monthOf(d)));
  if (missingIds.size > 0) return { available: false, missing: [...missingIds].sort().map(toYearMonth) };

  const shifts = dates.map((d) => map.get(d)!);
  const id = settlementId(base);
  const record = data.settlements.find((r) => r.id === id);
  const { startDate, endDate } = settlementPeriod(base);
  const workDays = countWorkDays(shifts);
  const stamp = now.toISOString();
  return {
    available: true,
    view: {
      id,
      baseYear: base.year,
      baseMonth: base.month,
      startDate,
      endDate,
      workDays,
      mealAllowance: mealAllowanceFor(workDays),
      mealUses: record?.mealUses ?? [],
      shifts,
      createdAt: record?.createdAt ?? stamp,
      updatedAt: record?.updatedAt ?? stamp,
    },
  };
}

export function periodView(data: StoreData, base: YearMonth): Settlement | null {
  const status = periodStatus(data, base);
  return status.available ? status.view : null;
}

export interface PeriodEntry {
  base: YearMonth;
  id: string;
  startDate: ISODate;
  endDate: ISODate;
  status: PeriodStatus;
}

function entry(data: StoreData, base: YearMonth): PeriodEntry {
  const { startDate, endDate } = settlementPeriod(base);
  return { base, id: settlementId(base), startDate, endDate, status: periodStatus(data, base) };
}

/**
 * 메인 화면에서 넘겨 볼 정산기간 목록(오래된 순).
 * - 월별 근무표가 이어져 있어 계산 가능한 정산
 * - 수령 기록이 남아 있는 정산
 * - 마지막 정산 다음 기간(다음 달 근무표가 필요하다는 안내용)
 * - 오늘이 포함된 기간(아직 근무표가 없어도)
 */
export function listPeriods(data: StoreData, today: ISODate): PeriodEntry[] {
  const ids = new Set<string>();
  for (const m of data.months) {
    const base = toYearMonth(m.id);
    if (periodStatus(data, base).available) ids.add(m.id);
  }
  for (const r of data.settlements) ids.add(r.id);
  if (data.months.length > 0) {
    const available = [...ids].filter((id) => periodStatus(data, toYearMonth(id)).available).sort();
    const last = available.at(-1);
    if (last) ids.add(monthId(addMonths(toYearMonth(last), 1)));
    const todayBase = currentBase(today);
    const todayId = monthId(todayBase);
    if (!last || todayId > last) ids.add(todayId);
  }
  return [...ids].sort().map((id) => entry(data, toYearMonth(id)));
}

/** 날짜가 속한 정산의 기준월: 21일부터는 그 달, 20일까지는 지난달 */
export function currentBase(date: ISODate): YearMonth {
  const { year, month, day } = parseISODate(date);
  return day >= 21 ? { year, month } : addMonths({ year, month }, -1);
}

/** 처음 보여줄 정산: 오늘이 포함된 기간 → 없으면 마지막으로 계산 가능한 기간 → 마지막 기간 */
export function defaultPeriodIndex(periods: PeriodEntry[], today: ISODate): number {
  const current = periods.findIndex((p) => isWithin(today, p.startDate, p.endDate));
  if (current >= 0) return current;
  for (let i = periods.length - 1; i >= 0; i--) if (periods[i].status.available) return i;
  return Math.max(0, periods.length - 1);
}

/** 계산 가능한 모든 정산 (최신 기준월이 위) — 기록 탭용 */
export function availableViews(data: StoreData): Settlement[] {
  const ids = new Set([...data.months.map((m) => m.id), ...data.settlements.map((r) => r.id)]);
  return [...ids]
    .sort()
    .reverse()
    .flatMap((id) => {
      const view = periodView(data, toYearMonth(id));
      return view ? [view] : [];
    });
}

/** 월별 근무표에 영향을 받는 정산(그 달이 기준월이거나 다음 달인 정산) */
export function affectedBases(ym: YearMonth): YearMonth[] {
  return [addMonths(ym, -1), ym];
}

// ---------- 변경 ----------

/** 월 근무표 추가/교체. 수령 기록은 건드리지 않는다. 관련 정산은 계산 시 자동으로 새 값이 된다. */
export function upsertMonth(data: StoreData, schedule: MonthlySchedule): StoreData {
  return { ...data, months: sortMonths([...data.months.filter((m) => m.id !== schedule.id), schedule]) };
}

/** 날짜 하나의 근무를 직접 수정 (수동 입력 = confidence 1) */
export function editShift(data: StoreData, date: ISODate, shift: Shift, now: Date = new Date()): StoreData {
  const id = monthId(monthOf(date));
  return {
    ...data,
    months: data.months.map((m) =>
      m.id === id
        ? {
            ...m,
            days: m.days.map((d) => (d.date === date ? { date, shift, source: "manual" as const, confidence: 1 } : d)),
            updatedAt: now.toISOString(),
          }
        : m,
    ),
  };
}

/** 정산 화면에서 바뀐 수령 기록을 해당 정산 기록에만 저장한다 (다른 정산에 영향 없음) */
export function saveMealUses(data: StoreData, view: Settlement, now: Date = new Date()): StoreData {
  const existing = data.settlements.find((r) => r.id === view.id);
  const record: SettlementRecord = {
    id: view.id,
    baseYear: view.baseYear,
    baseMonth: view.baseMonth,
    startDate: view.startDate,
    endDate: view.endDate,
    mealUses: view.mealUses,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return { ...data, settlements: sortRecords([...data.settlements.filter((r) => r.id !== view.id), record]) };
}

/** 수령 기록이 새로 계산된 총 가능 횟수보다 많은지 (근무표 교체·수정 후 경고용) */
export function overAllowance(view: Settlement): number {
  return Math.max(0, view.mealUses.length - view.mealAllowance);
}

/** 월 교체 전후로 수령 기록이 총 가능 횟수를 넘게 되는 정산 */
export function overAllowanceAfter(data: StoreData, ym: YearMonth): Settlement[] {
  return affectedBases(ym).flatMap((base) => {
    const view = periodView(data, base);
    return view && overAllowance(view) > 0 ? [view] : [];
  });
}

export function registeredMonths(data: StoreData): YearMonth[] {
  return sortMonths(data.months).map((m) => ({ year: m.year, month: m.month }));
}

/** 근무표 관리에서 '추가'로 보여줄 다음 달 */
export function nextMonthToAdd(data: StoreData): YearMonth | null {
  const last = sortMonths(data.months).at(-1);
  return last ? addMonths({ year: last.year, month: last.month }, 1) : null;
}

export function missingLabel(missing: YearMonth[], reference?: YearMonth): string {
  return missing
    .map((ym) => (reference && ym.year === reference.year ? `${ym.month}월` : formatYearMonth(ym)))
    .join("·");
}

// ---------- 설정: 등록된 근무표 표시 (데이터는 그대로, 화면에서만 접는다) ----------

export interface MonthListGroups {
  /** 기본 목록: 오늘이 속한 정산 기준월의 이전 달부터 이후에 등록된 달 */
  recent: YearMonth[];
  /** 지난 근무표: 그보다 오래된 달 (최신순) */
  past: YearMonth[];
  /** '추가'로 보여줄 다음 달 */
  add: YearMonth | null;
}

export function groupMonthsForList(data: StoreData, today: ISODate): MonthListGroups {
  const base = currentBase(today);
  const fromId = monthId(addMonths(base, -1));
  const months = registeredMonths(data);
  const recent = months.filter((m) => monthId(m) >= fromId);
  const past = months.filter((m) => monthId(m) < fromId).reverse();
  let add = nextMonthToAdd(data);
  // 오래 쓰지 않아 등록된 달이 모두 지났으면, 오늘이 속한 정산의 기준월부터 추가하도록 안내
  if (add && monthId(add) < fromId) add = base;
  return { recent, past, add };
}
