import { type Settlement, type ShiftDay, recompute } from "./settlement";

// 모든 데이터는 이 브라우저의 localStorage에만 저장된다. 이미지 원본은 저장하지 않는다.
export const STORAGE_KEY = "hankki:v1:settlements";
export const SCHEMA_VERSION = 1;

export interface StoreData {
  schemaVersion: typeof SCHEMA_VERSION;
  /** 메인 화면('이번 정산')에 보여줄 정산 id */
  activeId: string | null;
  settlements: Settlement[];
}

export function emptyStore(): StoreData {
  return { schemaVersion: SCHEMA_VERSION, activeId: null, settlements: [] };
}

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

/** 향후 스키마가 바뀌면 여기서 이전 버전을 변환한다. */
export function migrate(raw: unknown): StoreData {
  if (!raw || typeof raw !== "object") return emptyStore();
  const data = raw as Partial<StoreData> & { schemaVersion?: number };
  if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.settlements)) return emptyStore();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeId: typeof data.activeId === "string" ? data.activeId : null,
    settlements: data.settlements.filter(
      (s): s is Settlement => !!s && typeof s.id === "string" && Array.isArray(s.shifts) && Array.isArray(s.mealUses),
    ),
  };
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

/** 같은 기준월 정산이 있으면 교체하고, 최신 기준월이 위로 오도록 정렬한다. */
export function upsertSettlement(data: StoreData, s: Settlement): StoreData {
  const settlements = [...data.settlements.filter((x) => x.id !== s.id), s].sort((a, b) =>
    b.id.localeCompare(a.id),
  );
  return { ...data, settlements };
}

export function removeSettlement(data: StoreData, id: string): StoreData {
  const settlements = data.settlements.filter((s) => s.id !== id);
  return {
    ...data,
    settlements,
    activeId: data.activeId === id ? (settlements[0]?.id ?? null) : data.activeId,
  };
}

/** 백업 파일에는 정산 기록, 날짜별 A/B/C/OFF, 간편식 수령 기록이 모두 들어간다. (이미지 없음) */
export function exportJSON(data: StoreData, now: Date = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: now.toISOString(), ...data }, null, 2);
}

export const BACKUP_APP = "hankki";

export type RestoreResult =
  | { ok: true; data: StoreData }
  | { ok: false; reason: "not-json" | "wrong-version" | "invalid" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_VALUES = new Set(["A", "B", "C", "OFF"]);

function isValidSettlement(value: unknown): value is Settlement {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string" || !/^\d{4}-\d{2}$/.test(s.id)) return false;
  if (typeof s.baseYear !== "number" || typeof s.baseMonth !== "number") return false;
  if (typeof s.startDate !== "string" || !DATE_RE.test(s.startDate)) return false;
  if (typeof s.endDate !== "string" || !DATE_RE.test(s.endDate)) return false;
  if (!Array.isArray(s.shifts) || !Array.isArray(s.mealUses)) return false;
  const shiftsOk = s.shifts.every(
    (d) =>
      !!d &&
      typeof d === "object" &&
      typeof (d as Record<string, unknown>).date === "string" &&
      DATE_RE.test((d as Record<string, string>).date) &&
      SHIFT_VALUES.has((d as Record<string, string>).shift),
  );
  const mealsOk = s.mealUses.every(
    (m) =>
      !!m &&
      typeof m === "object" &&
      typeof (m as Record<string, unknown>).id === "string" &&
      typeof (m as Record<string, unknown>).date === "string" &&
      DATE_RE.test((m as Record<string, string>).date),
  );
  return shiftsOk && mealsOk;
}

/** 백업 파일 복원. schemaVersion과 데이터 형식을 검증하고, 하나라도 어긋나면 복원하지 않는다. */
export function restoreJSON(text: string): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "invalid" };
  const raw = parsed as Record<string, unknown>;
  // 한끼가 만든 백업 파일만 받는다 (다른 앱의 JSON 거부)
  if (raw.app !== BACKUP_APP) return { ok: false, reason: "invalid" };
  if (raw.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: "wrong-version" };
  if (!Array.isArray(raw.settlements) || !raw.settlements.every(isValidSettlement)) {
    return { ok: false, reason: "invalid" };
  }
  // 파생값(근무일·간편식 횟수)은 파일을 믿지 않고 근무표로 다시 계산한다
  const settlements = (raw.settlements as Settlement[])
    .map((s) =>
      recompute(
        {
          ...s,
          shifts: s.shifts.map(
            (d): ShiftDay => ({
              date: d.date,
              shift: d.shift,
              source: d.source === "image" ? "image" : "manual",
              confidence: typeof d.confidence === "number" ? d.confidence : 1,
            }),
          ),
        },
        new Date(s.updatedAt ?? Date.now()),
      ),
    )
    .sort((a, b) => b.id.localeCompare(a.id));
  const activeId =
    typeof raw.activeId === "string" && settlements.some((s) => s.id === raw.activeId)
      ? raw.activeId
      : (settlements[0]?.id ?? null);
  return { ok: true, data: { schemaVersion: SCHEMA_VERSION, activeId, settlements } };
}
