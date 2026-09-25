// 실제 이미지 판독 회귀 테스트.
// 오늘근무 스크린샷(2026년 9월/10월)을 디코딩해서 브라우저와 같은 분석 코드(analyzePair)에 넣고,
// 결과를 독립적으로 적은 정답지(tests/expected.ts)와 비교한다.
//
// - deid-2026-09/10.png: 공개 저장소용 비식별 fixture (상태 표시줄·칸 라벨 제거, scripts/deidentify-fixtures.mjs)
// - private/oneulgeunmu-2026-09/10.webp: 원본 스크린샷 (개인 정보 보호를 위해 gitignore, 로컬에 있을 때만 실행)
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeMonth, analyzePair } from "../src/lib/analyzer/analyze";
import { findHorizontalLines } from "../src/lib/analyzer/grid";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import { countShifts, createSettlement } from "../src/lib/settlement";
import { EXPECTED_2026_09, EXPECTED_MONTHS } from "./expected";
import { emptyStore, makeMonth, periodView, upsertMonth } from "../src/lib/schedule";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function decode(path: string, resizeWidth?: number): Promise<RasterImage> {
  let pipeline = sharp(path).ensureAlpha();
  if (resizeWidth) pipeline = pipeline.resize({ width: resizeWidth });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

const SEP = { year: 2026, month: 9 };

const FIXTURE_SETS = [
  { name: "비식별 fixture", sepFile: "deid-2026-09.png", octFile: "deid-2026-10.png" },
  { name: "원본 스크린샷(로컬 전용)", sepFile: "private/oneulgeunmu-2026-09.webp", octFile: "private/oneulgeunmu-2026-10.webp" },
];

describe.each(FIXTURE_SETS)("오늘근무 스크린샷 판독: $name", ({ sepFile, octFile }) => {
  const available = existsSync(fixture(sepFile)) && existsSync(fixture(octFile));
  let sep: RasterImage;
  let oct: RasterImage;

  beforeAll(async () => {
    if (!available) return;
    sep = await decode(fixture(sepFile));
    oct = await decode(fixture(octFile));
  });

  if (!available) {
    it.skip("fixture 파일이 없어 건너뜀", () => {});
    return;
  }

  it("달력 격자선을 찾는다", () => {
    const lines = findHorizontalLines(sep);
    expect(lines.length).toBeGreaterThanOrEqual(6);
  });

  it("9월 + 10월 화면 → 30일 모두 정답과 일치, A6 B11 C6, 근무 23, 간편식 7", () => {
    const result = analyzePair(sep, oct, SEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.swapped).toBe(false);
    expect(result.diagnostics.every((d) => d.grid.detected && d.grid.rows === 5)).toBe(true);

    const read = Object.fromEntries(result.shifts.map((s) => [s.date, s.shift]));
    expect(read).toEqual(EXPECTED_2026_09);

    const low = result.shifts.filter((s) => s.confidence < 0.7);
    expect(low).toEqual([]);

    const s = createSettlement(SEP, result.shifts);
    expect(countShifts(s.shifts)).toMatchObject({ A: 6, B: 11, C: 6 });
    expect(s.workDays).toBe(23);
    expect(s.mealAllowance).toBe(7);
  });

  it("두 장 모두 월 전체(1일~말일)를 읽는다 → 9월 30일·10월 31일 모두 정답과 일치", () => {
    const result = analyzePair(sep, oct, SEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.months[0].map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
    expect(result.months[1].map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-10"]);
    expect(result.months[0][0].date).toBe("2026-09-01");
    expect(result.months[1].at(-1)!.date).toBe("2026-10-31");
    // 월별 근무표로 저장해도 9월 정산 결과는 그대로
    const data = upsertMonth(upsertMonth(emptyStore(), makeMonth(SEP, result.months[0])), makeMonth({ year: 2026, month: 10 }, result.months[1]));
    const view = periodView(data, SEP)!;
    expect(countShifts(view.shifts)).toMatchObject({ A: 6, B: 11, C: 6 });
    expect([view.workDays, view.mealAllowance]).toEqual([23, 7]);
  });

  it("사진 한 장으로 한 달 판독 (9월, 10월 각각)", () => {
    const s9 = analyzeMonth(sep, SEP);
    const s10 = analyzeMonth(oct, { year: 2026, month: 10 });
    expect(s9.ok && s10.ok).toBe(true);
    if (!s9.ok || !s10.ok) return;
    expect(s9.days.map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
    expect(s10.days.map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-10"]);
  });

  it("사진 순서가 반대(10월, 9월)여도 자동으로 바로잡는다", () => {
    const result = analyzePair(oct, sep, SEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.swapped).toBe(true);
    expect(Object.fromEntries(result.shifts.map((s) => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);
  });

  it("실제 iPhone 해상도(1179px 폭)로 키워도 같은 결과", async () => {
    const bigSep = await decode(fixture(sepFile), 1179);
    const bigOct = await decode(fixture(octFile), 1179);
    const result = analyzePair(bigSep, bigOct, SEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.fromEntries(result.shifts.map((s) => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);
  });

  it("작게 줄인 사진(600px 폭)도 같은 결과", async () => {
    const smallSep = await decode(fixture(sepFile), 600);
    const smallOct = await decode(fixture(octFile), 600);
    const result = analyzePair(smallSep, smallOct, SEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.fromEntries(result.shifts.map((s) => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);
  });

  it("같은 사진을 두 번 넣으면 두 번째 사진이 맞지 않다고 알려준다", () => {
    const result = analyzePair(sep, sep, SEP);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("month-mismatch");
    expect(result.photo).toBe(2);
  });

  it("기준월을 잘못 고르면(8월) 달력이 맞지 않다고 알려준다", () => {
    const result = analyzePair(sep, oct, { year: 2026, month: 8 });
    expect(result.ok).toBe(false);
  });

  it("달력이 아닌 사진(흰 화면)은 판독하지 않는다", () => {
    const blank: RasterImage = { width: 400, height: 860, data: new Uint8Array(400 * 860 * 4).fill(255) };
    const result = analyzePair(blank, blank, SEP);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("not-calendar");
  });

  it("어두운 사진은 다크 모드 안내를 한다", () => {
    const dark: RasterImage = { width: 400, height: 860, data: new Uint8Array(400 * 860 * 4).fill(20) };
    const result = analyzePair(dark, dark, SEP);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("dark-mode");
  });

  it("아래쪽이 잘린 스크린샷은 잘렸다고 알려준다", async () => {
    const meta = await sharp(fixture(octFile)).metadata();
    const { data, info } = await sharp(fixture(octFile))
      .extract({ left: 0, top: 0, width: meta.width!, height: 1300 })
      .extend({ bottom: 700, background: "#ffffff" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cropped: RasterImage = { width: info.width, height: info.height, data: new Uint8Array(data) };
    const result = analyzePair(sep, cropped, SEP);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.photo).toBe(2);
    expect(["cropped", "not-calendar", "month-mismatch"]).toContain(result.kind);
  });
});

describe("다음 달 근무표 추가 (합성 11월·12월 화면)", () => {
  // 합성 fixture: 실제 10월 화면의 칸 조각으로 만든 11월·12월 화면 (scripts/make-synthetic-months.mjs)
  const NOV = { year: 2026, month: 11 };
  const DEC = { year: 2026, month: 12 };
  let nov: RasterImage;
  let dec: RasterImage;
  let sep: RasterImage;
  let oct: RasterImage;

  beforeAll(async () => {
    nov = await decode(fixture("synthetic-2026-11.png"));
    dec = await decode(fixture("synthetic-2026-12.png"));
    sep = await decode(fixture("deid-2026-09.png"));
    oct = await decode(fixture("deid-2026-10.png"));
  });

  it("11월·12월 한 장씩 판독이 패턴과 일치하고 확인 필요 날짜가 없다", () => {
    const n = analyzeMonth(nov, NOV);
    const d = analyzeMonth(dec, DEC);
    expect(n.ok && d.ok).toBe(true);
    if (!n.ok || !d.ok) return;
    expect(n.days.map((x) => x.shift)).toEqual(EXPECTED_MONTHS["2026-11"]);
    expect(d.days.map((x) => x.shift)).toEqual(EXPECTED_MONTHS["2026-12"]);
    expect([...n.days, ...d.days].filter((x) => x.confidence < 0.7)).toEqual([]);
  });

  it("다른 달 사진을 넣으면 맞지 않다고 알려준다 (10월 화면을 11월로)", () => {
    const r = analyzeMonth(oct, NOV);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("month-mismatch");
  });

  it("9·10월(2장) + 11월 + 12월 판독 → 정산 3개: 7회 · 8회 · 6회", () => {
    const pair = analyzePair(sep, oct, SEP);
    const n = analyzeMonth(nov, NOV);
    const d = analyzeMonth(dec, DEC);
    if (!pair.ok || !n.ok || !d.ok) throw new Error("판독 실패");
    let data = upsertMonth(emptyStore(), makeMonth(SEP, pair.months[0]));
    data = upsertMonth(data, makeMonth({ year: 2026, month: 10 }, pair.months[1]));
    expect(periodView(data, { year: 2026, month: 10 })).toBeNull(); // 11월 없으면 계산하지 않음
    data = upsertMonth(data, makeMonth(NOV, n.days));
    data = upsertMonth(data, makeMonth(DEC, d.days));
    expect([SEP, { year: 2026, month: 10 }, NOV].map((b) => periodView(data, b)!.mealAllowance)).toEqual([7, 8, 6]);
  });
});
