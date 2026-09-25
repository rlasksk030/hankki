import { type ISODate, WEEKDAY_LABELS, addDays, formatMonthDay, parseISODate, weekdayOf } from "../lib/dates";
import { LOW_CONFIDENCE, type ShiftDay, shiftLabel } from "../lib/settlement";
import { IconCheck } from "./icons";

interface Props {
  startDate: ISODate;
  endDate: ISODate;
  shifts: ShiftDay[];
  /** 간편식을 받은 날짜 */
  mealDates?: Set<ISODate>;
  today?: ISODate;
  /** 확신도가 낮은 날짜를 점선으로 표시 (근무표 확인 화면) */
  markUnsure?: boolean;
  onSelect?: (date: ISODate) => void;
  caption?: string;
}

/** 정산기간(예: 9.21~10.20)을 일요일 시작 주 단위로 이어서 보여주는 달력 */
export function PeriodCalendar({ startDate, endDate, shifts, mealDates, today, markUnsure, onSelect, caption }: Props) {
  const byDate = new Map(shifts.map((s) => [s.date, s]));
  const gridStart = addDays(startDate, -weekdayOf(startDate));
  const gridEnd = addDays(endDate, 6 - weekdayOf(endDate));

  const weeks: ISODate[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }

  return (
    <div className="calendar" role="grid" aria-label={caption ?? "정산기간 달력"}>
      <div className="calendar-row calendar-head" role="row">
        {WEEKDAY_LABELS.map((w, i) => (
          <span
            key={w}
            role="columnheader"
            className={`calendar-weekday${i === 0 ? " is-sun" : i === 6 ? " is-sat" : ""}`}
          >
            {w}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div className="calendar-row" role="row" key={week[0]}>
          {week.map((date) => {
            const inPeriod = date >= startDate && date <= endDate;
            if (!inPeriod) return <span key={date} className="calendar-cell is-empty" role="gridcell" />;
            const day = byDate.get(date);
            const { month, day: dayNumber } = parseISODate(date);
            const showMonth = dayNumber === 1 || date === startDate;
            const meal = mealDates?.has(date) ?? false;
            const unsure = markUnsure && day && day.confidence < LOW_CONFIDENCE;
            const isToday = date === today;
            const label = [
              formatMonthDay(date),
              day ? (day.shift === "OFF" ? "휴무" : `${day.shift} 근무`) : "",
              meal ? "간편식 수령" : "",
              unsure ? "확인 필요" : "",
              isToday ? "오늘" : "",
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <button
                type="button"
                key={date}
                role="gridcell"
                className={`calendar-cell${isToday ? " is-today" : ""}${unsure ? " is-unsure" : ""}`}
                onClick={onSelect ? () => onSelect(date) : undefined}
                disabled={!onSelect}
                aria-label={label}
              >
                <span className="calendar-date">
                  {showMonth ? <span className="calendar-month">{month}.</span> : null}
                  {dayNumber}
                </span>
                <span className="calendar-mark">
                  {day ? (
                    day.shift === "OFF" ? (
                      <span className="cal-off">휴</span>
                    ) : (
                      <span className={`cal-shift shift-${day.shift.toLowerCase()}`}>{shiftLabel(day.shift)}</span>
                    )
                  ) : null}
                </span>
                <span className="calendar-meal" aria-hidden="true">
                  {meal ? <IconCheck size={13} strokeWidth={2.4} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
