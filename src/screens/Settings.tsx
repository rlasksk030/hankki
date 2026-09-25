import { useState } from "react";
import { IconCheck, IconChevronRight } from "../components/icons";
import { BottomSheet } from "../components/ui";
import { type YearMonth, formatYearMonth } from "../lib/dates";
import { groupMonthsForList, monthId } from "../lib/schedule";
import { type StoreData, exportJSON, restoreJSON } from "../lib/storage";

const APP_VERSION = "1.0.0";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
}

function MonthRow({ ym, label, onClick }: { ym: YearMonth; label: string; onClick: () => void }) {
  return (
    <button type="button" className="list-row" onClick={onClick} aria-label={`${formatYearMonth(ym)} 근무표 등록됨, 다시 등록`}>
      <span className="list-label">
        {label}
        <span className="list-sub">다시 등록하면 교체돼요</span>
      </span>
      <span className="month-registered">
        <IconCheck size={14} strokeWidth={2.4} /> 등록됨
      </span>
      <IconChevronRight size={18} className="list-chevron" />
    </button>
  );
}

// ---------- 화면 J. 설정 ----------

export function SettingsScreen({
  data,
  today,
  onAddMonth,
  onNewPeriod,
  onRestore,
  onReset,
  toast,
}: {
  data: StoreData;
  today: string;
  onAddMonth: (ym: YearMonth) => void;
  onNewPeriod: () => void;
  onRestore: (data: StoreData) => void;
  onReset: () => void;
  toast: (title: string, body?: string) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<StoreData | null>(null);
  const [showPast, setShowPast] = useState(false);
  // 기본 목록은 가까운 달만, 오래된 달은 '지난 근무표'로 접는다 (데이터는 모두 보관)
  const groups = groupMonthsForList(data, today);
  const pastByYear = [...new Set(groups.past.map((m) => m.year))].map(
    (year) => [year, groups.past.filter((m) => m.year === year)] as const,
  );

  const download = () => {
    const blob = new Blob([exportJSON(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hankki-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="screen">
      <div className="screen-body">
        <h1 className="large-title">설정</h1>

        <h2 className="group-title">등록된 근무표</h2>
        <ul className="list" aria-label="등록된 근무표">
          {groups.recent.map((ym) => (
            <li key={monthId(ym)}>
              <MonthRow ym={ym} label={formatYearMonth(ym)} onClick={() => onAddMonth(ym)} />
            </li>
          ))}
          {groups.add ? (
            <li>
              <button
                type="button"
                className="list-row"
                onClick={() => onAddMonth(groups.add!)}
                aria-label={`${formatYearMonth(groups.add)} 근무표 추가`}
              >
                <span className="list-label">{formatYearMonth(groups.add)}</span>
                <span className="month-add">추가</span>
                <IconChevronRight size={18} className="list-chevron" />
              </button>
            </li>
          ) : null}
        </ul>

        {groups.past.length > 0 ? (
          <>
            <button
              type="button"
              className="text-button past-toggle"
              aria-expanded={showPast}
              aria-controls="past-months"
              onClick={() => setShowPast((v) => !v)}
            >
              {showPast ? "지난 근무표 접기" : `지난 근무표 보기 (${groups.past.length}개월)`}
            </button>
            {showPast ? (
              <div id="past-months">
                {pastByYear.map(([year, list]) => (
                  <section key={year} aria-label={`${year}년 지난 근무표`}>
                    <h3 className="group-subtitle">{year}년</h3>
                    <ul className="list">
                      {list.map((ym) => (
                        <li key={monthId(ym)}>
                          <MonthRow ym={ym} label={`${ym.month}월`} onClick={() => onAddMonth(ym)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <p className="group-footnote">
          근무표는 달마다 한 번만 저장되고, 이어진 달이 있으면 21일~다음 달 20일 정산이 자동으로 만들어져요. 지난 근무표와
          정산 기록도 모두 보관돼요.
        </p>

        <h2 className="group-title">정산</h2>
        <ul className="list">
          <li>
            <button type="button" className="list-row" onClick={onNewPeriod}>
              <span className="list-label">
                정산기간 새로 만들기
                <span className="list-sub">기준월과 다음 달 근무표 2장으로 시작</span>
              </span>
              <IconChevronRight size={18} className="list-chevron" />
            </button>
          </li>
        </ul>

        <h2 className="group-title">데이터</h2>
        <ul className="list">
          <li>
            <button type="button" className="list-row" onClick={download} disabled={data.months.length === 0}>
              <span className="list-label">
                데이터 백업
                <span className="list-sub">월별 근무표·정산별 수령 기록을 JSON 파일로 저장해요</span>
              </span>
            </button>
          </li>
          <li>
            <label className="list-row" htmlFor="restore-json">
              <span className="list-label">
                데이터 복원
                <span className="list-sub">백업 파일을 불러와요</span>
              </span>
            </label>
            <input
              id="restore-json"
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              aria-label="백업 파일 선택"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const result = restoreJSON(await file.text());
                if (result.ok) setPendingRestore(result.data);
                else if (result.reason === "wrong-version") toast("복원할 수 없는 백업 파일이에요", "지원하지 않는 버전이에요");
                else toast("복원할 수 없는 파일이에요", "한끼에서 만든 백업 파일인지 확인해 주세요");
              }}
            />
          </li>
          <li>
            <button type="button" className="list-row list-row-danger" onClick={() => setConfirmReset(true)}>
              <span className="list-label">모든 데이터 삭제</span>
            </button>
          </li>
        </ul>
        <p className="group-footnote">
          기록은 로그인 없이 이 기기의 브라우저에만 저장돼요. Safari 방문 기록을 지우거나 휴대폰을 바꾸기 전에 백업해 두세요.
        </p>

        <h2 className="group-title">앱 정보</h2>
        <div className="about">
          <p>
            <strong>한끼</strong> {APP_VERSION}
          </p>
          <p>3교대 간편식 횟수 계산기. 간편식 = 30 − 출근일(A·B·C).</p>
          <p>
            근무표와 수령 기록은 서버로 보내지 않아요. 같은 주소를 여러 사람이 써도 각자의 기록은 각자의 기기에만
            있어요. 근무표 사진도 기기 안에서만 분석해요.
          </p>
          {!isStandalone() ? (
            <p>원하면 Safari 공유 버튼 → ‘홈 화면에 추가’로 앱처럼 열 수도 있어요. 추가하지 않아도 모든 기능을 그대로 쓸 수 있어요.</p>
          ) : null}
        </div>
      </div>

      <BottomSheet
        open={!!pendingRestore}
        title="백업 파일로 복원할까요?"
        onClose={() => setPendingRestore(null)}
      >
        <p className="sheet-note">
          근무표 {pendingRestore?.months.length ?? 0}개월과 수령 기록을 불러와요. 지금 이 기기에 있는 기록은 백업 파일 내용으로
          바뀌어요.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            if (pendingRestore) onRestore(pendingRestore);
            setPendingRestore(null);
            toast("데이터를 복원했어요");
          }}
        >
          복원
        </button>
        <button type="button" className="button button-plain" onClick={() => setPendingRestore(null)}>
          취소
        </button>
      </BottomSheet>

      <BottomSheet open={confirmReset} title="모든 데이터를 삭제할까요?" onClose={() => setConfirmReset(false)}>
        <p className="sheet-note">정산 기록과 수령 기록이 모두 지워지고 되돌릴 수 없어요.</p>
        <button
          type="button"
          className="button button-danger"
          onClick={() => {
            setConfirmReset(false);
            onReset();
          }}
        >
          삭제
        </button>
        <button type="button" className="button button-plain" onClick={() => setConfirmReset(false)}>
          취소
        </button>
      </BottomSheet>
    </div>
  );
}
