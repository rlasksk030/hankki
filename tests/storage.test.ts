import { describe, expect, it } from "vitest";
import { emptyStore, makeMonth, periodView, saveMealUses, upsertMonth } from "../src/lib/schedule";
import { addMealUse, createSettlement } from "../src/lib/settlement";
import { SCHEMA_VERSION, STORAGE_KEY, exportJSON, loadStore, restoreJSON, saveStore } from "../src/lib/storage";
import { EXPECTED_2026_09 } from "./expected";
import { MemoryStorage, NOW, expectedMonth } from "./helpers";

const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };

function sampleStore() {
  let data = upsertMonth(upsertMonth(emptyStore(), expectedMonth(SEP)), expectedMonth(OCT));
  const view = periodView(data, SEP)!;
  const r = addMealUse(view, "2026-09-25", NOW);
  if (!r.ok) throw new Error(r.reason);
  data = saveMealUses(data, r.settlement, NOW);
  return data;
}

describe("localStorage 저장", () => {
  it("저장 후 다시 불러와도 기록이 유지되고 schemaVersion이 들어간다", () => {
    const storage = new MemoryStorage();
    expect(saveStore(sampleStore(), storage)).toBe(true);
    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    const loaded = loadStore(storage);
    expect(loaded.months.map((m) => m.id)).toEqual(["2026-09", "2026-10"]);
    const view = periodView(loaded, SEP)!;
    expect(view.workDays).toBe(23);
    expect(view.mealUses.map((m) => m.date)).toEqual(["2026-09-25"]);
  });

  it("깨진 데이터는 빈 저장소로 처리한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadStore(storage)).toEqual(emptyStore());
  });

  it("v1 저장 데이터(정산마다 날짜별 근무)를 월별 근무표로 옮긴다", () => {
    const storage = new MemoryStorage();
    const v1Settlement = createSettlement(
      SEP,
      Object.entries(EXPECTED_2026_09).map(([date, shift]) => ({ date, shift, source: "image" as const, confidence: 0.9 })),
      NOW,
    );
    const withMeal = addMealUse(v1Settlement, "2026-09-25", NOW);
    if (!withMeal.ok) throw new Error();
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, activeId: "2026-09", settlements: [withMeal.settlement] }));
    const loaded = loadStore(storage);
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.months.map((m) => m.id)).toEqual(["2026-09", "2026-10"]);
    const view = periodView(loaded, SEP)!;
    expect(view.workDays).toBe(23);
    expect(view.mealAllowance).toBe(7);
    expect(view.mealUses).toHaveLength(1);
  });

  it("백업 → 복원: 월별 근무표(A/B/C/OFF)와 정산별 수령 기록이 그대로 돌아온다", () => {
    const backup = exportJSON(sampleStore(), NOW);
    const parsed = JSON.parse(backup);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.app).toBe("hankki");
    const back = restoreJSON(backup);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.months[0].days).toHaveLength(30);
    expect(back.data.months[1].days).toHaveLength(31);
    const view = periodView(back.data, SEP)!;
    expect(view.shifts[0]).toMatchObject({ date: "2026-09-21", shift: "B" });
    expect(view.mealUses.map((m) => m.date)).toEqual(["2026-09-25"]);
    expect(view.mealAllowance).toBe(7);
  });

  it("월 검증 근거(monthCheck)와 사진 지문(photoHash)은 백업·복원 후에도 유지되고, 형식이 틀리면 버린다", () => {
    const hash = "a".repeat(64);
    let data = upsertMonth(emptyStore(), makeMonth(SEP, expectedMonth(SEP).days, NOW, { monthCheck: "title", photoHash: hash }));
    data = upsertMonth(data, makeMonth(OCT, expectedMonth(OCT).days, NOW, { monthCheck: "user-confirmed" }));
    const back = restoreJSON(exportJSON(data, NOW));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.months[0]).toMatchObject({ monthCheck: "title", photoHash: hash });
    expect(back.data.months[1].monthCheck).toBe("user-confirmed");
    const raw = JSON.parse(exportJSON(data, NOW));
    raw.months[0].monthCheck = "hacked";
    raw.months[0].photoHash = "<script>";
    const cleaned = restoreJSON(JSON.stringify(raw));
    expect(cleaned.ok).toBe(true);
    if (!cleaned.ok) return;
    expect(cleaned.data.months[0].monthCheck).toBeUndefined();
    expect(cleaned.data.months[0].photoHash).toBeUndefined();
  });

  it("v1 백업 파일도 복원된다", () => {
    const v1 = createSettlement(
      SEP,
      Object.entries(EXPECTED_2026_09).map(([date, shift]) => ({ date, shift, source: "image" as const, confidence: 0.9 })),
      NOW,
    );
    const back = restoreJSON(JSON.stringify({ app: "hankki", schemaVersion: 1, activeId: v1.id, settlements: [v1] }));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(periodView(back.data, SEP)!.mealAllowance).toBe(7);
  });

  it("복원 시 앱·schemaVersion·형식을 검증한다", () => {
    const valid = JSON.parse(exportJSON(sampleStore(), NOW));
    const withMonth = (patch: Record<string, unknown>) =>
      JSON.stringify({ ...valid, months: [{ ...valid.months[0], ...patch }, valid.months[1]] });
    const withRecord = (patch: Record<string, unknown>) =>
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
    expect(restoreJSON(JSON.stringify({ ...valid, months: undefined }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(JSON.stringify({ ...valid, settlements: undefined }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withRecord({ startDate: undefined }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withRecord({ baseYear: "2026" }))).toEqual({ ok: false, reason: "invalid" });
    // 날짜 형식
    expect(restoreJSON(withRecord({ endDate: "2026/10/20" }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withMonth({ days: [{ date: "9월 21일", shift: "A" }] }))).toEqual({ ok: false, reason: "invalid" });
    // 다른 달의 날짜가 섞인 월 근무표
    expect(restoreJSON(withMonth({ days: [{ date: "2026-10-01", shift: "A" }] }))).toEqual({ ok: false, reason: "invalid" });
    // shift 값 enum
    expect(restoreJSON(withMonth({ days: [{ date: "2026-09-21", shift: "D" }] }))).toEqual({ ok: false, reason: "invalid" });
    // mealUses 구조
    expect(restoreJSON(withRecord({ mealUses: [{ date: "2026-09-21" }] }))).toEqual({ ok: false, reason: "invalid" });
    expect(restoreJSON(withRecord({ mealUses: "2026-09-21" }))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("L. 다중 사용자 구조", () => {
  it("같은 URL이라도 브라우저(저장소)마다 데이터가 완전히 독립적이다", () => {
    const phoneA = new MemoryStorage();
    const phoneB = new MemoryStorage();
    saveStore(upsertMonth(emptyStore(), expectedMonth(SEP)), phoneA);
    expect(loadStore(phoneB).months).toEqual([]);
    saveStore(upsertMonth(emptyStore(), expectedMonth(OCT)), phoneB);
    expect(loadStore(phoneA).months.map((m) => m.id)).toEqual(["2026-09"]);
    expect(loadStore(phoneB).months.map((m) => m.id)).toEqual(["2026-10"]);
  });

  it("저장 데이터에 사용자 식별자·계정 정보가 없다", () => {
    const storage = new MemoryStorage();
    saveStore(sampleStore(), storage);
    const keys = Object.keys(JSON.parse(storage.getItem(STORAGE_KEY)!));
    expect(keys.sort()).toEqual(["months", "schemaVersion", "settlements"]);
    expect([...storage.map.keys()]).toEqual([STORAGE_KEY]);
  });
});
