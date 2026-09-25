import { useEffect, useState } from "react";
import { IconAlert, IconChevronLeft, IconChevronRight, IconPhoto } from "../components/icons";
import { Spinner, TopBar } from "../components/ui";
import type { AnalysisErrorKind } from "../lib/analyzer/analyze";
import {
  type YearMonth,
  addMonths,
  formatMonthDay,
  formatYearMonth,
  settlementPeriod,
} from "../lib/dates";

// ---------- 화면 A. 초기 화면 ----------

export function WelcomeScreen({
  onStart,
  onRestoreFile,
}: {
  onStart: () => void;
  onRestoreFile: (file: File) => void;
}) {
  return (
    <div className="screen welcome">
      <div className="welcome-brand">한끼</div>
      <div className="welcome-body">
        <p className="welcome-lead">
          근무표만 넣으면
          <br />
          이번 달 간편식 횟수를
          <br />
          자동으로 계산해 드려요.
        </p>
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-primary" onClick={onStart}>
          근무표 등록하기
        </button>
        <p className="footnote">
          오늘근무 앱의
          <br />
          이번 달과 다음 달 화면을
          <br />
          각각 캡처해 주세요.
        </p>
        <label htmlFor="welcome-restore" className="text-button welcome-restore">
          백업 파일로 복원
        </label>
        <input
          id="welcome-restore"
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-label="백업 파일 선택"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onRestoreFile(file);
          }}
        />
      </div>
    </div>
  );
}

// ---------- 화면 B. 기준월 선택 ----------

export function MonthScreen({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: YearMonth;
  onChange: (ym: YearMonth) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  const { startDate, endDate } = settlementPeriod(value);
  return (
    <div className="screen">
      <TopBar onBack={onBack} />
      <div className="screen-body">
        <h1 className="title">어느 정산을 계산할까요?</h1>
        <div className="month-stepper">
          <button
            type="button"
            className="icon-button icon-button-large"
            onClick={() => onChange(addMonths(value, -1))}
            aria-label="이전 달"
          >
            <IconChevronLeft />
          </button>
          <div className="month-stepper-value" aria-live="polite">
            <div className="month-stepper-label">{formatYearMonth(value)}</div>
            <div className="month-stepper-period">
              {formatMonthDay(startDate)} ~ {formatMonthDay(endDate)}
            </div>
          </div>
          <button
            type="button"
            className="icon-button icon-button-large"
            onClick={() => onChange(addMonths(value, 1))}
            aria-label="다음 달"
          >
            <IconChevronRight />
          </button>
        </div>
        <p className="hint">
          정산기간은 기준월 21일부터 다음 달 20일까지예요. 간편식은 날짜 수와 관계없이 30일 기준으로 계산해요.
        </p>
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-primary" onClick={onNext}>
          계속
        </button>
      </div>
    </div>
  );
}

// ---------- 화면 C. 사진 등록 ----------

function PhotoSlot({
  index,
  month,
  file,
  onPick,
}: {
  index: 1 | 2;
  month: YearMonth;
  file: File | null;
  onPick: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  // 미리보기도 기기 안의 임시 주소(blob:)일 뿐, 어디에도 전송되지 않는다
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const inputId = `photo-${index}`;
  return (
    <div className="photo-slot">
      <span className="photo-index" aria-hidden="true">
        {index}
      </span>
      <div className="photo-info">
        <div className="photo-month">{index === 1 ? "이번 달 근무표" : "다음 달 근무표"}</div>
        <div className="photo-state">
          {formatYearMonth(month)}
          {file ? " · 선택됨" : ""}
        </div>
      </div>
      <div className="photo-thumb" aria-hidden="true">
        {preview ? <img src={preview} alt="" /> : <IconPhoto size={22} />}
      </div>
      <label htmlFor={inputId} className="button button-small">
        {file ? "변경" : "사진 선택"}
      </label>
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept="image/*"
        aria-label={`${index}번째 사진 선택: ${formatYearMonth(month)}`}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function PhotosScreen({
  base,
  files,
  onPick,
  onAnalyze,
  onBack,
}: {
  base: YearMonth;
  files: [File | null, File | null];
  onPick: (index: 0 | 1, file: File | null) => void;
  onAnalyze: () => void;
  onBack: () => void;
}) {
  const next = addMonths(base, 1);
  const ready = !!files[0] && !!files[1];
  return (
    <div className="screen">
      <TopBar onBack={onBack} />
      <div className="screen-body">
        <h1 className="title">근무표 가져오기</h1>
        <p className="subtitle">
          오늘근무에서
          <br />
          이번 달과 다음 달 근무표를
          <br />
          각각 캡처해 주세요.
        </p>
        <div className="photo-list">
          <PhotoSlot index={1} month={base} file={files[0]} onPick={(f) => onPick(0, f)} />
          <PhotoSlot index={2} month={next} file={files[1]} onPick={(f) => onPick(1, f)} />
        </div>
        <p className="hint">오늘근무의 월간 달력 화면 전체가 보이도록 캡처하면 가장 정확해요.</p>
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-primary" disabled={!ready} onClick={onAnalyze}>
          근무표 분석하기
        </button>
        {!ready ? <p className="footnote">두 장을 선택하면 분석할 수 있어요.</p> : null}
      </div>
    </div>
  );
}

// ---------- 화면 D. 분석 중 ----------

export function AnalyzingScreen() {
  return (
    <div className="screen analyzing" aria-busy="true">
      <div className="analyzing-body">
        <Spinner label="근무표 분석 중" />
        <p className="analyzing-text" role="status">
          근무표를 확인하고 있어요
        </p>
        <p className="footnote">사진은 서버로 보내지 않고 이 기기 안에서 분석해요.</p>
      </div>
    </div>
  );
}

// ---------- 사진 오류 ----------

export type PhotoErrorKind = AnalysisErrorKind | "read-failed";

export function errorMessage(kind: PhotoErrorKind, photo: 1 | 2 | undefined, base: YearMonth): string {
  const which = photo ? `${photo}번째 사진` : "사진";
  const expected = photo === 2 ? addMonths(base, 1) : base;
  switch (kind) {
    case "read-failed":
      return `${which}을 불러오지 못했어요.\n다른 사진으로 다시 선택해 주세요.`;
    case "dark-mode":
      return `${which}이 너무 어두워요.\n오늘근무를 라이트 모드로 두고\n다시 캡처해 주세요.`;
    case "cropped":
      return `${which}의 달력이 잘려 있어요.\n오늘근무의 월간 화면 전체가 보이도록\n다시 캡처해 주세요.`;
    case "month-mismatch":
      return `${which}이 ${formatYearMonth(expected)} 화면이 아닌 것 같아요.\n기준월과 사진을 다시 확인해 주세요.`;
    case "not-calendar":
    case "low-confidence":
    default:
      return "근무표를 정확하게 읽지 못했어요.\n오늘근무의 월간 화면 전체가 보이도록\n다시 캡처해 주세요.";
  }
}

export function PhotoErrorScreen({
  message,
  onRetry,
  onManual,
}: {
  message: string;
  onRetry: () => void;
  onManual: () => void;
}) {
  return (
    <div className="screen">
      <TopBar onBack={onRetry} />
      <div className="screen-body error-body" role="alert">
        <IconAlert size={36} className="error-icon" />
        <p className="error-message">{message}</p>
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-primary" onClick={onRetry}>
          다시 선택
        </button>
        <button type="button" className="button button-plain" onClick={onManual}>
          직접 입력하기
        </button>
      </div>
    </div>
  );
}

