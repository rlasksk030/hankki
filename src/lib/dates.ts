// 날짜는 항상 로컬 기준 "YYYY-MM-DD" 문자열로 다룬다. (UTC 변환으로 하루 밀리는 문제 방지)

export type ISODate = string;

export interface YearMonth {
  year: number;
  /** 1~12 */
  month: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseISODate(iso: ISODate): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function dateToISO(date: Date): ISODate {
  return toISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function todayISO(now: Date = new Date()): ISODate {
  return dateToISO(now);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 해당 월 1일의 요일 (일=0 … 토=6) */
export function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function weekdayOf(iso: ISODate): number {
  const { year, month, day } = parseISODate(iso);
  return new Date(year, month - 1, day).getDay();
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function addDays(iso: ISODate, delta: number): ISODate {
  const { year, month, day } = parseISODate(iso);
  return dateToISO(new Date(year, month - 1, day + delta));
}

export interface Period {
  base: YearMonth;
  next: YearMonth;
  startDate: ISODate;
  endDate: ISODate;
}

/** 정산기간: 기준월 21일 ~ 다음 달 20일 */
export function settlementPeriod(base: YearMonth): Period {
  const next = addMonths(base, 1);
  return {
    base,
    next,
    startDate: toISODate(base.year, base.month, 21),
    endDate: toISODate(next.year, next.month, 20),
  };
}

/** 정산기간에 포함된 모든 날짜 (시작일~종료일, 양 끝 포함) */
export function periodDates(base: YearMonth): ISODate[] {
  const { startDate, endDate } = settlementPeriod(base);
  const dates: ISODate[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** 오늘 날짜에 맞는 기준월: 21일 이후면 이번 달, 아니면 지난달 */
export function defaultBaseMonth(now: Date = new Date()): YearMonth {
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  return now.getDate() >= 21 ? current : addMonths(current, -1);
}

export function isWithin(iso: ISODate, start: ISODate, end: ISODate): boolean {
  return iso >= start && iso <= end;
}

export interface CalendarCell {
  row: number;
  column: number;
}

/** 월간 달력(일요일 시작)에서 날짜의 행/열 위치 */
export function dateCell(year: number, month: number, day: number): CalendarCell {
  const index = firstWeekday(year, month) + day - 1;
  return { row: Math.floor(index / 7), column: index % 7 };
}

/** 월간 달력에 필요한 주(행) 수: 4~6 */
export function calendarRows(year: number, month: number): number {
  return Math.ceil((firstWeekday(year, month) + daysInMonth(year, month)) / 7);
}

// ---- 표시용 포맷 ----

export function formatMonthDay(iso: ISODate): string {
  const { month, day } = parseISODate(iso);
  return `${month}월 ${day}일`;
}

export function formatDot(iso: ISODate): string {
  const { month, day } = parseISODate(iso);
  return `${month}.${day}`;
}

export function formatPeriod(start: ISODate, end: ISODate): string {
  return `${formatDot(start)} — ${formatDot(end)}`;
}

export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}년 ${ym.month}월`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayLabel(iso: ISODate): string {
  return WEEKDAYS[weekdayOf(iso)];
}

export const WEEKDAY_LABELS = WEEKDAYS;
