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
import { analyzePair } from "../src/lib/analyzer/analyze";
import { findHorizontalLines } from "../src/lib/analyzer/grid";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import { countShifts, createSettlement } from "../src/lib/settlement";
import { EXPECTED_2026_09 } from "./expected";

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
