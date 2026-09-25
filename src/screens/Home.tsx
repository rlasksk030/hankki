import { useState } from "react";
import { PeriodCalendar } from "../components/PeriodCalendar";
import { IconCheck } from "../components/icons";
import { BottomSheet } from "../components/ui";
import { type ISODate, formatMonthDay, formatPeriod, isWithin, weekdayLabel } from "../lib/dates";
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

export function HomeScreen({
  settlement,
  today,
  onUpdate,
  onEditSchedule,
  onNewPeriod,
  toast,
}: {
  settlement: Settlement;
  today: ISODate;
  onUpdate: (s: Settlement) => void;
  onEditSchedule: () => void;
  onNewPeriod: () => void;
  toast: ToastFn;
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);
  const remaining = remainingMeals(settlement);
  const used = settlement.mealUses.length;
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
        <header className="home-header">
          <p className="eyebrow">이번 정산</p>
          <p className="home-period">{formatPeriod(settlement.startDate, settlement.endDate)}</p>
        </header>

        <section className="home-hero" aria-label="남은 간편식">
          <div className="home-number" key={remaining} data-testid="remaining" aria-live="polite">
            {remaining}
          </div>
          <p className="home-caption">남은 간편식</p>
          <p className="home-usage" data-testid="usage">
            {used}회 사용 · 총 {settlement.mealAllowance}회
          </p>
          <p className="home-meta">
            출근 {settlement.workDays}일 · 기준 {BASE_DAYS}일
          </p>
        </section>

        {ended ? (
          <button type="button" className="notice" onClick={onNewPeriod}>
            <span>정산기간이 끝났어요. 다음 근무표를 등록해 주세요.</span>
          </button>
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
            caption="수령 달력"
          />
          <p className="legend">
            <IconCheck size={13} strokeWidth={2.4} /> 간편식 받은 날 · 날짜를 눌러 기록하거나 취소할 수 있어요
          </p>
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
