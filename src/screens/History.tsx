import { useState } from "react";
import { PeriodCalendar } from "../components/PeriodCalendar";
import { IconChevronRight } from "../components/icons";
import { ShiftBadge, TopBar } from "../components/ui";
import { type ISODate, formatMonthDay, formatPeriod, isWithin, weekdayLabel } from "../lib/dates";
import { type Settlement, countShifts, remainingMeals } from "../lib/settlement";
import { MealSheet, type ToastFn } from "./Home";

function statusOf(s: Settlement, today: ISODate): string {
  const remaining = remainingMeals(s);
  if (isWithin(today, s.startDate, s.endDate)) return remaining > 0 ? `남음 ${remaining}회` : "모두 받음";
  if (today < s.startDate) return "예정";
  return remaining > 0 ? `남음 ${remaining}회` : "완료";
}

// ---------- 화면 I. 기록 ----------

export function HistoryScreen({
  settlements,
  activeId,
  today,
  onOpen,
}: {
  settlements: Settlement[];
  activeId: string | null;
  today: ISODate;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="screen">
      <div className="screen-body">
        <h1 className="large-title">기록</h1>
        {settlements.length === 0 ? (
          <p className="empty">아직 정산 기록이 없어요.</p>
        ) : (
          <ul className="list" aria-label="정산 기록">
            {settlements.map((s) => (
              <li key={s.id}>
                <button type="button" className="list-row history-row" onClick={() => onOpen(s.id)}>
                  <div className="history-main">
                    <div className="history-title">
                      {s.baseYear}.{String(s.baseMonth).padStart(2, "0")}
                      {s.id === activeId ? <span className="tag">이번 정산</span> : null}
                    </div>
                    <div className="history-period">{formatPeriod(s.startDate, s.endDate)}</div>
                    <div className="history-stats">
                      총 {s.mealAllowance}회 · 사용 {s.mealUses.length}회
                    </div>
                  </div>
                  <div className="history-status">{statusOf(s, today)}</div>
                  <IconChevronRight size={18} className="list-chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- 과거 정산 상세 ----------

export function HistoryDetailScreen({
  settlement,
  today,
  onBack,
  onUpdate,
  onEditSchedule,
  toast,
}: {
  settlement: Settlement;
  today: ISODate;
  onBack: () => void;
  onUpdate: (s: Settlement) => void;
  onEditSchedule: () => void;
  toast: ToastFn;
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);
  const counts = countShifts(settlement.shifts);
  const mealDates = new Set(settlement.mealUses.map((m) => m.date));

  return (
    <div className="screen">
      <TopBar title={`${settlement.baseYear}년 ${settlement.baseMonth}월 정산`} onBack={onBack} />
      <div className="screen-body">
        <p className="eyebrow">{formatPeriod(settlement.startDate, settlement.endDate)}</p>
        <dl className="detail-grid">
          <div>
            <dt>총 간편식</dt>
            <dd>{settlement.mealAllowance}회</dd>
          </div>
          <div>
            <dt>사용</dt>
            <dd>{settlement.mealUses.length}회</dd>
          </div>
          <div>
            <dt>남음</dt>
            <dd>{remainingMeals(settlement)}회</dd>
          </div>
          <div>
            <dt>총 근무일</dt>
            <dd>{settlement.workDays}일</dd>
          </div>
        </dl>
        <div className="shift-counts">
          {(["A", "B", "C"] as const).map((s) => (
            <span key={s} className="shift-count">
              <ShiftBadge shift={s} size="sm" />
              <span className="shift-count-value">{counts[s]}</span>
            </span>
          ))}
        </div>

        <div className="section-head">
          <h2 className="section-title">근무표</h2>
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
          caption="근무표와 수령 기록"
        />

        <h2 className="section-title section-title-spaced">수령 날짜</h2>
        {settlement.mealUses.length === 0 ? (
          <p className="empty">수령 기록이 없어요.</p>
        ) : (
          <ul className="list list-compact">
            {settlement.mealUses.map((m) => (
              <li key={m.id} className="list-row list-row-static">
                <span>
                  {formatMonthDay(m.date)} ({weekdayLabel(m.date)})
                </span>
              </li>
            ))}
          </ul>
        )}
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
