import { useState } from "react";
import { PeriodCalendar } from "../components/PeriodCalendar";
import { IconAlert, IconChevronRight } from "../components/icons";
import { BottomSheet, ShiftBadge, TopBar } from "../components/ui";
import { type ISODate, formatMonthDay, formatPeriod, weekdayLabel } from "../lib/dates";
import {
  BASE_DAYS,
  SHIFTS,
  type Shift,
  type ShiftDay,
  countShifts,
  countWorkDays,
  lowConfidenceDays,
  mealAllowanceFor,
  shiftLabel,
} from "../lib/settlement";

function ShiftCounts({ shifts }: { shifts: ShiftDay[] }) {
  const counts = countShifts(shifts);
  return (
    <div className="shift-counts" aria-label={`A ${counts.A}일, B ${counts.B}일, C ${counts.C}일`}>
      {(["A", "B", "C"] as const).map((s) => (
        <span key={s} className="shift-count">
          <ShiftBadge shift={s} size="sm" />
          <span className="shift-count-value">{counts[s]}</span>
        </span>
      ))}
    </div>
  );
}

// ---------- 화면 E. 분석 결과 ----------

export function ResultScreen({
  startDate,
  endDate,
  shifts,
  swapped,
  onReview,
  onConfirm,
  onBack,
}: {
  startDate: ISODate;
  endDate: ISODate;
  shifts: ShiftDay[];
  swapped: boolean;
  onReview: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const workDays = countWorkDays(shifts);
  const allowance = mealAllowanceFor(workDays);
  const unsure = lowConfidenceDays(shifts).length;

  return (
    <div className="screen">
      <TopBar onBack={onBack} />
      <div className="screen-body result">
        <p className="eyebrow">{formatPeriod(startDate, endDate)}</p>
        <div className="result-hero">
          <span className="result-number" data-testid="result-allowance">
            {allowance}
          </span>
          <span className="result-unit">회</span>
        </div>
        <p className="result-caption">받을 수 있는 간편식</p>

        <dl className="stat-pair">
          <div>
            <dt>출근</dt>
            <dd data-testid="result-workdays">{workDays}일</dd>
          </div>
          <div>
            <dt>기준</dt>
            <dd>{BASE_DAYS}일</dd>
          </div>
        </dl>

        <ShiftCounts shifts={shifts} />

        {unsure > 0 ? (
          <button type="button" className="notice notice-warning" onClick={onReview}>
            <IconAlert size={18} />
            <span>
              확인이 필요한 날짜가 있어요 <span className="notice-count">{unsure}일</span>
            </span>
            <IconChevronRight size={16} />
          </button>
        ) : null}
        {swapped ? <p className="footnote">두 사진의 순서를 바로잡아 계산했어요.</p> : null}
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-secondary" onClick={onReview}>
          근무표 확인
        </button>
        <button type="button" className="button button-primary" onClick={onConfirm}>
          사용 시작
        </button>
      </div>
    </div>
  );
}

// ---------- 화면 F. 근무표 확인/수정 ----------

export function ShiftPicker({ value, onSelect }: { value: Shift; onSelect: (shift: Shift) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="근무 상태">
      {SHIFTS.map((s) => (
        <button
          type="button"
          key={s}
          role="radio"
          aria-checked={value === s}
          aria-label={s === "OFF" ? "휴무" : `${s} 근무`}
          className={`segment segment-${s.toLowerCase()}${value === s ? " is-selected" : ""}`}
          onClick={() => onSelect(s)}
        >
          {shiftLabel(s)}
        </button>
      ))}
    </div>
  );
}

export function ScheduleEditor({
  title = "근무표 확인",
  startDate,
  endDate,
  shifts,
  onChange,
  onDone,
  doneLabel = "완료",
}: {
  title?: string;
  startDate: ISODate;
  endDate: ISODate;
  shifts: ShiftDay[];
  onChange: (date: ISODate, shift: Shift) => void;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);
  const workDays = countWorkDays(shifts);
  const allowance = mealAllowanceFor(workDays);
  const unsure = lowConfidenceDays(shifts).length;
  const day = selected ? shifts.find((s) => s.date === selected) : undefined;

  return (
    <div className="screen">
      <TopBar title={title} onBack={onDone} />
      <div className="screen-body editor">
        <div className="editor-summary" aria-live="polite">
          <span>
            출근 <strong>{workDays}일</strong>
          </span>
          <span className="dot-sep" aria-hidden="true" />
          <span>
            간편식 <strong data-testid="editor-allowance">{allowance}회</strong>
          </span>
        </div>
        <p className="hint">
          {unsure > 0
            ? `점선으로 표시된 ${unsure}일을 확인해 주세요. 날짜를 누르면 바꿀 수 있어요.`
            : "날짜를 누르면 근무 상태를 바꿀 수 있어요."}
        </p>
        <PeriodCalendar
          startDate={startDate}
          endDate={endDate}
          shifts={shifts}
          markUnsure
          onSelect={setSelected}
          caption="근무표"
        />
        <ShiftCounts shifts={shifts} />
      </div>
      <div className="screen-footer">
        <button type="button" className="button button-primary" onClick={onDone}>
          {doneLabel}
        </button>
      </div>

      <BottomSheet
        open={!!day}
        title={day ? `${formatMonthDay(day.date)} (${weekdayLabel(day.date)})` : ""}
        subtitle="근무 상태"
        onClose={() => setSelected(null)}
      >
        {day ? (
          <>
            <ShiftPicker
              value={day.shift}
              onSelect={(shift) => {
                onChange(day.date, shift);
                setSelected(null);
              }}
            />
            <p className="sheet-note">
              {day.source === "manual"
                ? "직접 입력한 값이에요."
                : day.confidence < 0.7
                  ? "사진에서 확실하게 읽지 못했어요. 맞는 값을 골라 주세요."
                  : "사진에서 읽은 값이에요."}
            </p>
          </>
        ) : null}
      </BottomSheet>
    </div>
  );
}
