import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { IconHistory, IconSettings, IconToday } from "./components/icons";
import { analyzePair } from "./lib/analyzer/analyze";
import { loadRaster } from "./lib/analyzer/loadImage";
import { type YearMonth, defaultBaseMonth, periodDates, settlementPeriod, todayISO } from "./lib/dates";
import {
  type ShiftDay,
  createSettlement,
  setShift,
  setShiftInList,
  settlementId,
} from "./lib/settlement";
import { clearStore, emptyStore, restoreJSON, upsertSettlement } from "./lib/storage";
import { useStore } from "./lib/useStore";
import { HistoryDetailScreen, HistoryScreen } from "./screens/History";
import { HomeScreen } from "./screens/Home";
import {
  AnalyzingScreen,
  MonthScreen,
  PhotoErrorScreen,
  PhotosScreen,
  WelcomeScreen,
  errorMessage,
} from "./screens/Onboarding";
import { ResultScreen, ScheduleEditor } from "./screens/Review";
import { SettingsScreen } from "./screens/Settings";

type Tab = "home" | "history" | "settings";

interface Flow {
  step: "month" | "photos" | "analyzing" | "error" | "result" | "review";
  base: YearMonth;
  files: [File | null, File | null];
  shifts: ShiftDay[];
  swapped: boolean;
  message?: string;
}

interface Toast {
  id: number;
  title: string;
  body?: string;
}

const nextFrame = () => new Promise((r) => setTimeout(r, 60));

export default function App() {
  const { data, setData, active, updateSettlement } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    const tick = () => setToday(todayISO());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const showToast = useCallback((title: string, body?: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), title, body });
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // 화면이 바뀌면 맨 위로
  const screenKey = flow ? `flow-${flow.step}` : editingId ? `edit-${editingId}` : detailId ? `detail-${detailId}` : tab;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  const startFlow = (step: "month" | "photos", base: YearMonth = defaultBaseMonth()) =>
    setFlow({ step, base, files: [null, null], shifts: [], swapped: false });

  const runAnalysis = async (current: Flow) => {
    const [first, second] = current.files;
    if (!first || !second) return;
    setFlow({ ...current, step: "analyzing" });
    const started = Date.now();
    await nextFrame();
    let images;
    try {
      images = await Promise.all([loadRaster(first), loadRaster(second)]);
    } catch {
      setFlow({ ...current, step: "error", message: errorMessage("read-failed", undefined, current.base) });
      return;
    }
    const result = analyzePair(images[0], images[1], current.base);
    // 너무 빨리 깜빡이지 않도록 최소 표시 시간
    const wait = 700 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (result.ok) {
      setFlow({ ...current, step: "result", shifts: result.shifts, swapped: result.swapped });
    } else {
      setFlow({
        ...current,
        step: "error",
        shifts: result.shifts ?? [],
        message: errorMessage(result.kind, result.photo, current.base),
      });
    }
  };

  const confirmFlow = (current: Flow) => {
    const existing = data.settlements.find((s) => s.id === settlementId(current.base));
    const settlement = createSettlement(current.base, current.shifts, new Date(), existing?.mealUses ?? []);
    setData((d) => ({ ...upsertSettlement(d, settlement), activeId: settlement.id }));
    setFlow(null);
    setDetailId(null);
    setTab("home");
    showToast("근무표를 저장했어요", `간편식 ${settlement.mealAllowance}회`);
  };

  const hasData = data.settlements.length > 0;

  let content: ReactNode;
  let showTabs = false;

  if (flow) {
    const { startDate, endDate } = settlementPeriod(flow.base);
    const cancel = () => setFlow(null);
    switch (flow.step) {
      case "month":
        content = (
          <MonthScreen
            value={flow.base}
            onChange={(base) => setFlow({ ...flow, base })}
            onNext={() => setFlow({ ...flow, step: "photos" })}
            onBack={cancel}
          />
        );
        break;
      case "photos":
        content = (
          <PhotosScreen
            base={flow.base}
            files={flow.files}
            onPick={(i, file) => {
              const files: [File | null, File | null] = [...flow.files];
              files[i] = file;
              setFlow({ ...flow, files });
            }}
            onAnalyze={() => runAnalysis(flow)}
            onBack={() => setFlow({ ...flow, step: "month" })}
          />
        );
        break;
      case "analyzing":
        content = <AnalyzingScreen />;
        break;
      case "error":
        content = (
          <PhotoErrorScreen
            message={flow.message ?? ""}
            onRetry={() => setFlow({ ...flow, step: "photos" })}
            onManual={() => {
              const shifts =
                flow.shifts.length > 0
                  ? flow.shifts
                  : periodDates(flow.base).map(
                      (date): ShiftDay => ({ date, shift: "OFF", source: "manual", confidence: 1 }),
                    );
              setFlow({ ...flow, step: "review", shifts, swapped: false });
            }}
          />
        );
        break;
      case "result":
        content = (
          <ResultScreen
            startDate={startDate}
            endDate={endDate}
            shifts={flow.shifts}
            swapped={flow.swapped}
            onReview={() => setFlow({ ...flow, step: "review" })}
            onConfirm={() => confirmFlow(flow)}
            onBack={() => setFlow({ ...flow, step: "photos" })}
          />
        );
        break;
      case "review":
        content = (
          <ScheduleEditor
            startDate={startDate}
            endDate={endDate}
            shifts={flow.shifts}
            onChange={(date, shift) => setFlow({ ...flow, shifts: setShiftInList(flow.shifts, date, shift) })}
            onDone={() => setFlow({ ...flow, step: "result" })}
          />
        );
        break;
    }
  } else if (!hasData) {
    content = (
      <WelcomeScreen
        onStart={() => startFlow("month")}
        onRestoreFile={async (file) => {
          const result = restoreJSON(await file.text());
          if (result.ok && result.data.settlements.length > 0) {
            setData(result.data);
            setTab("home");
            showToast("데이터를 복원했어요", `정산 ${result.data.settlements.length}개`);
          } else if (!result.ok && result.reason === "wrong-version") {
            showToast("복원할 수 없는 백업 파일이에요", "지원하지 않는 버전이에요");
          } else {
            showToast("복원할 수 없는 파일이에요", "한끼에서 만든 백업 파일인지 확인해 주세요");
          }
        }}
      />
    );
  } else if (editingId) {
    const target = data.settlements.find((s) => s.id === editingId);
    if (target) {
      content = (
        <ScheduleEditor
          title="근무표 수정"
          startDate={target.startDate}
          endDate={target.endDate}
          shifts={target.shifts}
          onChange={(date, shift) => updateSettlement(setShift(target, date, shift))}
          onDone={() => setEditingId(null)}
        />
      );
    }
  } else if (detailId) {
    const target = data.settlements.find((s) => s.id === detailId);
    if (target) {
      content = (
        <HistoryDetailScreen
          settlement={target}
          today={today}
          onBack={() => setDetailId(null)}
          onUpdate={updateSettlement}
          onEditSchedule={() => setEditingId(target.id)}
          toast={showToast}
        />
      );
    }
  }

  if (!content) {
    showTabs = true;
    if (tab === "home" && active) {
      content = (
        <HomeScreen
          settlement={active}
          today={today}
          onUpdate={updateSettlement}
          onEditSchedule={() => setEditingId(active.id)}
          onNewPeriod={() => startFlow("month")}
          toast={showToast}
        />
      );
    } else if (tab === "history" || (tab === "home" && !active)) {
      content = (
        <HistoryScreen
          settlements={data.settlements}
          activeId={data.activeId}
          today={today}
          onOpen={(id) => setDetailId(id)}
        />
      );
    } else {
      content = (
        <SettingsScreen
          data={data}
          active={active}
          onReanalyze={() => active && startFlow("photos", { year: active.baseYear, month: active.baseMonth })}
          onNewPeriod={() => startFlow("month")}
          onRestore={(restored) => setData(restored)}
          onReset={() => {
            clearStore();
            setData(emptyStore());
            setTab("home");
          }}
          toast={showToast}
        />
      );
    }
  }

  return (
    <div className={`app${showTabs ? " has-tabs" : ""}`}>
      <main className="app-main" key={screenKey}>
        {content}
      </main>

      {showTabs ? (
        <nav className="tabbar" aria-label="주요 메뉴">
          {(
            [
              ["home", "이번 정산", IconToday],
              ["history", "기록", IconHistory],
              ["settings", "설정", IconSettings],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              className={`tab${tab === key ? " is-active" : ""}`}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setTab(key);
                setDetailId(null);
              }}
            >
              <Icon size={24} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <div className={`toast-layer${showTabs && tab === "home" ? " above-cta" : ""}`} aria-live="polite" role="status">
        {toast ? (
          <div className="toast" key={toast.id}>
            <strong>{toast.title}</strong>
            {toast.body ? <span>{toast.body}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
