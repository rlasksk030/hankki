// 정산 경계: 기준월 20일 23시 ~ 다음 달 20일 23시 전.
// 근무표는 날짜 단위이므로 20일의 C(23시 이후 시작)만 다음 정산으로 계산하고, A·B는 날짜 그대로 둔다.
// 20일 23시 ~ 24시에는 앱의 '오늘'(현재 정산·오늘 표시·수령 기록 날짜)이 21일이 된다.
import { describe, expect, it } from "vitest";
import { appToday, defaultBaseMonth } from "../src/lib/dates";
import { currentBase, defaultPeriodIndex, listPeriods, periodStatus, periodView, upsertMonth, emptyStore, makeMonth } from "../src/lib/schedule";
import { type Shift, addMealUse, boundaryShifts, countedShifts, countWorkDays, createSettlement } from "../src/lib/settlement";
import { EXPECTED_MONTHS } from "./expected";
import { NOW, monthDays } from "./helpers";

const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };
const sep = () => EXPECTED_MONTHS["2026-09"];
const oct = () => EXPECTED_MONTHS["2026-10"];
const nov = () => EXPECTED_MONTHS["2026-11"];
const withDay = (shifts: Shift[], day: number, shift: Shift) => shifts.map((s, i) => (i === day - 1 ? shift : s));

function store(months: Array<[{ year: number; month: number }, Shift[]]>) {
  return months.reduce((data, [ym, shifts]) => upsertMonth(data, makeMonth(ym, monthDays(ym, shifts), NOW)), emptyStore());
}

describe("앱의 '오늘'은 20일 23시에 다음 정산으로 넘어간다", () => {
  it("20일 22:59까지는 20일, 23:00부터는 21일", () => {
    expect(appToday(new Date(2026, 9, 20, 22, 59))).toBe("2026-10-20");
    expect(appToday(new Date(2026, 9, 20, 23, 0))).toBe("2026-10-21");
    expect(appToday(new Date(2026, 9, 20, 23, 59))).toBe("2026-10-21");
    expect(appToday(new Date(2026, 9, 21, 0, 30))).toBe("2026-10-21");
    expect(appToday(new Date(2026, 11, 20, 23, 30))).toBe("2026-12-21"); // 연말도 같은 규칙
  });
  it("다른 날의 23시는 그대로", () => {
    expect(appToday(new Date(2026, 9, 15, 23, 30))).toBe("2026-10-15");
    expect(appToday(new Date(2026, 9, 19, 23, 30))).toBe("2026-10-19");
    expect(appToday(new Date(2026, 9, 21, 23, 30))).toBe("2026-10-21");
  });
  it("정산 선택의 기본 기준월도 20일 23시에 바뀐다", () => {
    expect(defaultBaseMonth(new Date(2026, 9, 20, 22, 59))).toEqual(SEP);
    expect(defaultBaseMonth(new Date(2026, 9, 20, 23, 0))).toEqual(OCT);
    expect(currentBase(appToday(new Date(2026, 9, 20, 23, 0)))).toEqual(OCT);
  });
  it("20일 23시 이후 '오늘'로 기록한 간편식은 다음 정산(21일)에 들어간다", () => {
    const data = store([[SEP, sep()], [OCT, oct()], [NOV, nov()]]);
    const today = appToday(new Date(2026, 9, 20, 23, 30));
    const periods = listPeriods(data, today);
    expect(periods[defaultPeriodIndex(periods, today)].id).toBe("2026-10");
    const septemberPeriod = periodView(data, SEP)!;
    expect(addMealUse(septemberPeriod, today)).toMatchObject({ ok: false, reason: "out-of-period" });
    const r = addMealUse(periodView(data, OCT)!, today);
    expect(r.ok && r.settlement.mealUses.map((m) => m.date)).toEqual(["2026-10-21"]);
  });
});

describe("근무 계산: 20일의 C만 정산을 옮긴다", () => {
  it("기준월 20일 C는 이번 정산, 다음 달 20일 C는 다음 정산", () => {
    // 9월 20일 C, 10월 20일 C
    const data = store([[SEP, withDay(sep(), 20, "C")], [OCT, withDay(oct(), 20, "C")]]);
    const view = periodView(data, SEP)!;
    // 기존 9.21~10.20 근무 23일 + 9월 20일 C(+1) − 10월 20일 C(원래 휴였으므로 0) = 24
    expect(view.workDays).toBe(24);
    expect(view.mealAllowance).toBe(6);
    expect(view.shifts[0]).toMatchObject({ date: "2026-09-20", shift: "C" });
    expect(boundaryShifts(view.shifts, view.startDate, view.endDate)).toEqual({ carriedIn: "2026-09-20", carriedOut: "2026-10-20" });
  });
  it("20일의 A·B는 날짜 그대로: 기준월 20일 A는 지난 정산, 다음 달 20일 B는 이번 정산", () => {
    const data = store([[SEP, withDay(sep(), 20, "A")], [OCT, withDay(oct(), 20, "B")]]);
    const view = periodView(data, SEP)!;
    expect(view.shifts[0].date).toBe("2026-09-21"); // 9월 20일 A는 이 정산 목록에 없다
    expect(view.workDays).toBe(24); // 23 + 10월 20일 B
    expect(boundaryShifts(view.shifts, view.startDate, view.endDate)).toEqual({ carriedIn: null, carriedOut: null });
  });
  it("같은 C는 두 정산에 중복으로 세지 않는다 (10월 20일 C: 9월 정산 제외, 10월 정산 포함)", () => {
    const data = store([[SEP, sep()], [OCT, withDay(oct(), 20, "C")], [NOV, nov()]]);
    const sepView = periodView(data, SEP)!;
    const octView = periodView(data, OCT)!;
    const base = store([[SEP, sep()], [OCT, oct()], [NOV, nov()]]);
    expect(sepView.workDays).toBe(periodView(base, SEP)!.workDays); // 원래 휴 → C로 바꿔도 9월 정산은 그대로
    expect(octView.workDays).toBe(periodView(base, OCT)!.workDays + 1); // 10월 정산에만 1일
  });
  it("기준월 20일 근무표가 없는 예전 데이터도 계산을 막지 않는다", () => {
    const partialSep = makeMonth(SEP, monthDays(SEP, sep()).slice(20), NOW); // 9월 21일~30일만
    const data = upsertMonth(upsertMonth(emptyStore(), partialSep), makeMonth(OCT, monthDays(OCT, oct()), NOW));
    const status = periodStatus(data, SEP);
    expect(status.available).toBe(true);
    if (status.available) expect([status.view.workDays, status.view.mealAllowance]).toEqual([23, 7]);
  });
  it("countedShifts와 createSettlement가 같은 규칙", () => {
    const shifts = [
      ...monthDays(SEP, withDay(sep(), 20, "C")).slice(19),
      ...monthDays(OCT, withDay(oct(), 20, "C")).slice(0, 20),
    ];
    const s = createSettlement(SEP, shifts, NOW);
    expect(s.workDays).toBe(countWorkDays(countedShifts(shifts, "2026-09-21", "2026-10-20")));
    expect(s.workDays).toBe(24);
  });
  it("기존 9.21~10.20 결과는 그대로: A6 B11 C6, 근무 23, 간편식 7 (9월 20일 B, 10월 20일 휴)", () => {
    const view = periodView(store([[SEP, sep()], [OCT, oct()]]), SEP)!;
    expect([view.workDays, view.mealAllowance]).toEqual([23, 7]);
  });
});
