import { describe, expect, it } from "vitest";
import { calendarRows, dateCell, defaultBaseMonth, firstWeekday } from "../src/lib/dates";

describe("달력 좌표", () => {
  it("2026년 9월 1일은 화요일, 10월 1일은 목요일", () => {
    expect(firstWeekday(2026, 9)).toBe(2);
    expect(firstWeekday(2026, 10)).toBe(4);
  });

  it("날짜의 행/열 위치", () => {
    expect(dateCell(2026, 9, 21)).toEqual({ row: 3, column: 1 });
    expect(dateCell(2026, 9, 30)).toEqual({ row: 4, column: 3 });
    expect(dateCell(2026, 10, 1)).toEqual({ row: 0, column: 4 });
    expect(dateCell(2026, 10, 20)).toEqual({ row: 3, column: 2 });
  });

  it("4·5·6주 달력 행 수", () => {
    expect(calendarRows(2026, 2)).toBe(4); // 2026.2.1 일요일, 28일
    expect(calendarRows(2026, 9)).toBe(5);
    expect(calendarRows(2026, 10)).toBe(5);
    expect(calendarRows(2026, 8)).toBe(6); // 2026.8.1 토요일, 31일
  });

  it("기본 기준월: 21일부터는 이번 달, 20일까지는 지난달", () => {
    expect(defaultBaseMonth(new Date(2026, 8, 25))).toEqual({ year: 2026, month: 9 });
    expect(defaultBaseMonth(new Date(2026, 8, 21))).toEqual({ year: 2026, month: 9 });
    expect(defaultBaseMonth(new Date(2026, 9, 20))).toEqual({ year: 2026, month: 9 });
    expect(defaultBaseMonth(new Date(2027, 0, 5))).toEqual({ year: 2026, month: 12 });
  });
});
