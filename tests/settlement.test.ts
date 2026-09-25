import { describe, expect, it } from "vitest";
import { periodDates, settlementPeriod } from "../src/lib/dates";
import {
  type Shift,
  type ShiftDay,
  addMealUse,
  countShifts,
  createSettlement,
  remainingMeals,
  removeMealUse,
  setShift,
} from "../src/lib/settlement";
import { EXPECTED_2026_09 } from "./expected";

const SEP = { year: 2026, month: 9 };
const NOW = new Date(2026, 8, 25, 12, 0, 0);

const toShifts = (map: Record<string, Shift>): ShiftDay[] =>
  Object.entries(map).map(([date, shift]) => ({ date, shift, source: "image", confidence: 0.95 }));

/** 정산기간 앞에서부터 workDays개를 근무(B)로, 나머지를 휴로 채운 근무표 */
function withWorkDays(base: { year: number; month: number }, workDays: number): ShiftDay[] {
  return periodDates(base).map((date, i) => ({
    date,
    shift: i < workDays ? "B" : "OFF",
    source: "manual",
    confidence: 1,
  }));
}

function addUses(s: ReturnType<typeof createSettlement>, dates: string[]) {
  let cur = s;
  for (const d of dates) {
    const r = addMealUse(cur, d, NOW);
    if (!r.ok) throw new Error(r.reason);
    cur = r.settlement;
  }
  return cur;
}

describe("간편식 계산", () => {
  it("A. 2026-09-21~2026-10-20 실제 근무표: A6 B11 C6, 근무 23일, 간편식 7회", () => {
    const s = createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW);
    const counts = countShifts(s.shifts);
    expect(s.shifts).toHaveLength(30);
    expect(counts.A).toBe(6);
    expect(counts.B).toBe(11);
    expect(counts.C).toBe(6);
    expect(s.workDays).toBe(23);
    expect(s.mealAllowance).toBe(7);
  });

  it("B. 근무 20일이면 간편식 10회", () => {
    expect(createSettlement(SEP, withWorkDays(SEP, 20), NOW).mealAllowance).toBe(10);
  });

  it("C. 근무 30일이면 간편식 0회", () => {
    expect(createSettlement(SEP, withWorkDays(SEP, 30), NOW).mealAllowance).toBe(0);
  });

  it("D. 총 7회 중 3회 수령하면 남은 횟수 4", () => {
    const s = addUses(createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW), [
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
    expect(s.mealUses).toHaveLength(3);
    expect(remainingMeals(s)).toBe(4);
  });

  it("E. 같은 날짜 두 번 수령 시도 시 중복 생성되지 않음", () => {
    const s = addUses(createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW), ["2026-09-25"]);
    const again = addMealUse(s, "2026-09-25", NOW);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("duplicate");
    expect(s.mealUses).toHaveLength(1);
    expect(remainingMeals(s)).toBe(6);
  });

  it("F. 수령 기록 삭제 시 남은 횟수 즉시 복구", () => {
    const s = addUses(createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW), ["2026-09-25", "2026-09-26"]);
    expect(remainingMeals(s)).toBe(5);
    const removed = removeMealUse(s, "2026-09-25", NOW);
    expect(remainingMeals(removed)).toBe(6);
    expect(removed.mealUses.map((m) => m.date)).toEqual(["2026-09-26"]);
  });

  it("G. A→휴 수동 변경: 근무 -1, 간편식 +1, 수동 입력은 confidence 1", () => {
    const s = createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW);
    const edited = setShift(s, "2026-10-06", "OFF", NOW);
    expect(edited.workDays).toBe(s.workDays - 1);
    expect(edited.mealAllowance).toBe(s.mealAllowance + 1);
    const day = edited.shifts.find((d) => d.date === "2026-10-06");
    expect(day).toMatchObject({ shift: "OFF", source: "manual", confidence: 1 });
  });

  it("H. 휴→C 변경: 근무 +1, 간편식 -1", () => {
    const s = createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW);
    const edited = setShift(s, "2026-09-26", "C", NOW);
    expect(edited.workDays).toBe(24);
    expect(edited.mealAllowance).toBe(6);
  });

  it("I. 월말 날짜 계산: 2026년 9월 정산 = 2026-09-21 ~ 2026-10-20 (30일)", () => {
    const p = settlementPeriod(SEP);
    expect(p.startDate).toBe("2026-09-21");
    expect(p.endDate).toBe("2026-10-20");
    const dates = periodDates(SEP);
    expect(dates[0]).toBe("2026-09-21");
    expect(dates[9]).toBe("2026-09-30");
    expect(dates[10]).toBe("2026-10-01");
    expect(dates.at(-1)).toBe("2026-10-20");
    expect(dates).toHaveLength(30);
  });

  it("J. 2월이 포함되어도 기준은 30 (2027년 1월 정산: 1.21~2.20, 31일)", () => {
    const jan = { year: 2027, month: 1 };
    expect(periodDates(jan)).toHaveLength(31);
    expect(createSettlement(jan, withWorkDays(jan, 20), NOW).mealAllowance).toBe(10);
    // 2월 21일~3월 20일(28일)도 30 기준
    const feb = { year: 2027, month: 2 };
    expect(periodDates(feb)).toHaveLength(28);
    expect(createSettlement(feb, withWorkDays(feb, 20), NOW).mealAllowance).toBe(10);
    // 윤년 2028년 2월 정산 (29일)
    const leap = { year: 2028, month: 2 };
    expect(periodDates(leap)).toHaveLength(29);
    expect(createSettlement(leap, withWorkDays(leap, 15), NOW).mealAllowance).toBe(15);
  });

  it("K. 31일 달도 기준은 30 (2026년 10월 정산: 10.21~11.20, 31일)", () => {
    const oct = { year: 2026, month: 10 };
    expect(periodDates(oct)).toHaveLength(31);
    expect(createSettlement(oct, withWorkDays(oct, 23), NOW).mealAllowance).toBe(7);
    // 31일 모두 근무해도 0 미만이 되지 않는다
    expect(createSettlement(oct, withWorkDays(oct, 31), NOW).mealAllowance).toBe(0);
  });

  it("남은 횟수가 0이면 더 기록할 수 없고, 0 미만이 되지 않는다", () => {
    const s = createSettlement(SEP, withWorkDays(SEP, 28), NOW); // 총 2회
    const used = addUses(s, ["2026-10-19", "2026-10-20"]);
    expect(remainingMeals(used)).toBe(0);
    const r = addMealUse(used, "2026-10-18", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("exhausted");
    // 근무를 늘려 총 횟수가 줄어도 남은 횟수는 0
    expect(remainingMeals(setShift(used, "2026-10-20", "A", NOW))).toBe(0);
  });

  it("정산기간 밖의 날짜는 기록하지 않는다", () => {
    const s = createSettlement(SEP, toShifts(EXPECTED_2026_09), NOW);
    const r = addMealUse(s, "2026-10-21", NOW);
    expect(r.ok).toBe(false);
  });
});
