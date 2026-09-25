import { type MonthlySchedule, SCHEMA_VERSION, type SettlementRecord, type StoreData, emptyStore, makeMonth } from "./schedule";
import type { MealUse, Shift, ShiftDay } from "./settlement";

export { SCHEMA_VERSION, emptyStore };
export type { StoreData };

// 모든 데이터는 이 브라우저의 localStorage에만 저장된다. 이미지 원본은 저장하지 않는다.
// (키 이름은 처음 버전 그대로 두고, 안의 schemaVersion으로 구조 버전을 구분한다)
export const STORAGE_KEY = "hankki:v1:settlements";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// ---------- 형식 검증 ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const SHIFT_VALUES = new Set<Shift>(["A", "B", "C", "OFF"]);

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

function validDay(d: unknown): boolean {
  return isObj(d) && typeof d.date === "string" && DATE_RE.test(d.date) && SHIFT_VALUES.has(d.shift as Shift);
}

function validMeal(m: unknown): boolean {
  return isObj(m) && typeof m.id === "string" && typeof m.date === "string" && DATE_RE.test(m.date);
}

function normalizeDay(d: Rec): ShiftDay {
  return {
    date: d.date as string,
    shift: d.shift as Shift,
    source: d.source === "image" ? "image" : "manual",
    confidence: typeof d.confidence === "number" ? d.confidence : 1,
  };
}

function normalizeMeal(m: Rec): MealUse {
  return { id: m.id as string, date: m.date as string, createdAt: typeof m.createdAt === "string" ? m.createdAt : "" };
}

function validV2Month(m: unknown): boolean {
  return (
    isObj(m) &&
    typeof m.id === "string" &&
    MONTH_RE.test(m.id) &&
    typeof m.year === "number" &&
    typeof m.month === "number" &&
    Array.isArray(m.days) &&
    m.days.every((d) => validDay(d) && String((d as Rec).date).startsWith(`${m.id}-`))
  );
}

function validRecord(r: unknown): boolean {
  return (
    isObj(r) &&
    typeof r.id === "string" &&
    MONTH_RE.test(r.id) &&
    typeof r.baseYear === "number" &&
    typeof r.baseMonth === "number" &&
    typeof r.startDate === "string" &&
    DATE_RE.test(r.startDate) &&
    typeof r.endDate === "string" &&
    DATE_RE.test(r.endDate) &&
    Array.isArray(r.mealUses) &&
    r.mealUses.every(validMeal)
  );
}

/** v1 정산(날짜별 근무를 정산마다 가짐) 형식 검증 */
function validV1Settlement(s: unknown): boolean {
  return validRecord(s) && Array.isArray((s as Rec).shifts) && ((s as Rec).shifts as unknown[]).every(validDay);
}

function fromV2(raw: Rec): StoreData {
  const months: MonthlySchedule[] = (raw.months as Rec[]).map((m) => ({
    id: m.id as string,
    year: m.year as number,
    month: m.month as number,
    days: (m.days as Rec[]).map(normalizeDay).sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : "",
  }));
  const settlements: SettlementRecord[] = (raw.settlements as Rec[]).map((r) => ({
    id: r.id as string,
    baseYear: r.baseYear as number,
    baseMonth: r.baseMonth as number,
    startDate: r.startDate as string,
    endDate: r.endDate as string,
    mealUses: (r.mealUses as Rec[]).map(normalizeMeal),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    months: months.sort((a, b) => a.id.localeCompare(b.id)),
    settlements: settlements.sort((a, b) => b.id.localeCompare(a.id)),
  };
}

/**
 * v1 → v2: 정산마다 들고 있던 날짜별 근무를 월별 근무표로 합친다(같은 날짜는 나중에 수정된 정산 값 우선).
 * 수령 기록은 정산별로 그대로 옮긴다.
 */
function fromV1(raw: Rec): StoreData {
  const v1 = [...(raw.settlements as Rec[])].sort((a, b) =>
    String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? "")),
  );
  const days = new Map<string, ShiftDay>();
  for (const s of v1) for (const d of s.shifts as Rec[]) days.set(d.date as string, normalizeDay(d));
  const byMonth = new Map<string, ShiftDay[]>();
  for (const d of days.values()) {
    const id = d.date.slice(0, 7);
    byMonth.set(id, [...(byMonth.get(id) ?? []), d]);
  }
  const months = [...byMonth.entries()].map(([id, list]) => {
    const [year, month] = id.split("-").map(Number);
    return { ...makeMonth({ year, month }, list), updatedAt: "" };
  });
  return fromV2({
    months,
    settlements: v1.map((s) => ({ ...s, shifts: undefined })),
  });
}

export type ParseResult =
  | { ok: true; data: StoreData }
  | { ok: false; reason: "invalid" | "wrong-version" };

/** 저장소/백업 공통: 버전을 확인하고 v1은 v2로 옮긴다 */
export function parseStore(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, reason: "invalid" };
  if (raw.schemaVersion === SCHEMA_VERSION) {
    if (!Array.isArray(raw.months) || !raw.months.every(validV2Month)) return { ok: false, reason: "invalid" };
    if (!Array.isArray(raw.settlements) || !raw.settlements.every(validRecord)) return { ok: false, reason: "invalid" };
    return { ok: true, data: fromV2(raw) };
  }
  if (raw.schemaVersion === 1) {
    if (!Array.isArray(raw.settlements) || !raw.settlements.every(validV1Settlement)) return { ok: false, reason: "invalid" };
    return { ok: true, data: fromV1(raw) };
  }
  return { ok: false, reason: "wrong-version" };
}

export function migrate(raw: unknown): StoreData {
  const result = parseStore(raw);
  return result.ok ? result.data : emptyStore();
}

export function loadStore(storage: StorageLike | null = defaultStorage()): StoreData {
  if (!storage) return emptyStore();
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? migrate(JSON.parse(text)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(data: StoreData, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearStore(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* 무시 */
  }
}

// ---------- 백업 / 복원 ----------

export const BACKUP_APP = "hankki";

/** 백업 파일: 월별 근무표(날짜별 A/B/C/OFF)와 정산별 간편식 수령 기록. 이미지는 없다. */
export function exportJSON(data: StoreData, now: Date = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: now.toISOString(), ...data }, null, 2);
}

export type RestoreResult =
  | { ok: true; data: StoreData }
  | { ok: false; reason: "not-json" | "wrong-version" | "invalid" };

/**
 * 백업 파일 복원. 한끼 백업인지(app), schemaVersion(1 또는 2), 필수 필드·날짜 형식·근무 값·수령 기록 구조를
 * 검증하고 하나라도 어긋나면 복원하지 않는다. 근무일·간편식 횟수는 파일 값을 쓰지 않고 근무표로 다시 계산한다.
 */
export function restoreJSON(text: string): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (!isObj(parsed)) return { ok: false, reason: "invalid" };
  // 한끼가 만든 백업 파일만 받는다 (다른 앱의 JSON 거부)
  if (parsed.app !== BACKUP_APP) return { ok: false, reason: "invalid" };
  return parseStore(parsed);
}
