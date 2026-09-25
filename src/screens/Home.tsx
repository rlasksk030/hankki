import { type ReactNode, useState } from "react";
import { PeriodCalendar } from "../components/PeriodCalendar";
import { IconAlert, IconCheck, IconChevronLeft, IconChevronRight } from "../components/icons";
import { BottomSheet } from "../components/ui";
import { type ISODate, type YearMonth, formatMonthDay, formatPeriod, isWithin, weekdayLabel } from "../lib/dates";
import { type PeriodEntry, missingLabel, overAllowance } from "../lib/schedule";
import {
  BASE_DAYS,
  type Settlement,
  addMealUse,
  hasMealOn,
  remainingMeals,
  removeMealUse,
  shiftOn,
} from "../lib/settlement";

export type ToastFn = (title: string, body?: string) => void;

/** 화면 H: 날짜를 눌렀을 때의 수령 기록 시트 */
export function MealSheet({
  settlement,
  date,
  onClose,
  onUpdate,
  toast,
}: {
  settlement: Settlement;
  date: ISODate | null;
  onClose: () => void;
  onUpdate: (s: Settlement) => void;
  toast: ToastFn;
}) {
  const day = date ? shiftOn(settlement, date) : undefined;
  const received = date ? hasMealOn(settlement, date) : false;
  const remaining = remainingMeals(settlement);

  return (
    <BottomSheet
      open={!!date}
      title={date ? `${formatMonthDay(date)} (${weekdayLabel(date)})` : ""}
      onClose={onClose}
    >
      {date ? (
        <>
          <dl className="sheet-list">
            <div>
              <dt>근무</dt>
              <dd>{day ? (day.shift === "OFF" ? "휴" : day.shift) : "—"}</dd>
            </div>
            <div>
              <dt>간편식</dt>
              <dd className={received ? "is-done" : ""}>
                {received ? (
                  <>
                    <IconCheck size={16} strokeWidth={2.2} /> 수령 완료
                  </>
                ) : (
                  "미수령"
                )}
              </dd>
            </div>
          </dl>
          {received ? (
            <button
              type="button"
              className="button button-secondary button-danger-text"
              onClick={() => {
                onUpdate(removeMealUse(settlement, date));
                toast(formatMonthDay(date), "수령 기록을 취소했어요");
                onClose();
              }}
            >
              수령 취소
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={remaining <= 0}
              onClick={() => {
                const r = addMealUse(settlement, date);
                if (r.ok) {
                  onUpdate(r.settlement);
                  toast(formatMonthDay(date), "간편식 수령을 기록했어요");
                } else if (r.reason === "exhausted") {
                  toast("남은 간편식이 없어요");
                }
                onClose();
              }}
            >
              이 날 수령으로 기록
            </button>
          )}
          {!received && remaining <= 0 ? <p className="sheet-note">이번 정산의 간편식을 모두 받았어요.</p> : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

// ---------- 화면 G. 메인 '이번 정산' ----------

function periodLabel(entry: PeriodEntry, today: ISODate): string {
  if (isWithin(today, entry.startDate, entry.endDate)) return "이번 정산";
  return today > entry.endDate ? "지난 정산" : "다음 정산";
}

/** ‹ 9.21 — 10.20 › : 정산기간 좌우 이동 */
function PeriodNav({
  periods,
  index,
  today,
  onSelect,
}: {
  periods: PeriodEntry[];
  index: number;
  today: ISODate;
  onSelect: (index: number) => void;
}) {
  const entry = periods[index];
  const prev = periods[index - 1];
  const next = periods[index + 1];
  return (
    <header className="home-header period-nav">
      <button
        type="button"
        className="icon-button"
        onClick={() => onSelect(index - 1)}
        disabled={!prev}
        aria-label={prev ? `이전 정산 ${formatPeriod(prev.startDate, prev.endDate)}` : "이전 정산 없음"}
      >
        <IconChevronLeft />
      </button>
      <p className="period-nav-label" aria-live="polite">
        <span className="period-nav-kind" data-testid="period-label">
          {periodLabel(entry, today)}
        </span>
        <span className="home-period" data-testid="period">
          {formatPeriod(entry.startDate, entry.endDate)}
        </span>
      </p>
      <button
        type="button"
        className="icon-button"
        onClick={() => onSelect(index + 1)}
        disabled={!next}
        aria-label={next ? `다음 정산 ${formatPeriod(next.startDate, next.endDate)}` : "다음 정산 없음"}
      >
        <IconChevronRight />
      </button>
    </header>
  );
}

export function HomeScreen({
  periods,
  index,
  today,
  onSelect,
  onUpdate,
  onEditSchedule,
  onAddMonth,
  toast,
}: {
  periods: PeriodEntry[];
  index: number;
  today: ISODate;
  onSelect: (index: number) => void;
  onUpdate: (s: Settlement) => void;
  onEditSchedule: (id: string) => void;
  onAddMonth: (ym: YearMonth) => void;
  toast: ToastFn;
}) {
  const entry = periods[index];
  if (!entry) return null;
  const nav = <PeriodNav periods={periods} index={index} today={today} onSelect={onSelect} />;

  if (!entry.status.available) {
    // 필요한 달의 근무표가 없으면 계산값을 만들지 않고 추가를 안내한다
    const missing = entry.status.missing;
    const label = missingLabel(missing, entry.base);
    return (
      <div className="screen home">
        <div className="screen-body home-body">
          {nav}
          <section className="home-missing" aria-label="근무표 필요">
            <p className="home-missing-text">
              {label} 근무표를 추가하면
              <br />
              간편식 횟수를 계산할 수 있어요.
            </p>
            <button type="button" className="button button-primary" onClick={() => onAddMonth(missing[0])}>
              {missing[0].month}월 근무표 추가
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <PeriodHome
      key={entry.id}
      nav={nav}
      settlement={entry.status.view}
      today={today}
      onUpdate={onUpdate}
      onEditSchedule={() => onEditSchedule(entry.id)}
      toast={toast}
    />
  );
}

function PeriodHome({
  nav,
  settlement,
  today,
  onUpdate,
  onEditSchedule,
  toast,
}: {
  nav: ReactNode;
  settlement: Settlement;
  today: ISODate;
  onUpdate: (s: Settlement) => void;
  onEditSchedule: () => void;
  toast: ToastFn;
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);
  const remaining = remainingMeals(settlement);
  const used = settlement.mealUses.length;
  const over = overAllowance(settlement);
  const receivedToday = hasMealOn(settlement, today);
  const inPeriod = isWithin(today, settlement.startDate, settlement.endDate);
  const ended = today > settlement.endDate;
  const mealDates = new Set(settlement.mealUses.map((m) => m.date));

  const recordToday = () => {
    if (receivedToday) {
      toast("오늘은 이미 기록되어 있어요.");
      return;
    }
    const r = addMealUse(settlement, today);
    if (r.ok) {
      onUpdate(r.settlement);
      toast(formatMonthDay(today), "간편식 수령을 기록했어요");
    } else if (r.reason === "duplicate") {
      toast("오늘은 이미 기록되어 있어요.");
    } else if (r.reason === "exhausted") {
      toast("남은 간편식이 없어요");
    }
  };

  let ctaLabel = "오늘 간편식 받았어요";
  let ctaDisabled = false;
  if (!inPeriod) {
    ctaDisabled = true;
    ctaLabel = ended ? "정산기간이 끝났어요" : "아직 정산기간 전이에요";
  } else if (receivedToday) {
    ctaLabel = "오늘 받은 것으로 기록됨";
  } else if (remaining <= 0) {
    ctaDisabled = true;
    ctaLabel = "이번 정산 간편식을 모두 받았어요";
  }

  return (
    <div className="screen home">
      <div className="screen-body home-body">
        {nav}

        <section className="home-summary" aria-label="남은 간편식">
          <div className="home-number" key={remaining} data-testid="remaining" aria-live="polite">
            {remaining}
          </div>
          <div className="home-summary-text">
            <p className="home-caption">남은 간편식</p>
            <p className="home-usage" data-testid="usage">
              {used}회 사용 · 총 {settlement.mealAllowance}회
            </p>
            <p className="home-meta">
              출근 {settlement.workDays}일 · 기준 {BASE_DAYS}일
            </p>
          </div>
        </section>

        {over > 0 ? (
          <p className="notice notice-warning" role="alert" data-testid="over-warning">
            <IconAlert size={18} />
            <span>
              수령 기록 {used}회가 총 가능 횟수 {settlement.mealAllowance}회보다 {over}회 많아요. 근무표나 수령 기록을 확인해
              주세요.
            </span>
          </p>
        ) : null}
        <section className="home-calendar" aria-label="수령 달력">
          <div className="section-head">
            <h2 className="section-title">수령 기록</h2>
            <button type="button" className="text-button" onClick={onEditSchedule}>
              근무표 수정
            </button>
          </div>
          <PeriodCalendar
            startDate={settlement.startDate}
            endDate={settlement.endDate}
            shifts={settlement.shifts}
            mealDates={mealDates}
            today={today}
            onSelect={setSelected}
            caption="수령 달력 — 날짜를 눌러 간편식 수령을 기록하거나 취소"
            fill
          />
        </section>
      </div>

      <div className="cta-dock">
        <button
          type="button"
          className={`button button-primary button-cta${receivedToday && inPeriod ? " is-done" : ""}`}
          onClick={recordToday}
          disabled={ctaDisabled}
          aria-label={ctaLabel}
        >
          {receivedToday && inPeriod ? <IconCheck size={20} strokeWidth={2.2} /> : null}
          {ctaLabel}
        </button>
      </div>

      <MealSheet
        settlement={settlement}
        date={selected}
        onClose={() => setSelected(null)}
        onUpdate={onUpdate}
        toast={toast}
      />
    </div>
  );
}
