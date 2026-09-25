// 월별 근무표 → 정산기간 자동 생성, 정산별 수령 기록 독립, 월 수정 시 관련 정산만 재계산
import { describe, expect, it } from "vitest";
import {
  editShift,
  monthId,
  monthListView,
  monthWithSamePhoto,
  emptyStore,
  listPeriods,
  makeMonth,
  nextMonthToAdd,
  overAllowance,
  overAllowanceAfter,
  periodStatus,
  periodView,
  registeredMonths,
  saveMealUses,
  upsertMonth,
} from "../src/lib/schedule";
import { addMealUse, countShifts, remainingMeals } from "../src/lib/settlement";
import { EXPECTED_2026_09 } from "./expected";
import { NOW, expectedMonth, monthDays } from "./helpers";

const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };
const DEC = { year: 2026, month: 12 };

const sepOct = () => upsertMonth(upsertMonth(emptyStore(), expectedMonth(SEP)), expectedMonth(OCT));

function receive(data: ReturnType<typeof emptyStore>, base: typeof SEP, dates: string[]) {
  let view = periodView(data, base)!;
  for (const d of dates) {
    const r = addMealUse(view, d, NOW);
    if (!r.ok) throw new Error(`${d}: ${r.reason}`);
    view = r.settlement;
  }
  return saveMealUses(data, view, NOW);
}

describe("여러 정산기간", () => {
  it("1. 9월+10월만 등록 → 9.21~10.20 계산, 10.21~11.20은 11월 근무표 필요", () => {
    const data = sepOct();
    const sep = periodStatus(data, SEP);
    expect(sep.available).toBe(true);
    if (!sep.available) return;
    expect(countShifts(sep.view.shifts)).toMatchObject({ A: 6, B: 11, C: 6 });
    expect(sep.view.workDays).toBe(23);
    expect(sep.view.mealAllowance).toBe(7);
    expect(Object.fromEntries(sep.view.shifts.map((s) => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);

    const oct = periodStatus(data, OCT);
    expect(oct).toEqual({ available: false, missing: [NOV] });

    // 메인 화면 목록: 계산 가능한 정산 + 다음 정산(11월 필요)
    const periods = listPeriods(data, "2026-09-25");
    expect(periods.map((p) => [p.id, p.status.available])).toEqual([
      ["2026-09", true],
      ["2026-10", false],
    ]);
  });

  it("2. 11월 추가 → 10.21~11.20 자동 생성", () => {
    const data = upsertMonth(sepOct(), expectedMonth(NOV));
    const view = periodView(data, OCT)!;
    expect(view.startDate).toBe("2026-10-21");
    expect(view.endDate).toBe("2026-11-20");
    expect(countShifts(view.shifts)).toMatchObject({ A: 8, B: 6, C: 8 });
    expect(view.workDays).toBe(22);
    expect(view.mealAllowance).toBe(8);
    expect(listPeriods(data, "2026-09-25").map((p) => [p.id, p.status.available])).toEqual([
      ["2026-09", true],
      ["2026-10", true],
      ["2026-11", false],
    ]);
  });

  it("3. 12월 추가 → 11.21~12.20 자동 생성", () => {
    const data = upsertMonth(upsertMonth(sepOct(), expectedMonth(NOV)), expectedMonth(DEC));
    const view = periodView(data, NOV)!;
    expect(view.startDate).toBe("2026-11-21");
    expect(view.endDate).toBe("2026-12-20");
    expect(countShifts(view.shifts)).toMatchObject({ A: 6, B: 6, C: 12 });
    expect(view.workDays).toBe(24);
    expect(view.mealAllowance).toBe(6);
    expect(registeredMonths(data)).toEqual([SEP, OCT, NOV, DEC]);
    expect(nextMonthToAdd(data)).toEqual({ year: 2027, month: 1 });
  });

  it("4. 월별 근무 데이터는 정산 사이에서 중복 저장되지 않는다", () => {
    let data = upsertMonth(sepOct(), expectedMonth(NOV));
    data = receive(data, SEP, ["2026-09-25"]);
    data = receive(data, OCT, ["2026-10-25"]);
    const json = JSON.stringify(data);
    // 10월 15일(9월 정산)·10월 25일(10월 정산)의 근무는 월별 근무표에만 한 번 저장된다
    const occurrences = (needle: string) => json.split(`"date":"${needle}","shift"`).length - 1;
    expect(occurrences("2026-10-15")).toBe(1);
    expect(occurrences("2026-10-25")).toBe(1);
    expect(data.months.filter((m) => m.id === "2026-10")).toHaveLength(1);
    // 정산 기록에는 근무표가 없다 (수령 기록만)
    for (const r of data.settlements) expect(Object.keys(r)).not.toContain("shifts");
    // 같은 달을 다시 넣어도 한 번만 저장
    data = upsertMonth(data, expectedMonth(OCT));
    expect(data.months.map((m) => m.id)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("5. 정산별 수령 기록은 서로 독립적이다", () => {
    let data = upsertMonth(sepOct(), expectedMonth(NOV));
    data = receive(data, SEP, ["2026-09-21", "2026-09-25", "2026-10-02"]);
    const sep = periodView(data, SEP)!;
    const oct = periodView(data, OCT)!;
    expect([sep.mealAllowance, sep.mealUses.length, remainingMeals(sep)]).toEqual([7, 3, 4]);
    expect([oct.mealAllowance, oct.mealUses.length, remainingMeals(oct)]).toEqual([8, 0, 8]);
    // 10월 정산에 기록해도 9월 정산은 그대로
    data = receive(data, OCT, ["2026-10-22"]);
    expect(periodView(data, SEP)!.mealUses.map((m) => m.date)).toEqual(["2026-09-21", "2026-09-25", "2026-10-02"]);
    expect(periodView(data, OCT)!.mealUses.map((m) => m.date)).toEqual(["2026-10-22"]);
  });

  it("6. 월 근무표 수정 시 그 날짜가 속한 정산만 다시 계산된다", () => {
    const data = upsertMonth(upsertMonth(sepOct(), expectedMonth(NOV)), expectedMonth(DEC));
    const before = [SEP, OCT, NOV].map((b) => periodView(data, b)!.mealAllowance);
    expect(before).toEqual([7, 8, 6]);

    // 10월 6일(A, 9월 정산) → 휴: 9월 정산만 +1
    const a = editShift(data, "2026-10-06", "OFF", NOW);
    expect([SEP, OCT, NOV].map((b) => periodView(a, b)!.mealAllowance)).toEqual([8, 8, 6]);
    expect(a.months.find((m) => m.id === "2026-10")!.days[5]).toMatchObject({ shift: "OFF", source: "manual", confidence: 1 });

    // 10월 25일(C, 10월 정산) → 휴: 10월 정산만 +1
    const b = editShift(data, "2026-10-25", "OFF", NOW);
    expect([SEP, OCT, NOV].map((x) => periodView(b, x)!.mealAllowance)).toEqual([7, 9, 6]);

    // 10월 근무표 전체 교체(모두 휴): 10월을 쓰는 9월·10월 정산만 바뀌고 11월 정산은 그대로
    const allOff = makeMonth(OCT, monthDays(OCT, Array(31).fill("OFF")), NOW);
    const c = upsertMonth(data, allOff);
    const after = [SEP, OCT, NOV].map((x) => periodView(c, x)!);
    expect(after[0].workDays).toBe(8); // 9.21~9.30 근무만 남음
    expect(after[1].workDays).toBe(14); // 11.1~11.20 근무만 남음
    expect(after[2].mealAllowance).toBe(6);
  });

  it("교체로 총 가능 횟수가 수령 횟수보다 적어지면 경고 대상이 되고, 수령 기록은 지우지 않는다", () => {
    let data = sepOct();
    data = receive(data, SEP, ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(overAllowance(periodView(data, SEP)!)).toBe(0);
    // 10월에 근무를 늘린 근무표로 교체 → 9월 정산 총 가능 횟수 감소
    const busier = makeMonth(OCT, monthDays(OCT, Array(31).fill("A")), NOW);
    const replaced = upsertMonth(data, busier);
    const view = periodView(replaced, SEP)!;
    expect(view.mealAllowance).toBe(2); // 9.21~9.30 근무 8일 + 10.1~10.20 근무 20일 = 28일
    expect(view.mealUses).toHaveLength(7);
    expect(overAllowance(view)).toBe(5);
    expect(remainingMeals(view)).toBe(0);
    expect(overAllowanceAfter(replaced, OCT).map((v) => v.id)).toEqual(["2026-09"]);
  });

  it("7. 기존 2026-09-21~10-20 결과 회귀 없음: A6 B11 C6, 근무 23, 간편식 7", () => {
    const view = periodView(sepOct(), SEP)!;
    expect(countShifts(view.shifts)).toMatchObject({ A: 6, B: 11, C: 6 });
    expect(view.workDays).toBe(23);
    expect(view.mealAllowance).toBe(7);
  });

  it("오늘이 포함된 정산을 기본으로 고른다 (근무표가 없으면 추가 안내 대상)", () => {
    const data = sepOct();
    const periods = listPeriods(data, "2026-12-25");
    // 오늘(12.25)의 정산(12.21~1.20)도 목록에 들어가고, 필요한 달을 알려 준다
    const todayEntry = periods.find((p) => p.id === "2026-12")!;
    expect(todayEntry.status).toEqual({ available: false, missing: [DEC, { year: 2027, month: 1 }] });
  });
});

describe("설정의 등록된 근무표 목록 (기본 4개월 고정, 화면에서만)", () => {
  const JAN27 = { year: 2027, month: 1 };
  const FEB27 = { year: 2027, month: 2 };
  const blank = (ym: typeof SEP, n: number) => makeMonth(ym, monthDays(ym, Array(n).fill("OFF")), NOW);
  const withMonths = (extra: Array<[typeof SEP, number]>) =>
    extra.reduce((d, [ym, n]) => upsertMonth(d, blank(ym, n)), upsertMonth(upsertMonth(sepOct(), expectedMonth(NOV)), expectedMonth(DEC)));
  const rows = (v: ReturnType<typeof monthListView>) => v.window.map((r) => [monthId(r.ym), r.registered]);

  it("9·10월만 있을 때(9.25): 9·10월 등록됨, 11·12월 추가 — 4행", () => {
    expect(rows(monthListView(sepOct(), "2026-09-25"))).toEqual([
      ["2026-09", true],
      ["2026-10", true],
      ["2026-11", false],
      ["2026-12", false],
    ]);
  });

  it("1월·2월을 추가해도 기본 목록은 9~12월 4행 그대로, 전체에는 모두 있음", () => {
    const data = withMonths([
      [JAN27, 31],
      [FEB27, 28],
    ]);
    const v = monthListView(data, "2026-09-25");
    expect(v.window).toHaveLength(4);
    expect(rows(v)).toEqual([
      ["2026-09", true],
      ["2026-10", true],
      ["2026-11", true],
      ["2026-12", true],
    ]);
    expect(v.all.map(monthId)).toEqual(["2027-02", "2027-01", "2026-12", "2026-11", "2026-10", "2026-09"]);
    expect(v.next).toEqual({ year: 2027, month: 3 });
  });

  it("날짜가 지나면 4개월 창이 자동으로 이동한다 (10.25 → 10~1월, 11.25 → 11~2월)", () => {
    const data = withMonths([
      [JAN27, 31],
      [FEB27, 28],
    ]);
    expect(monthListView(data, "2026-10-25").window.map((r) => monthId(r.ym))).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(monthListView(data, "2026-11-25").window.map((r) => monthId(r.ym))).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    // 10월 20일까지는 아직 9월 정산 → 9~12월
    expect(monthListView(data, "2026-10-20").window.map((r) => monthId(r.ym))).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    // 창 밖으로 숨겨져도 데이터와 정산은 그대로
    expect(data.months).toHaveLength(6);
    expect(periodView(data, SEP)!.mealAllowance).toBe(7);
  });
});

describe("같은 사진 중복 등록 확인", () => {
  it("다른 달에 같은 사진 지문이 있으면 그 달을 알려 주고, 같은 달 교체는 중복으로 보지 않는다", () => {
    const hash = "f0".repeat(32);
    const data = upsertMonth(sepOct(), makeMonth(NOV, expectedMonth(NOV).days, NOW, { photoHash: hash }));
    const same = (a: string, b: string) => a === b;
    expect(monthWithSamePhoto(data, hash, DEC, same)).toEqual(NOV);
    expect(monthWithSamePhoto(data, hash, NOV, same)).toBeNull();
    expect(monthWithSamePhoto(data, "0f".repeat(32), DEC, same)).toBeNull();
  });
});
