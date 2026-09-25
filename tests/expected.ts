// 사용자가 제공한 실제 근무표 (2026-09-21 ~ 2026-10-20).
// 구현 코드와 독립적으로, 스크린샷을 사람이 직접 읽어 적은 정답지다.
import type { Shift } from "../src/lib/settlement";
import syntheticMonths from "./fixtures/synthetic-months.json";

export const EXPECTED_2026_09: Record<string, Shift> = {
  "2026-09-21": "B",
  "2026-09-22": "B",
  "2026-09-23": "B",
  "2026-09-24": "B",
  "2026-09-25": "B",
  "2026-09-26": "OFF",
  "2026-09-27": "OFF",
  "2026-09-28": "C",
  "2026-09-29": "C",
  "2026-09-30": "C",
  "2026-10-01": "C",
  "2026-10-02": "C",
  "2026-10-03": "C",
  "2026-10-04": "OFF",
  "2026-10-05": "OFF",
  "2026-10-06": "A",
  "2026-10-07": "A",
  "2026-10-08": "A",
  "2026-10-09": "A",
  "2026-10-10": "A",
  "2026-10-11": "A",
  "2026-10-12": "OFF",
  "2026-10-13": "OFF",
  "2026-10-14": "B",
  "2026-10-15": "B",
  "2026-10-16": "B",
  "2026-10-17": "B",
  "2026-10-18": "B",
  "2026-10-19": "B",
  "2026-10-20": "OFF",
};

/**
 * 월 전체(1일~말일) 정답.
 * - 2026-09, 2026-10: 실제 오늘근무 스크린샷을 사람이 직접 읽어 적은 값
 * - 2026-11, 2026-12: 합성 fixture의 패턴(tests/fixtures/synthetic-months.json)
 */
const seq = (spec: Array<[Shift, number]>): Shift[] => spec.flatMap(([s, n]) => Array<Shift>(n).fill(s));

export const EXPECTED_MONTHS: Record<string, Shift[]> = {
  "2026-09": seq([["B", 1], ["OFF", 2], ["C", 6], ["OFF", 2], ["A", 6], ["OFF", 2], ["B", 6], ["OFF", 2], ["C", 3]]),
  "2026-10": seq([["C", 3], ["OFF", 2], ["A", 6], ["OFF", 2], ["B", 6], ["OFF", 2], ["C", 6], ["OFF", 2], ["A", 2]]),
  ...(syntheticMonths as unknown as Record<string, Shift[]>),
};
delete EXPECTED_MONTHS._comment;
