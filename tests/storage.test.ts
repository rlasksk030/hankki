import { describe, expect, it } from "vitest";
import { addMealUse, createSettlement } from "../src/lib/settlement";
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  emptyStore,
  exportJSON,
  restoreJSON,
  loadStore,
  saveStore,
  upsertSettlement,
} from "../src/lib/storage";

class MemoryStorage {
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

describe("localStorage 저장", () => {
  it("저장 후 다시 불러와도 기록이 유지되고 schemaVersion이 들어간다", () => {
    const storage = new MemoryStorage();
    const s = createSettlement({ year: 2026, month: 9 }, []);
    const data = { ...upsertSettlement(emptyStore(), s), activeId: s.id };
    expect(saveStore(data, storage)).toBe(true);
    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    const loaded = loadStore(storage);
    expect(loaded.activeId).toBe("2026-09");
    expect(loaded.settlements[0].shifts).toHaveLength(30);
  });

  it("최신 기준월이 위로 정렬되고 같은 기준월은 교체된다", () => {
    let data = emptyStore();
    data = upsertSettlement(data, createSettlement({ year: 2026, month: 8 }, []));
    data = upsertSettlement(data, createSettlement({ year: 2026, month: 9 }, []));
    data = upsertSettlement(data, createSettlement({ year: 2026, month: 9 }, []));
    expect(data.settlements.map((s) => s.id)).toEqual(["2026-09", "2026-08"]);
  });

  it("깨진 데이터는 빈 저장소로 처리한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadStore(storage).settlements).toEqual([]);
  });

  it("백업 → 복원: 정산 기록, 날짜별 A/B/C/OFF, 수령 기록이 그대로 돌아온다", () => {
    let s = createSettlement({ year: 2026, month: 9 }, [
      { date: "2026-09-21", shift: "B", source: "image", confidence: 0.95 },
    ]);
    const r = addMealUse(s, "2026-09-25");
    if (!r.ok) throw new Error();
    s = r.settlement;
    const data = { ...upsertSettlement(emptyStore(), s), activeId: s.id };
    const backup = exportJSON(data);
    expect(JSON.parse(backup).schemaVersion).toBe(SCHEMA_VERSION);
    const back = restoreJSON(backup);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.activeId).toBe("2026-09");
    expect(back.data.settlements[0].shifts[0]).toMatchObject({ date: "2026-09-21", shift: "B" });
    expect(back.data.settlements[0].shifts).toHaveLength(30);
    expect(back.data.settlements[0].mealUses.map((m) => m.date)).toEqual(["2026-09-25"]);
  });

  it("복원 시 schemaVersion과 형식을 검증한다", () => {
    const valid = JSON.parse(exportJSON(upsertSettlement(emptyStore(), createSettlement({ year: 2026, month: 9 }, [])), new Date(2026, 8, 25)));
    const withSettlement = (patch: Record<string, unknown>) =>
      JSON.stringify({ ...valid, settlements: [{ ...valid.settlements[0], ...patch }] });

    expect(restoreJSON(JSON.stringify(valid)).ok).toBe(true);
    // 잘못된 JSON / 손상된(잘린) 파일
    expect(restoreJSON("hello")).toEqual({ ok: false, reason: "not-json" });
    expect(restoreJSON(JSON.stringify(valid).slice(0, 120))).toEqual({ ok: false, reason: "not-json" });
    expect(restoreJSON("null")).toEqual({ ok: false, reason: "invalid" });
    // 다른 앱의 JSON
    expect(restoreJSON(JSON.stringify({ name: "other-app", items: [] }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(JSON.stringify({ ...valid, app: "other" }))).toEqual({ ok: false, reason: "invalid" });
    // schemaVersion 불일치
    expect(restoreJSON(JSON.stringify({ ...valid, schemaVersion: 99 }))).toEqual({ ok: false, reason: "wrong-version" });
    expect(restoreJSON(JSON.stringify({ ...valid, schemaVersion: undefined }))).toEqual({ ok: false, reason: "wrong-version" });
    // 필수 필드 누락
    expect(restoreJSON(JSON.stringify({ ...valid, settlements: undefined }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withSettlement({ startDate: undefined }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withSettlement({ baseYear: "2026" }))).toEqual({ ok: false, reason: "invalid" });
    // 날짜 형식
    expect(restoreJSON(withSettlement({ endDate: "2026/10/20" }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withSettlement({ shifts: [{ date: "9월 21일", shift: "A" }] }))).toEqual({ ok: false, reason: "invalid" });
    // shift 값 enum
    expect(restoreJSON(withSettlement({ shifts: [{ date: "2026-09-21", shift: "D" }] }))).toEqual({ ok: false, reason: "invalid" });
    // mealUses 구조
    expect(restoreJSON(withSettlement({ mealUses: [{ date: "2026-09-21" }] }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withSettlement({ mealUses: "2026-09-21" }))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("L. 다중 사용자 구조", () => {
  it("같은 URL이라도 브라우저(저장소)마다 데이터가 완전히 독립적이다", () => {
    const phoneA = new MemoryStorage();
    const phoneB = new MemoryStorage();
    const a = createSettlement({ year: 2026, month: 9 }, []);
    saveStore({ ...upsertSettlement(emptyStore(), a), activeId: a.id }, phoneA);
    // B 기기는 아무것도 보이지 않는다
    expect(loadStore(phoneB).settlements).toEqual([]);
    const b = createSettlement({ year: 2026, month: 10 }, []);
    saveStore({ ...upsertSettlement(emptyStore(), b), activeId: b.id }, phoneB);
    // 서로의 기록이 섞이지 않는다
    expect(loadStore(phoneA).settlements.map((s) => s.id)).toEqual(["2026-09"]);
    expect(loadStore(phoneB).settlements.map((s) => s.id)).toEqual(["2026-10"]);
  });

  it("저장 데이터에 사용자 식별자·계정 정보가 없다", () => {
    const storage = new MemoryStorage();
    saveStore(upsertSettlement(emptyStore(), createSettlement({ year: 2026, month: 9 }, [])), storage);
    const keys = Object.keys(JSON.parse(storage.getItem(STORAGE_KEY)!));
    expect(keys.sort()).toEqual(["activeId", "schemaVersion", "settlements"]);
    expect([...storage.map.keys()]).toEqual([STORAGE_KEY]);
  });
});
