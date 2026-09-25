import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { IconHistory, IconSettings, IconToday } from "./components/icons";
import { type MonthCheck, type MonthWarning, analyzeMonth, analyzePair, samePhoto } from "./lib/analyzer/analyze";
import { loadRaster } from "./lib/analyzer/loadImage";
import {
  type YearMonth,
  addMonths,
  daysInMonth,
  defaultBaseMonth,
  formatPeriod,
  formatYearMonth,
  periodDates,
  settlementPeriod,
  toISODate,
  todayISO,
} from "./lib/dates";
import {
  type StoreData,
  affectedBases,
  availableViews,
  currentBase,
  defaultPeriodIndex,
  listPeriods,
  type MonthCheckSource,
  makeMonth,
  monthId,
  monthWithSamePhoto,
  overAllowanceAfter,
  periodView,
  upsertMonth,
} from "./lib/schedule";
import { type ShiftDay, setShiftInList, settlementId } from "./lib/settlement";
import { clearStore, emptyStore, restoreJSON } from "./lib/storage";
import { useStore } from "./lib/useStore";
import { HistoryDetailScreen, HistoryScreen } from "./screens/History";
import { HomeScreen } from "./screens/Home";
import {
  AnalyzingScreen,
  MonthConfirmScreen,
  MonthScreen,
  PhotoErrorScreen,
  PhotosScreen,
  SinglePhotoScreen,
  WelcomeScreen,
  errorMessage,
} from "./screens/Onboarding";
import { MonthSummary, ResultScreen, ScheduleEditor } from "./screens/Review";
import { SettingsScreen } from "./screens/Settings";

type Tab = "home" | "history" | "settings";

/**
 * 근무표 등록 흐름
 * - pair: 처음 등록 / 정산기간 새로 만들기 — 기준월 + 다음 달 사진 2장
 * - single: [다음 달 근무표 추가]·[다시 등록] — 사진 1장으로 한 달
 */
interface Flow {
  mode: "pair" | "single";
  step: "month" | "photos" | "analyzing" | "error" | "confirm" | "result" | "review";
  /** pair: 기준월, single: 추가/교체할 달 */
  base: YearMonth;
  files: [File | null, File | null];
  /** 분석한 월별 근무표 초안 (pair: [기준월, 다음 달], single: [그 달]) */
  months: ShiftDay[][];
  swapped: boolean;
  message?: string;
  /** 자동 통과시키지 않은 이유 (월이 달라 보임, 같은 사진 중복) */
  warnings: string[];
  /** 달마다 월 검증 근거 (저장할 때 기록) */
  checks: MonthCheckSource[];
  /** 달마다 사진 지문 */
  fingerprints: string[];
}

const checkSource = (c: MonthCheck): MonthCheckSource => (c.status === "ok" ? c.by : "user-confirmed");

function warningText(w: MonthWarning, mode: "pair" | "single"): string {
  const who = mode === "pair" ? `${w.photo}번째 사진: ` : "";
  return (
    `${who}선택한 ${formatYearMonth(w.month)}과\n사진 속 근무표가 다른 달처럼 보여요.` +
    (w.title ? `\n사진 속 제목은 ${w.title}로 보여요.` : "")
  );
}

interface Toast {
  id: number;
  title: string;
  body?: string;
}

const nextFrame = () => new Promise((r) => setTimeout(r, 60));

function blankMonth(ym: YearMonth): ShiftDay[] {
  return Array.from({ length: daysInMonth(ym.year, ym.month) }, (_, i) => ({
    date: toISODate(ym.year, ym.month, i + 1),
    shift: "OFF" as const,
    source: "manual" as const,
    confidence: 1,
  }));
}

function flowMonths(flow: Flow): YearMonth[] {
  return flow.mode === "pair" ? [flow.base, addMonths(flow.base, 1)] : [flow.base];
}

/** 초안 월 근무표에서 기준월 정산기간(21일~다음 달 20일)만 모은다 */
function draftPeriodShifts(flow: Flow): ShiftDay[] {
  const map = new Map(flow.months.flat().map((d) => [d.date, d]));
  return periodDates(flow.base).map(
    (date) => map.get(date) ?? { date, shift: "OFF", source: "manual", confidence: 0 },
  );
}

function editDraft(flow: Flow, date: string, shift: ShiftDay["shift"]): Flow {
  return { ...flow, months: flow.months.map((list) => setShiftInList(list, date, shift)) };
}

export default function App() {
  const { data, setData, saveMeals, setShiftOn } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
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
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // 화면이 바뀌면 맨 위로
  const screenKey = flow ? `flow-${flow.mode}-${flow.step}` : editingId ? `edit-${editingId}` : detailId ? `detail-${detailId}` : tab;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  const emptyFlow = { files: [null, null] as [File | null, File | null], months: [], swapped: false, warnings: [], checks: [], fingerprints: [] };
  const startPair = (step: "month" | "photos", base: YearMonth = defaultBaseMonth()) =>
    setFlow({ mode: "pair", step, base, ...emptyFlow });

  const startSingle = (ym: YearMonth) => setFlow({ mode: "single", step: "photos", base: ym, ...emptyFlow });

  /** 같은 사진이 이미 다른 달에 등록되어 있으면 경고 문구 */
  const duplicateWarnings = (yms: YearMonth[], fingerprints: string[], mode: "pair" | "single") =>
    yms.flatMap((ym, i) => {
      const other = monthWithSamePhoto(data, fingerprints[i], ym, samePhoto);
      if (!other) return [];
      const who = mode === "pair" ? `${i + 1}번째 사진: ` : "";
      return [`${who}이 사진은 이미 ${formatYearMonth(other)} 근무표로 등록되어 있어요.\n${formatYearMonth(ym)} 근무표가 맞는지 확인해 주세요.`];
    });

  const runAnalysis = async (current: Flow) => {
    const files = current.mode === "pair" ? current.files : [current.files[0]];
    if (files.some((f) => !f)) return;
    setFlow({ ...current, step: "analyzing" });
    const started = Date.now();
    await nextFrame();
    let images;
    try {
      images = await Promise.all(files.map((f) => loadRaster(f!)));
    } catch {
      setFlow({ ...current, step: "error", message: errorMessage("read-failed", undefined, current.base) });
      return;
    }
    // 너무 빨리 깜빡이지 않도록 최소 표시 시간
    const settle = async () => {
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    };

    if (current.mode === "pair") {
      const result = analyzePair(images[0], images[1], current.base);
      await settle();
      if (result.ok) {
        const yms = flowMonths(current);
        const dupIndexes = yms.flatMap((ym, i) => (monthWithSamePhoto(data, result.fingerprints[i], ym, samePhoto) ? [i] : []));
        const warnings = [
          ...result.warnings.map((w) => warningText(w, "pair")),
          ...duplicateWarnings(yms, result.fingerprints, "pair"),
        ];
        // 확인이 필요했던 달('그래도 사용')은 사용자 확인으로 기록
        const checks = result.checks.map((c, i) => (dupIndexes.includes(i) ? "user-confirmed" : checkSource(c)));
        setFlow({
          ...current,
          step: warnings.length ? "confirm" : "result",
          months: result.months,
          swapped: result.swapped,
          warnings,
          checks,
          fingerprints: result.fingerprints,
        });
      } else {
        setFlow({
          ...current,
          step: "error",
          months: result.months ?? [],
          message: errorMessage(result.kind, result.photo, current.base, result.title),
        });
      }
    } else {
      const result = analyzeMonth(images[0], current.base);
      await settle();
      if (result.ok) {
        const dup = duplicateWarnings([current.base], [result.fingerprint], "single");
        const warnings = [...(result.warning ? [warningText(result.warning, "single")] : []), ...dup];
        setFlow({
          ...current,
          step: warnings.length ? "confirm" : "review",
          months: [result.days],
          warnings,
          checks: [warnings.length ? "user-confirmed" : checkSource(result.check)],
          fingerprints: [result.fingerprint],
        });
      } else {
        setFlow({
          ...current,
          step: "error",
          months: result.days ? [result.days] : [],
          message: errorMessage(result.kind, undefined, current.base, result.title),
        });
      }
    }
  };

  /** 초안 월 근무표를 저장하고, 새로 계산 가능해진 정산으로 이동한다 */
  const saveFlow = (current: Flow) => {
    const yms = flowMonths(current);
    const replacing = yms.filter((ym) => data.months.some((m) => m.id === monthId(ym)));
    const next: StoreData = yms.reduce(
      (acc, ym, i) =>
        upsertMonth(
          acc,
          makeMonth(ym, current.months[i] ?? [], new Date(), {
            monthCheck: current.checks[i] ?? "manual",
            photoHash: current.fingerprints[i],
          }),
        ),
      data,
    );
    setData(next);
    setFlow(null);
    setDetailId(null);
    setEditingId(null);
    setTab("home");

    // 보여줄 정산: pair는 기준월, single은 이 달로 끝나는 정산 → 없으면 이 달에서 시작하는 정산
    const candidates = current.mode === "pair" ? [current.base] : affectedBases(current.base);
    const shown = candidates.map((b) => periodView(next, b)).find(Boolean) ?? null;
    if (shown) setSelectedPeriodId(shown.id);

    const over = yms.flatMap((ym) => overAllowanceAfter(next, ym));
    if (over.length > 0) {
      const v = over[0];
      showToast("수령 기록을 확인해 주세요", `${formatPeriod(v.startDate, v.endDate)} 수령 ${v.mealUses.length}회 · 총 ${v.mealAllowance}회`);
    } else if (current.mode === "single" && replacing.length > 0) {
      showToast(`${current.base.month}월 근무표를 교체했어요`, shown ? `${formatPeriod(shown.startDate, shown.endDate)} 간편식 ${shown.mealAllowance}회` : undefined);
    } else if (shown) {
      showToast(
        current.mode === "pair" ? "근무표를 저장했어요" : `${formatPeriod(shown.startDate, shown.endDate)} 정산을 만들었어요`,
        `간편식 ${shown.mealAllowance}회`,
      );
    } else {
      showToast(`${current.base.month}월 근무표를 저장했어요`);
    }
  };

  const restoreFromFile = async (file: File) => {
    const result = restoreJSON(await file.text());
    if (result.ok && result.data.months.length > 0) {
      setData(result.data);
      setSelectedPeriodId(null);
      setTab("home");
      showToast("데이터를 복원했어요", `근무표 ${result.data.months.length}개월`);
    } else if (!result.ok && result.reason === "wrong-version") {
      showToast("복원할 수 없는 백업 파일이에요", "지원하지 않는 버전이에요");
    } else {
      showToast("복원할 수 없는 파일이에요", "한끼에서 만든 백업 파일인지 확인해 주세요");
    }
  };

  const hasData = data.months.length > 0;
  const periods = listPeriods(data, today);
  const selectedIndex = (() => {
    const i = selectedPeriodId ? periods.findIndex((p) => p.id === selectedPeriodId) : -1;
    return i >= 0 ? i : defaultPeriodIndex(periods, today);
  })();
  const currentId = settlementId(currentBase(today));

  let content: ReactNode;
  let showTabs = false;

  if (flow) {
    const cancel = () => setFlow(null);
    const { startDate, endDate } = settlementPeriod(flow.base);
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
        content =
          flow.mode === "pair" ? (
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
          ) : (
            <SinglePhotoScreen
              target={flow.base}
              replacing={data.months.some((m) => m.id === monthId(flow.base))}
              file={flow.files[0]}
              onPick={(file) => setFlow({ ...flow, files: [file, null] })}
              onAnalyze={() => runAnalysis(flow)}
              onBack={cancel}
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
              const yms = flowMonths(flow);
              const months = yms.map((ym, i) => (flow.months[i]?.length ? flow.months[i] : blankMonth(ym)));
              // 직접 입력: 사진 판독 결과는 초안일 뿐, 사용자가 확인·수정해서 저장한다
              setFlow({ ...flow, step: "review", months, swapped: false, checks: yms.map(() => "manual"), fingerprints: [] });
            }}
          />
        );
        break;
      case "confirm":
        content = (
          <MonthConfirmScreen
            messages={flow.warnings}
            onRetry={() => setFlow({ ...flow, step: "photos", warnings: [] })}
            onUseAnyway={() => setFlow({ ...flow, step: flow.mode === "pair" ? "result" : "review", warnings: [] })}
          />
        );
        break;
      case "result":
        content = (
          <ResultScreen
            startDate={startDate}
            endDate={endDate}
            shifts={draftPeriodShifts(flow)}
            swapped={flow.swapped}
            onReview={() => setFlow({ ...flow, step: "review" })}
            onConfirm={() => saveFlow(flow)}
            onBack={() => setFlow({ ...flow, step: "photos" })}
          />
        );
        break;
      case "review":
        if (flow.mode === "pair") {
          content = (
            <ScheduleEditor
              startDate={startDate}
              endDate={endDate}
              shifts={draftPeriodShifts(flow)}
              onChange={(date, shift) => setFlow(editDraft(flow, date, shift))}
              onDone={() => setFlow({ ...flow, step: "result" })}
            />
          );
        } else {
          const ym = flow.base;
          const days = flow.months[0] ?? [];
          const preview = upsertMonth(data, makeMonth(ym, days));
          content = (
            <ScheduleEditor
              title={`${ym.month}월 근무표 확인`}
              startDate={toISODate(ym.year, ym.month, 1)}
              endDate={toISODate(ym.year, ym.month, daysInMonth(ym.year, ym.month))}
              shifts={days}
              summary={<MonthSummary month={ym} days={days} preview={preview} />}
              onChange={(date, shift) => setFlow(editDraft(flow, date, shift))}
              onBack={() => setFlow({ ...flow, step: "photos" })}
              onDone={() => saveFlow(flow)}
              doneLabel="저장"
            />
          );
        }
        break;
    }
  } else if (!hasData) {
    content = <WelcomeScreen onStart={() => startPair("month")} onRestoreFile={restoreFromFile} />;
  } else if (editingId) {
    const target = periods.find((p) => p.id === editingId);
    const view = target?.status.available ? target.status.view : null;
    if (view) {
      content = (
        <ScheduleEditor
          title="근무표 수정"
          startDate={view.startDate}
          endDate={view.endDate}
          shifts={view.shifts}
          onChange={setShiftOn}
          onDone={() => setEditingId(null)}
        />
      );
    }
  } else if (detailId) {
    const view = availableViews(data).find((v) => v.id === detailId);
    if (view) {
      content = (
        <HistoryDetailScreen
          settlement={view}
          today={today}
          onBack={() => setDetailId(null)}
          onUpdate={saveMeals}
          onEditSchedule={() => setEditingId(view.id)}
          toast={showToast}
        />
      );
    }
  }

  if (!content) {
    showTabs = true;
    if (tab === "home") {
      content = (
        <HomeScreen
          periods={periods}
          index={selectedIndex}
          today={today}
          onSelect={(i) => setSelectedPeriodId(periods[i]?.id ?? null)}
          onUpdate={saveMeals}
          onEditSchedule={(id) => setEditingId(id)}
          onAddMonth={startSingle}
          toast={showToast}
        />
      );
    } else if (tab === "history") {
      content = (
        <HistoryScreen
          settlements={availableViews(data)}
          currentId={currentId}
          today={today}
          onOpen={(id) => setDetailId(id)}
        />
      );
    } else {
      content = (
        <SettingsScreen
          data={data}
          today={today}
          onAddMonth={startSingle}
          onNewPeriod={() => startPair("month")}
          onRestore={(restored) => {
            setData(restored);
            setSelectedPeriodId(null);
          }}
          onReset={() => {
            clearStore();
            setData(emptyStore());
            setSelectedPeriodId(null);
            setTab("home");
          }}
          toast={showToast}
        />
      );
    }
  }

  const homeHasCta = tab === "home" && !!periods[selectedIndex]?.status.available;

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

      <div className={`toast-layer${showTabs && homeHasCta ? " above-cta" : ""}`} aria-live="polite" role="status">
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
