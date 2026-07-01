"use client";

/**
 * Etacolla — Allocation Workspace (new design, Phase 1 shell)
 * Faithful port of the approved design reference:
 *   frontend/design-reference/AllocationWorkspace-v2.dc.html  (+ ReasoningTrace.dc.html)
 *
 * Phase 1 = visual shell with mock data (per GO-LIVE-GUIDE step 2a), built non-destructively
 * at /workspace so the existing app at / keeps working. Backend wiring lands in later phases.
 *
 * Styles are copied verbatim from the .dc.html inline styles (colors, sizes, spacing, radii).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp, Newspaper, Cpu, Play, ChevronRight, Info, FileText, CheckCircle2, BookOpen, Navigation, Settings, Check, AlertTriangle
} from "lucide-react";
import { EtacollaLogo } from "./EtacollaLogo";

const API_BASE = "http://localhost:4500";

// Format a UTC ISO timestamp (e.g. the AI's analysis-release time) as Korea Standard Time.
// Returns "" for missing/unparseable input so the caller can fall back gracefully.
function fmtKST(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {} as Record<string, string>);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
}

// Regime → [short KR label, accent color], and the regime-scaled risk-aversion λ
// (mirrors backend _regime_lambda_multiplier in main.py).
const REGIME_MAP: Record<string, [string, string]> = {
  CRISIS: ["위기", "#ff5000"], ELEVATED_RISK: ["위험 고조", "#FBBF24"],
  NORMAL: ["정상", "#9a9a9a"], LOW_VOL: ["안정", "#00C805"],
};
const REGIME_LAMBDA: Record<string, string> = { CRISIS: "1.6×", ELEVATED_RISK: "1.25×", NORMAL: "1.0×", LOW_VOL: "0.9×" };

function fmtQuote(key: string, v: number): string {
  if (["GOLD", "WTI", "BTC"].includes(key)) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 1 });
  if (key === "USD_KRW") return "₩" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (["US10Y", "US3M", "KR3Y"].includes(key)) return v.toFixed(2) + "%";
  return v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 });
}

// ── Design tokens (from the reference inline styles) ──────────────────────────
const C = {
  bg: "#000", panelL: "#040404", panel: "#050505", panel2: "#070707",
  card: "#0a0a0a", card2: "#0c0c0c", chip: "#0b0b0b",
  b1: "#161616", b2: "#1c1c1c", b3: "#242424", b4: "#2a2a2a", b5: "#1e1e1e", b6: "#181818",
  white: "#fff", t1: "#d2d2d2", t2: "#cfcfcf", t3: "#9a9a9a", t4: "#6a6a6a", t5: "#5a5a5a", t6: "#555",
  violet: "#00C805", green: "#00C805", green2: "#21e000", blue: "#3B82F6",
  amber: "#FBBF24", red: "#ff5000", up: "#00C805", cyan: "#22D3EE", redL: "#ff9166",
};
const FA = "'Archivo',sans-serif";
const FP = "'Pretendard',sans-serif";
// Numbers use the chat (Pretendard) font per user preference — was IBM Plex Mono.
// Column alignment is preserved via fontVariantNumeric:"tabular-nums" on the root.
const FM = FP;

// ── Changelog ───────────────────────────────────────────────────────────────
// Hand-maintained release log surfaced in the right-edge CHANGELOG drawer.
// To cut a new version: bump APP_VERSION and prepend an entry here (newest first),
// move `current: true` to the new entry. This is the single source of truth.
const APP_VERSION = "0.6.0";
type ChangelogEntry = { version: string; date: string; title: string; items: string[]; current?: boolean };
const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.6.0",
    date: "2026-07-01",
    title: "리포트 히스토리 · 결과 둘러보기 · 실행 브리지 확대",
    current: true,
    items: [
      "리포트 탭을 생성된 리포트 목록(4열 카드 그리드)으로 개편 — 카드 선택 시 해당 리포트 표시, 생성 중에는 로딩 카드",
      "지난 리포트를 DB(/simulations)에서 불러와 새로고침 후에도 유지",
      "최적화 완료 후 '결과 둘러보기'(배분·리스크·프론티어) 안내와 PM 리포트 열기 (Stage D)",
      "뷰→실행 브리지 진입점 확대: 채팅으로 뷰를 남기거나 특정 디제스트를 물어본 뒤에도 실행 브리지 표시",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-07-01",
    title: "실행 설정 · 첨부 정리 · 완료 타이밍",
    items: [
      "최적화 실행 전 최적화 방식(앙상블·MVO·리스크패리티·HRP)과 이탈 한도 δ(±3/5/10%p)를 직접 선택",
      "Chris의 완료 메시지를 최적화가 실제로 끝난 뒤에만 표시 (실행 중 조기 노출 수정)",
      "첨부 자료를 '첨부 N건' 접이식 요약으로 정리 — 세로로 쌓여 공간을 잡아먹던 문제 해결",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-01",
    title: "뷰→실행 브리지 (리포트로 가는 길)",
    items: [
      "디제스트 반영 후 '뷰 정하기' 단계로 연결 — 직접 뷰 입력 / 하우스 뷰(리서치) 채택 / 뷰 없이 기준 비중",
      "'이 뷰로 최적화 실행' 버튼으로 Black-Litterman 최적화를 바로 실행 → 배분·리스크·프론티어·PM 리포트 생성",
      "첨부된 디제스트·고려사항이 최적화 뷰로 반영되고, PM 리포트가 Ben(뉴스)·Jerry(매크로) 근거를 종합",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-07-01",
    title: "데스크 챗 한국어 고정",
    items: [
      "데스크 챗 답변이 문장 중간에 일본어 등 다른 언어로 바뀌던 문제 수정 — 한국어(한글) 전용 규칙 강화 (고유명사·약어는 원문 허용)",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-01",
    title: "새 대화 · Ben 디제스트 후속 흐름",
    items: [
      "「새 대화」 버튼으로 대화를 초기화하고 온보딩(Chris→Jerry 브리핑)을 처음부터 재생",
      "채팅 스레드를 chatMsgs로 일원화(하드코딩 Chris 인사 제거) — 인사 중복 해소",
      "Ben 디제스트 완료 후 후속 선택지 제공: 디제스트를 대화에 반영(체크리스트 선택) / 특정 디제스트 자세히 알아보기",
      "특정 디제스트 선택 시 해당 자료를 첨부하고 Ben이 핵심·배분 함의를 설명(실시간 근거 기반)",
      "Ben에게 매크로 컨텍스트를 제공해 디제스트·대시보드 질문에 함께 답변",
      "디제스트 진행 상태를 한국어 단계 라벨로 표기",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-01",
    title: "데스크 온보딩 플로우",
    items: [
      "접속 시 온보딩: Chris 인사 → 매크로 탭 자동 전환 → Jerry의 데일리 매크로 브리핑",
      "Jerry 브리핑을 우리 데이터로만 결정적으로 생성(웹검색·수치 창작 없음) · 정중한 존댓말 · 블록 가독성",
      "브리핑 후 3개 핸드오프 선택지(Ben 디제스트 / Jerry 심층 리서치 / 대시보드 수치 질문)",
      "Ben 디제스트 버튼이 실제 뉴스 새로고침 파이프라인을 실행 · 진행 단계 미러링 'thinking' 애니메이션 · 완료 후 요약",
      "Ben에게 매크로 지표 컨텍스트 제공(대시보드 수치 설명 가능)",
      "백엔드 /desk/daily-brief 엔드포인트 · 스트리밍 코어(_stream_answer) 공용화",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-01",
    title: "첫 태깅 빌드",
    items: [
      "Black-Litterman 자산배분 엔진 · 5개 자산군(국내·해외 주식, 국내·해외 채권, 대체)",
      "마켓 인텔리전스 피드 + URL·PDF 리서치 인제스트",
      "리서치 파이프라인 → House View(테제) 생성·신뢰도 보정",
      "Chris·Jerry·Ben 데스크 챗 (페르소나 + 의도 분류 + 스트리밍)",
      "데이터 클래스 기반 DB 리셋 도구(db_admin: ephemeral·user·all)",
      "모델 라우팅을 Nemotron 3 Super로 이전 (제거된 owl-alpha 대응)",
      "프론트엔드 :4000 / 백엔드 :4500 게이트웨이 정리",
    ],
  },
];

// The three desk personas you can address in the left chat. `key` is sent to
// the backend /chat endpoint; the rest drive avatar colour + name/role labels and short info.
const PERSONA_META: Record<"chris" | "jerry" | "ben", { name: string; role: string; color: string; bg?: string; border?: string; desc: string; avatar: string }> = {
  chris: {
    name: "Chris",
    role: "PM · 최고투자전략가",
    color: C.white,
    desc: "이 데스크의 최고투자전략가(PM)입니다. Ben의 분석과 Jerry의 매크로 의견을 수렴하여 최종 자산배분을 결정하고 실행합니다.",
    avatar: "/chris.jpg"
  },
  jerry: {
    name: "Jerry",
    role: "선임 PM · 매크로 데스크",
    color: C.amber,
    desc: "자산배분 총괄 선임 PM입니다. 매크로 데스크를 담당하며, 주요 리스크 요인과 하우스 뷰(Bull/Bear 논거)를 검증하고 제안합니다.",
    avatar: "/jerry.jpg"
  },
  ben: {
    name: "Ben",
    role: "마켓 인텔리전스 애널리스트",
    color: C.cyan,
    bg: "rgba(34,211,238,.12)",
    border: "rgba(34,211,238,.35)",
    desc: "마켓 인텔리전스 AI 애널리스트입니다. 수집된 시장 뉴스, 리서치 리포트, 기사를 분석하고 요약하여 자산배분 논거를 도출합니다.",
    avatar: "/ben.jpg"
  },
};

const TICKER = [
  ["KOSPI", "2,610", "▼0.8%", C.red], ["S&P 500", "5,420", "▲0.4%", C.up],
  ["NASDAQ", "17,330", "▲0.6%", C.up], ["다우", "38,900", "▲0.2%", C.up],
  ["닛케이", "39,100", "▼0.3%", C.red], ["US 10Y", "4.18%", "▼0.03", C.up],
  ["KR 3Y", "3.02%", "▼0.02", C.up], ["VIX", "23.4", "▲5.1%", C.red],
  ["공포·탐욕", "42", "공포", C.amber], ["DXY", "104.2", "▲0.2%", C.up],
  ["USD/KRW", "₩1,382", "▲0.3%", C.red], ["WTI", "$71.3", "▼1.2%", C.red],
  ["금", "$2,340", "▲0.5%", C.up], ["비트코인", "$63,400", "▲2.1%", C.up],
];

// Tabs split into the analysis inputs (market context you gather) and the
// optimization outputs (results the desk produces from your view).
const TAB_GROUPS: { label: string; tabs: string[] }[] = [
  { label: "입력", tabs: ["매크로", "인텔리전스", "리서치"] },
  { label: "결과", tabs: ["배분", "리스크", "프론티어", "리포트"] },
  { label: "시스템", tabs: ["가이드", "설정"] },
];

const REASONING =
  "▸ 사용자 의견 파싱: 해외주식 상대 우위 +5.0%p · 금리 하락 → 채권 강세.\n" +
  "▸ NPS 2026 목표비중을 prior로 로드. 위험 고조 레짐 감지(VIX 23.4) → λ 1.4×로 상향.\n" +
  "▸ Idzorek 신뢰도로 Ω 보정: 해외주식 68% · 채권 55%. 사후 기대수익률 수렴 — 해외주식 7.9 → 9.2%.\n" +
  "▸ δ 5% 제약 하 MVO·리스크패리티·HRP 앙상블 가중평균. 해외주식 +4.8%p 한도 근접 · 대체투자 변동성 기여 최대 → −4.3%p 축소.\n" +
  "▸ 10,000회 몬테카를로 + 역사적 위기 충격. 95% VaR −13.7% 확인. 최종 검토 준비 완료.";

const TRACE_STEPS = [
  { l: "시장 균형 로드", d: "NPS 2026 목표비중 prior · λ 1.4×", at: 0.16 },
  { l: "블랙-리터만 결합", d: "Idzorek 신뢰도로 Ω 보정 → 사후 기대수익률", at: 0.5 },
  { l: "앙상블 최적화", d: "MVO·리스크패리티·HRP · δ 5% 제약", at: 0.8 },
  { l: "몬테카를로 + 위기 스트레스", d: "10,000 경로 · 역사적 시나리오 충격", at: 0.995 },
];

// allocation rows: [name, color, optW%, deltaPP, prior, post, bardelta]
const ALLOC = [
  { name: "해외주식", color: "#A855F7", w: 39.5, d: 4.8, bench: 34.7 },
  { name: "국내주식", color: "#3B82F6", w: 17.2, d: -3.6, bench: 20.8 },
  { name: "국내채권", color: "#2DD4BF", w: 24.5, d: 1.4, bench: 23.1 },
  { name: "해외채권", color: "#FB923C", w: 9.1, d: 1.7, bench: 7.4 },
  { name: "대체투자", color: "#FACC15", w: 9.7, d: -4.3, bench: 14.0 },
];

const ATTRIB = [
  { name: "해외주식", color: "#A855F7", prior: "7.90%", post: "9.18%", delta: "+1.28", dc: C.up, why: "상대 우위 뷰 · 신뢰도 68%", src: "엔비디아 실적 서프라이즈 · Reuters ↗", tag: "뉴스", tagDark: true },
  { name: "국내주식", color: "#3B82F6", prior: "6.40%", post: "5.72%", delta: "−0.68", dc: C.red, why: "상대 열위 (해외주식 반대편)", src: "원/달러 1,380원 돌파 · 연합인포맥스 ↗", tag: "뉴스", tagDark: true },
  { name: "국내채권", color: "#2DD4BF", prior: "3.30%", post: "3.71%", delta: "+0.41", dc: C.up, why: "금리 하락 → 채권 강세 · 신뢰도 55%", src: "미 연준 2026 금리 인하 · NPS 하우스뷰 ↗", tag: "리서치", tagDark: false },
  { name: "해외채권", color: "#FB923C", prior: "3.60%", post: "3.97%", delta: "+0.37", dc: C.up, why: "금리 하락 → 채권 강세 · 신뢰도 55%", src: "미 연준 2026 금리 인하 · NPS 하우스뷰 ↗", tag: "리서치", tagDark: false },
  { name: "대체투자", color: "#FACC15", prior: "5.10%", post: "5.10%", delta: "—", dc: C.t6, why: "시장 균형 유지 (적용된 뷰 없음)", src: "", tag: "", tagDark: false },
];

const RISK = [
  ["기대수익률", "6.84%", C.white], ["변동성", "9.12%", C.white], ["샤프 비율", "0.61", C.white],
  ["95% VaR", "-13.7%", C.redL], ["95% CVaR", "-18.2%", C.redL], ["최대낙폭", "-22.4%", C.redL],
];

export function Workspace({ mode = "demo" }: { mode?: "demo" | "new" }) {
  const isNew = mode === "new";
  const [tab, setTab] = useState("배분");
  const [traceLen, setTraceLen] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);

  // ── Live data (read-only endpoints) ───────────────────────────────────────
  const [macro, setMacro] = useState<any | null>(null);
  const [intel, setIntel] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [houseTheses, setHouseTheses] = useState<any[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState<{ phase: string; items: string[] } | null>(null);
  const [buildingTheses, setBuildingTheses] = useState(false);
  const [researchMsg, setResearchMsg] = useState("");
  // Backend connectivity: null = unknown, true = reachable, false = down.
  // When down we show a banner instead of silently falling back to mock data.
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [intelNotice, setIntelNotice] = useState<string>("");

  useEffect(() => {
    let reachable = false;
    const getJson = async (path: string) => {
      try {
        const r = await fetch(API_BASE + path);
        if (r.ok) { reachable = true; return await r.json(); }
      } catch { /* network error → backend unreachable */ }
      return null;
    };
    (async () => {
      const m = await getJson("/macro-data"); if (m?.data) setMacro(m.data);
      const i = await getJson("/market-intelligence"); if (Array.isArray(i?.data)) setIntel(i.data);
      const q = await getJson("/research/queue?limit=12"); if (Array.isArray(q?.data)) setQueue(q.data);
      const t = await getJson("/theses"); if (Array.isArray(t?.data)) setHouseTheses(t.data);
      const sm = await getJson("/simulations"); if (Array.isArray(sm)) setReports(sm);
      setBackendUp(reachable);
    })();
  }, []);

  const regime: string = macro?.market_regime || "ELEVATED_RISK";
  const [regimeLabel, regimeColor] = REGIME_MAP[regime] || ["—", C.t3];

  const tickerItems = useMemo<[string, string, string, string][]>(() => {
    if (!macro) return TICKER as any;
    const spec: [string, string][] = [
      ["KOSPI", "KOSPI"], ["S&P 500", "SPY"], ["NASDAQ", "QQQ"], ["VIX", "VIX"],
      ["US 10Y", "US10Y"], ["DXY", "DXY"], ["USD/KRW", "USD_KRW"], ["WTI", "WTI"],
      ["금", "GOLD"], ["비트코인", "BTC"],
    ];
    const out: [string, string, string, string][] = [];
    for (const [label, key] of spec) {
      const d = macro[key];
      if (d && typeof d.current === "number") {
        const chg = typeof d.change_1d === "number" ? d.change_1d : 0;
        out.push([label, fmtQuote(key, d.current), `${chg >= 0 ? "▲" : "▼"}${Math.abs(chg)}%`, chg >= 0 ? C.up : C.red]);
      }
    }
    return out.length >= 4 ? out : (TICKER as any);
  }, [macro]);

  // ── Simulation (/simulate SSE) drives 배분/리스크/프론티어/리포트 + live trace + chips ──
  const DEFAULT_VIEW = "해외주식이 국내주식보다 연 5% 우세할 것 같다. 그리고 금리는 하락할 것이다.";
  const [sim, setSim] = useState<any | null>(null);
  const [running, setRunning] = useState(false);
  const [viewText, setViewText] = useState(isNew ? "" : DEFAULT_VIEW);  // last-run view (shown in the thread)
  const [draft, setDraft] = useState("");                  // composer input
  const [parsedViews, setParsedViews] = useState<any[]>([]);
  const [liveTrace, setLiveTrace] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [attached, setAttached] = useState<any[]>([]);       // intel sources attached to the chat
  const [intelOpen, setIntelOpen] = useState<any | null>(null); // intel item shown in popup
  // Track which intel items the user has opened, so new/unopened ones can be badged.
  // Persisted per-browser in localStorage (no per-user backend).
  const [seenIntel, setSeenIntel] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem("etacolla_seen_intel");
      if (raw) setSeenIntel(new Set(JSON.parse(raw)));
    } catch { /* ignore corrupt/unavailable storage */ }
  }, []);
  const markIntelSeen = (id: string) => {
    if (!id) return;
    setSeenIntel((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("etacolla_seen_intel", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const openIntel = (item: any) => { if (item?.id) markIntelSeen(item.id); setIntelOpen(item); };
  const [refreshingIntel, setRefreshingIntel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ phase: string; items: string[] } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [dragOverChat, setDragOverChat] = useState(false);

  // ── Live persona chat (left desk is now an AI chatbot) ───────────────────────
  // persona = whom you're addressing; chatMsgs = the live thread (multi-turn);
  // considerations = market views captured from chat that fold into the next run.
  const [persona, setPersona] = useState<"chris" | "jerry" | "ben">("chris");
  const [hoveredPersona, setHoveredPersona] = useState<"chris" | "jerry" | "ben" | null>(null);
  const [chatMsgs, setChatMsgs] = useState<any[]>([]);
  const [considerations, setConsiderations] = useState<any[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  // Entry flow: once Jerry's brief finishes we offer three next-step choices.
  // `entryChoice` (null = still offering) hides the chips once the user picks one
  // or starts typing their own message.
  const [briefDone, setBriefDone] = useState(false);
  const [entryChoice, setEntryChoice] = useState<null | "ben-digest" | "jerry-deepdive" | "ask-ben" | "typed">(null);
  // Ben's post-digest hand-off state machine: hidden → boxes (A/B) → include|ask → hidden.
  const [benFollow, setBenFollow] = useState<"hidden" | "boxes" | "include" | "ask">("hidden");
  const [benSelected, setBenSelected] = useState<string[]>([]); // checked digest ids in the include checklist
  // View → Run bridge (stage B→C): once evidence is gathered, the desk guides the
  // user to form/confirm a view, then run the optimizer. "form" shows the bridge.
  const [viewFlow, setViewFlow] = useState<"hidden" | "form">("hidden");
  // Optimization settings the user chooses in the run step (fed to /simulate).
  const [optimizer, setOptimizer] = useState<"ensemble" | "markowitz" | "risk_parity" | "hrp">("ensemble");
  const [maxDeviation, setMaxDeviation] = useState(0.05); // δ cap vs NPS benchmark
  const [attachOpen, setAttachOpen] = useState(false); // attached-sources tray expanded?
  // Report history: list from /simulations; openReport = the full detail being viewed.
  const [reports, setReports] = useState<any[]>([]);
  const [openReport, setOpenReport] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const removeConsideration = (id: string) => setConsiderations((p) => p.filter((c) => c.id !== id));

  const attachSource = (item: any) => { if (item) setAttached((p) => (p.some((a) => a.id === item.id) ? p : [...p, item])); };
  const detachSource = (id: string) => setAttached((p) => p.filter((a) => a.id !== id));

  // Delete an intel source from the feed (optimistic; rolls back on failure).
  const deleteIntel = async (id: string) => {
    if (!id) return;
    const prev = intel;
    setIntel((p) => p.filter((x: any) => x.id !== id));
    setAttached((p) => p.filter((a) => a.id !== id));
    if (intelOpen?.id === id) setIntelOpen(null);
    try {
      const r = await fetch(API_BASE + "/market-intelligence/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    } catch { setIntel(prev); }
  };

  // Delete an individual house thesis
  const deleteThesis = async (id: string) => {
    if (!id) return;
    const prev = houseTheses;
    setHouseTheses((p) => p.filter((x: any) => x.id !== id));
    try {
      const r = await fetch(API_BASE + "/theses/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    } catch { setHouseTheses(prev); }
  };

  // Reset/delete all house theses
  const resetTheses = async () => {
    if (houseTheses.length === 0) return;
    if (!window.confirm(`${houseTheses.length}개의 하우스 뷰를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    const prev = houseTheses;
    setHouseTheses([]);
    try {
      const r = await fetch(API_BASE + "/theses", { method: "DELETE" });
      if (!r.ok) throw new Error("reset failed");
      setResearchMsg("하우스 뷰 보드를 초기화했습니다.");
    } catch { setHouseTheses(prev); }
  };

  // Streaming refresh — live log (reading → selecting → analyzing) instead of blanking.
  // `onActivity` (optional) receives a coarse Korean stage label as the pipeline
  // progresses, so callers (e.g. Ben's digest bubble) can animate a "thinking"
  // status. Returns a summary of what actually happened so the caller can report it.
  const refreshIntel = async (opts?: { onActivity?: (label: string) => void }) => {
    let stage = "";
    const setStage = (label: string) => { if (label && label !== stage) { stage = label; opts?.onActivity?.(label); } };
    setRefreshingIntel(true);
    setIntelNotice("");
    setRefreshProgress({ phase: "연결 중…", items: [] });
    setStage("최신 뉴스 소스에 연결하고 있습니다…");
    const items: string[] = [];
    const analyzed: string[] = []; // titles of freshly-analyzed articles
    let gotResult = false;   // did the backend send a final result?
    let newCount = 0;        // how many freshly-analyzed theses were committed
    let streamErr = "";      // explicit error reported by the backend
    try {
      const res = await fetch(API_BASE + "/market-intelligence/refresh-stream");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") { setRefreshProgress({ phase: evt.msg || "", items: [...items] }); /* chat status stays Korean via the article stages below */ }
            else if (evt.type === "article_read") { items.push(`📰 ${evt.source} · ${evt.title}`); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); setStage("시장 뉴스를 읽고 있습니다…"); }
            else if (evt.type === "article_selected") { items.push(`✓ 선택됨 · ${evt.title}`); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); setStage("관련 기사를 선별하고 있습니다…"); }
            else if (evt.type === "article_analyzing" && evt.status === "done") { items.push(`⬡ 분석 완료 · ${evt.title}`); if (evt.title) analyzed.push(evt.title); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); setStage("선별한 기사를 분석하고 있습니다…"); }
            else if (evt.type === "error") { streamErr = evt.msg || "백엔드 오류"; }
            else if (evt.type === "result" && Array.isArray(evt.data)) { gotResult = true; newCount = typeof evt.new_count === "number" ? evt.new_count : -1; setIntel(evt.data); }
          } catch { /* skip malformed */ }
        }
      }
      // Tell the user what actually happened instead of failing silently.
      if (streamErr) setIntelNotice(`⚠ 새로고침 중 오류: ${streamErr}`);
      else if (!gotResult) setIntelNotice("⚠ 새로고침이 완료되지 않았습니다 (백엔드 응답 없음). 백엔드 서버가 실행 중인지 확인하세요.");
      else if (newCount === 0) setIntelNotice("분석된 새 기사가 없습니다 (모델이 결과를 반환하지 않음). 기존 인텔을 유지합니다.");
      else if (newCount > 0) setIntelNotice(`✓ 새 기사 ${newCount}건을 분석해 반영했습니다.`);
      return { ok: gotResult && !streamErr, gotResult, newCount, streamErr, analyzed };
    } catch (e: any) {
      setBackendUp(false);
      setIntelNotice(`⚠ 새로고침 실패: 백엔드에 연결할 수 없습니다 (${API_BASE}). 서버가 실행 중인지 확인하세요.`);
      return { ok: false, gotResult: false, newCount: 0, streamErr: "연결 실패", analyzed };
    } finally { setRefreshingIntel(false); setRefreshProgress(null); }
  };

  // Analyze a user-supplied link or PDF into a new market-intel thesis.
  // If the LLM flags it as off-topic / too company-specific, warn and only proceed on confirm.
  const ingestUrl = async (url: string) => {
    const u = url.trim();
    if (!u || ingesting) return;
    setIngesting(true);
    try {
      let confirm = false;
      while (true) {
        const r = await fetch(API_BASE + "/market-intelligence/from-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u, confirm }) });
        const j = await r.json().catch(() => ({}));
        if (j.status === "ok" && Array.isArray(j.data)) { setIntel(j.data); break; }
        if (j.status === "needs_confirmation") {
          if (window.confirm(`⚠️ ${j.warning}\n\n자산배분 관점과 거리가 있을 수 있습니다. 그래도 마켓 인텔리전스로 추가할까요?`)) { confirm = true; continue; }
          break;
        }
        if (j.status === "needs_content") { alert(j.message || "URL 본문을 불러오지 못했습니다. 본문을 붙여넣어 주세요."); break; }
        break;
      }
    } catch { /* ignore */ } finally { setIngesting(false); }
  };
  const ingestPdf = async (file: File) => {
    if (!file || ingesting) return;
    setIngesting(true);
    try {
      let confirm = false;
      while (true) {
        const form = new FormData(); form.append("file", file); if (confirm) form.append("confirm", "true");
        const r = await fetch(API_BASE + "/market-intelligence/from-pdf", { method: "POST", body: form });
        const j = await r.json().catch(() => ({}));
        if (j.status === "ok" && Array.isArray(j.data)) { setIntel(j.data); break; }
        if (j.status === "needs_confirmation") {
          if (window.confirm(`⚠️ ${j.warning}\n\n자산배분 관점과 거리가 있을 수 있습니다. 그래도 마켓 인텔리전스로 추가할까요?`)) { confirm = true; continue; }
          break;
        }
        if (j.status === "needs_content") { alert(j.message || "PDF에서 텍스트를 추출하지 못했습니다."); break; }
        break;
      }
    } catch { /* ignore */ } finally { setIngesting(false); }
  };

  // ── Research pipeline: collect (streaming) → build theses → drag to chat ──────
  const refetchResearch = async () => {
    try {
      const q = await fetch(API_BASE + "/research/queue?limit=12"); if (q.ok) { const j = await q.json(); if (Array.isArray(j?.data)) setQueue(j.data); }
      const t = await fetch(API_BASE + "/theses"); if (t.ok) { const j = await t.json(); if (Array.isArray(j?.data)) setHouseTheses(j.data); }
    } catch { /* ignore */ }
  };
  const runCollect = async () => {
    setCollecting(true);
    setCollectProgress({ phase: "연결 중…", items: [] });
    const items: string[] = [];
    try {
      const res = await fetch(API_BASE + "/research/collect-stream");
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") setCollectProgress({ phase: evt.msg || "", items: [...items] });
            else if (evt.type === "source") { items.push(`⬡ ${evt.name} · ${evt.count}건`); setCollectProgress({ phase: "수집 중…", items: [...items] }); }
            else if (evt.type === "done") { const s = evt.summary || {}; setResearchMsg(`✓ 수집 완료 — 저장소 ${s.total_in_store ?? 0}건 (이번 ${s.collected_now ?? 0}건)`); }
            else if (evt.type === "error") setResearchMsg(`수집 오류: ${evt.msg}`);
          } catch { /* skip */ }
        }
      }
      await refetchResearch();
    } catch { setResearchMsg("수집 중 오류가 발생했습니다."); } finally { setCollecting(false); setCollectProgress(null); }
  };
  const buildTheses = async () => {
    setBuildingTheses(true);
    setResearchMsg("Nemotron Super가 Bull·Bear 논거를 추출하고 하우스 뷰로 통합하는 중… (최대 2분)");
    try {
      const r = await fetch(API_BASE + "/thesis/build", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (Array.isArray(j?.data) && j.data.length) { setHouseTheses(j.data); setResearchMsg(`✓ ${j.data.length}개의 하우스 뷰를 생성했습니다. 카드를 채팅으로 끌어다 놓으세요.`); }
      else { await refetchResearch(); setResearchMsg(j.detail || "하우스 뷰 생성에 실패했습니다. 먼저 '수집'을 실행했는지 확인하세요."); }
    } catch { setResearchMsg("하우스 뷰 생성 중 오류가 발생했습니다."); } finally { setBuildingTheses(false); }
  };
  const attachThesis = (t: any) => {
    const key = t.asset || t.asset1;
    attachSource({
      id: t.id,
      title: t.title || (key ? ASSET_KR[key] || key : "하우스 뷰"),
      source: "하우스 뷰 · 리서치",
      content: t.rationale || "",
      ai_interpretation: { summary: t.rationale || "", confidence: t.confidence ?? 0.6, impacted_assets: [t.asset || t.asset1].filter(Boolean) },
    });
  };

  // Report history helpers.
  const refetchReports = async () => {
    try { const r = await fetch(API_BASE + "/simulations"); if (r.ok) { const j = await r.json(); if (Array.isArray(j)) setReports(j); } } catch { /* offline */ }
  };
  const openReportDetail = async (id: number) => {
    if (sim && sim.simulation_id === id) { setOpenReport(sim); return; } // already in memory
    setReportLoading(true);
    try { const r = await fetch(API_BASE + "/simulations/" + id); if (r.ok) setOpenReport(await r.json()); } catch { /* offline */ } finally { setReportLoading(false); }
  };

  const runSimulation = async (text?: string) => {
    const vt = (text ?? viewText).trim();
    if ((!vt && attached.length === 0 && considerations.length === 0) || running) return;
    if (vt) setViewText(vt);
    setRunning(true); setLiveTrace(""); setLoadingStep(0); setParsedViews([]);
    // Fold the live view + any chat-captured considerations + attached intel sources into
    // a single view_text — the /simulate view-parsing prompt cites these directly.
    const composed = [
      vt,
      considerations.length
        ? `--- [사용자 고려사항] ---\n${considerations.map((c) => `• ${c.text}`).join("\n")}`
        : "",
      attached.length
        ? `--- [첨부된 마켓 인텔리전스] ---\n${attached.map((a) => `[${a.source || a.author || "출처"} - ${a.title}]: ${a.ai_interpretation?.summary || a.content || ""}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n").trim();
    try {
      const res = await fetch(API_BASE + "/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view_text: composed, optimizer, max_deviation: maxDeviation }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const p = JSON.parse(line);
            if (typeof p.step === "number") setLoadingStep(p.step);
            if (p.type === "thinking" && p.chunk) setLiveTrace((prev) => (prev + p.chunk).slice(-4000));
            if (p.step === 9 && p.data) {
              setSim(p.data);
              if (Array.isArray(p.data.parsed_views)) setParsedViews(p.data.parsed_views);
            }
          } catch { /* skip partial line */ }
        }
      }
    } catch { /* offline → tabs keep mock */ } finally { setRunning(false); refetchReports(); }
  };

  // ── Send a chat message to the chosen persona (streams the reply via /chat) ──
  // The backend classifies intent: a market VIEW is captured as a consideration;
  // a RUN command fires the optimizer after the reply; a QUESTION just answers.
  // `opts` lets callers send programmatically: `text` overrides the composer,
  // `persona` overrides who answers, `extraAttach` guarantees a source is in the
  // grounding context even if its attach state hasn't flushed yet (used by
  // "ask about a specific digest").
  const sendChat = async (opts?: { text?: string; persona?: "chris" | "jerry" | "ben"; extraAttach?: any }) => {
    const text = (opts?.text ?? draft).trim();
    if (!text || chatBusy || running) return;
    const who = opts?.persona ?? persona;
    userInteractedRef.current = true; // user took over → suppress any pending auto-brief
    setEntryChoice((c) => c ?? "typed"); // hide the entry chips once the user acts
    setBenFollow("hidden"); // and Ben's post-digest hand-off UI
    if (opts?.text === undefined) setDraft("");
    const meta = PERSONA_META[who];
    const botId = "b" + Date.now() + Math.random().toString(36).slice(2, 6);
    const history = chatMsgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
    setChatMsgs((prev) => [
      ...prev,
      { id: "u" + botId, role: "user", content: text },
      { id: botId, role: "persona", persona: who, who: meta.name, role2: meta.role, color: meta.color, bg: meta.bg, border: meta.border, content: "", streaming: true },
    ]);
    setChatBusy(true);
    const attachedForCtx = opts?.extraAttach
      ? [opts.extraAttach, ...attached.filter((a) => a.id !== opts.extraAttach.id)]
      : attached;
    const context = {
      sim: sim
        ? {
            optimized_weights: sim.optimized_weights,
            benchmark_weights: sim.benchmark_portfolio?.weights ?? sim.benchmark_weights,
            risk_metrics: sim.risk_metrics,
            parsed_views: sim.parsed_views,
            posterior_returns: sim.posterior_returns,
          }
        : null,
      macro,
      intel: intel.slice(0, 6).map((i: any) => ({ title: i.title })),
      attached: attachedForCtx.map((a) => ({ source: a.source, title: a.title, content: a.content, ai_interpretation: a.ai_interpretation })),
      considerations: considerations.map((c) => c.text),
    };
    let shouldRun = false;
    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: who, message: text, history, context }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "intent") {
              if (evt.intent === "view") {
                const label = (evt.summary && evt.summary.trim()) || text.slice(0, 40);
                setConsiderations((prev) => (prev.some((c) => c.text === text) ? prev : [...prev, { id: "c" + botId, label, text }]));
                if (!sim && !running) setViewFlow("form"); // a captured view surfaces the run bridge
              } else if (evt.intent === "run") {
                shouldRun = true;
              }
            } else if (evt.type === "token" && evt.chunk) {
              setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, content: m.content + evt.chunk } : m)));
            }
          } catch { /* skip partial */ }
        }
      }
    } catch {
      setChatMsgs((prev) => prev.map((m) => {
        if (m.id !== botId) return m;
        const errMsg = "(연결 오류로 인해 답변이 중단되었습니다.)";
        return {
          ...m,
          content: m.content ? `${m.content} \n\n${errMsg}` : "(연결 오류로 답변을 불러오지 못했습니다. 백엔드가 실행 중인지 확인하세요.)"
        };
      }));
    } finally {
      setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, streaming: false } : m)));
      setChatBusy(false);
      if (shouldRun) runSimulation();
    }
  };

  // Entry is a clean chat — no auto-run, no scripted analyst messages. A run only
  // happens when the user chats a view/"run" or hits 다시 최적화. (Right-panel tabs
  // fall back to their demo/mock data until a real run populates `sim`.)
  const hasRun = !!sim || running || liveTrace.length > 0;

  // ── Entry flow: Chris welcomes, then Jerry briefs the live macro numbers ─────
  // Chris's greeting is static (a greeting needs no AI). Jerry's daily brief
  // streams from /desk/daily-brief, grounded ONLY in the macro indicators we
  // fetched — no web search, no invented figures. If the user starts chatting
  // before the brief fires, we suppress it (userInteractedRef).
  const userInteractedRef = useRef(false);
  const welcomedRef = useRef(false);
  const briefedRef = useRef(false);

  // Seed Chris's greeting (static — a greeting needs no AI). Idempotent.
  const seedChrisWelcome = () => {
    const meta = PERSONA_META.chris;
    setChatMsgs((prev) =>
      prev.some((m) => m.id === "welcome-chris")
        ? prev
        : [...prev, {
            id: "welcome-chris", role: "persona", persona: "chris",
            who: meta.name, role2: meta.role, color: meta.color, bg: meta.bg, border: meta.border,
            content: "안녕하세요, 에타콜라 데스크의 최고투자전략가 Chris입니다. 오늘도 함께 자산배분을 점검해 보시죠. 먼저 매크로 데스크의 Jerry가 우리 데이터로 오늘의 시장 숫자를 브리핑해 드리겠습니다.",
            streaming: false,
          }]
    );
  };

  // Switch to the 매크로 tab and stream Jerry's daily brief (built from exactly
  // our macro numbers) into a fresh bubble. Reveals the hand-off chips when done.
  const runJerryBrief = async () => {
    if (!macro) return;
    setTab("매크로");
    const meta = PERSONA_META.jerry;
    const botId = "brief-jerry-" + Date.now();
    setChatMsgs((prev) => [...prev, {
      id: botId, role: "persona", persona: "jerry",
      who: meta.name, role2: meta.role, color: meta.color, bg: meta.bg, border: meta.border,
      content: "", streaming: true,
    }]);
    setChatBusy(true);
    try {
      const res = await fetch(API_BASE + "/desk/daily-brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "token" && evt.chunk) {
              setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, content: m.content + evt.chunk } : m)));
            }
          } catch { /* skip partial line */ }
        }
      }
    } catch {
      setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, content: m.content || "(브리핑을 불러오지 못했습니다. 백엔드가 실행 중인지 확인하세요.)" } : m)));
    } finally {
      setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, streaming: false } : m)));
      setChatBusy(false);
      setBriefDone(true); // reveal the "what's next?" chips
    }
  };

  // Reset the desk conversation and replay onboarding from the top.
  const startNewChat = () => {
    if (chatBusy) return; // don't reset while a persona is actively working
    setChatMsgs([]);
    setConsiderations([]);
    setEntryChoice(null);
    setBriefDone(false);
    setBenFollow("hidden");
    setBenSelected([]);
    setViewFlow("hidden");
    setDraft("");
    userInteractedRef.current = false;
    welcomedRef.current = true; // we re-seed manually below
    briefedRef.current = true;
    seedChrisWelcome();
    if (macro && backendUp !== false) runJerryBrief();
  };

  // On entry: Chris greets, then (once macro is in) Jerry briefs. Each fires once;
  // suppressed if the user starts chatting first (userInteractedRef).
  useEffect(() => {
    if (welcomedRef.current || userInteractedRef.current) return;
    welcomedRef.current = true;
    seedChrisWelcome();
  }, []);
  useEffect(() => {
    if (briefedRef.current || userInteractedRef.current) return;
    if (backendUp === false || !macro) return; // backend down / no numbers → skip
    briefedRef.current = true;
    runJerryBrief();
  }, [macro, backendUp]);

  // Append a static in-character message from a persona. Used by the entry-flow
  // hand-off buttons — deterministic onboarding copy, no LLM call.
  const pushPersonaMsg = (who: "chris" | "jerry" | "ben", content: string) => {
    const meta = PERSONA_META[who];
    setChatMsgs((prev) => [...prev, {
      id: "sys" + Date.now() + Math.random().toString(36).slice(2, 5),
      role: "persona", persona: who,
      who: meta.name, role2: meta.role, color: meta.color, bg: meta.bg, border: meta.border,
      content, streaming: false,
    }]);
  };

  // ── The three post-brief hand-offs Jerry offers ─────────────────────────────
  // 1) Meet Ben for a market/asset+news digest. This actually TRIGGERS the news
  //    refresh pipeline: Ben shows a live "thinking" status driven by the real
  //    collect/analyze stages, then reports a summary of what he found.
  const benDigestSummary = (s: any) => {
    if (!s || (!s.gotResult && s.streamErr)) {
      if (s?.streamErr && s.streamErr !== "연결 실패")
        return `죄송합니다. 뉴스를 분석하는 중 문제가 발생했습니다 (${s.streamErr}). 잠시 후 다시 시도해 주시면 다시 살펴보겠습니다.`;
      return "죄송합니다. 지금은 뉴스 서버에 연결하지 못해 분석을 마치지 못했습니다. 백엔드가 실행 중인지 확인해 주시면 다시 시도하겠습니다.";
    }
    const lines: string[] = ["최신 시장 뉴스를 수집하고 분석을 마쳤습니다."];
    if (typeof s.newCount === "number" && s.newCount > 0) {
      lines.push(`이번에 새로 분석한 기사는 ${s.newCount}건입니다.`);
      const sample = (s.analyzed || []).slice(0, 3);
      if (sample.length) lines.push("특히 이런 기사를 살펴봤습니다: " + sample.map((t: string) => `「${t}」`).join(", ") + ".");
    } else if (s.newCount === 0) {
      lines.push("이번에는 새로 반영할 신규 기사가 없어, 기존 인텔리전스를 그대로 유지했습니다.");
    } else {
      lines.push("분석 결과를 인텔리전스 탭에 반영했습니다.");
    }
    lines.push("인텔리전스 탭에서 분석된 카드를 확인하실 수 있습니다. 관심 있는 기사를 대화에 첨부해 주시면 자산배분 근거로 함께 활용해 드리겠습니다.");
    return lines.join("\n\n");
  };
  const runBenDigest = async () => {
    if (chatBusy) return;
    setEntryChoice("ben-digest");
    setPersona("ben");
    setTab("인텔리전스");
    const meta = PERSONA_META.ben;
    const botId = "ben-digest-" + Date.now();
    setChatMsgs((prev) => [...prev, {
      id: botId, role: "persona", persona: "ben",
      who: meta.name, role2: meta.role, color: meta.color, bg: meta.bg, border: meta.border,
      content: "네, 최신 시장 뉴스를 수집해 분석해 보겠습니다.",
      status: "최신 뉴스 소스에 연결하고 있습니다…", streaming: true, thinking: true,
    }]);
    setChatBusy(true);
    let summary: any;
    try {
      summary = await refreshIntel({
        onActivity: (label) => setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, status: label } : m))),
      });
    } catch { summary = { ok: false, streamErr: "연결 실패" }; }
    const text = benDigestSummary(summary);
    setChatMsgs((prev) => prev.map((m) => (m.id === botId ? { ...m, content: text, status: undefined, streaming: false, thinking: false } : m)));
    setChatBusy(false);
    if (summary?.gotResult) setBenFollow("boxes"); // offer the next-step hand-off
  };

  // ── Ben's post-digest hand-offs (A: include digests · B: ask about one) ──────
  const benDigests = () => intel.slice(0, 8); // the analyzed cards to choose from
  const openBenInclude = () => { setBenSelected(benDigests().map((d: any) => d.id)); setBenFollow("include"); };
  const toggleBenSelected = (id: string) =>
    setBenSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const confirmBenInclude = () => {
    const chosen = benDigests().filter((d: any) => benSelected.includes(d.id));
    chosen.forEach((d: any) => attachSource(d));
    setBenFollow("hidden");
    if (chosen.length) {
      pushPersonaMsg("ben", `${chosen.length}건의 디제스트를 대화에 반영했습니다. 이 근거를 바탕으로 자산배분을 논의해 보겠습니다.`);
      pushPersonaMsg("chris", "이제 이 근거로 어떤 뷰를 가지고 계신지 정해 볼까요? 직접 의견을 남겨 주시거나, 리서치 하우스 뷰를 채택하실 수 있습니다. 특별한 뷰가 없다면 기준 비중으로 먼저 확인해 볼 수도 있습니다.");
      setViewFlow("form"); // bridge to the view → run stage
    }
  };

  // ── View → Run bridge (stage B): three ways to form a view, then run ─────────
  const viewInputDirect = () => {
    setPersona("chris");
    pushPersonaMsg("chris", "시장에 대한 생각을 편하게 입력해 주세요. 예: '해외주식이 국내보다 나을 것 같다', '금리는 내릴 것 같다'. 남겨 주신 의견은 고려사항으로 기록되어 최적화에 반영됩니다.");
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };
  const adoptHouseView = () => {
    if (houseTheses.length) {
      houseTheses.forEach((t: any) => attachThesis(t));
      pushPersonaMsg("jerry", `리서치 하우스 뷰 ${houseTheses.length}건을 근거로 채택했습니다. 아래 '이 뷰로 최적화 실행'으로 바로 진행하실 수 있습니다.`);
    } else {
      setTab("리서치");
      pushPersonaMsg("jerry", "아직 생성된 하우스 뷰가 없습니다. 리서치 탭에서 '수집 → 논거 구축'을 실행하면 하우스 뷰(테제)를 만들 수 있습니다. 생성 후 다시 '하우스 뷰 채택'을 눌러 주세요.");
    }
  };
  const runWithViews = () => {
    setViewFlow("hidden");
    runSimulation();
  };
  const runPriorOnly = () => {
    setViewFlow("hidden");
    pushPersonaMsg("chris", "특별한 뷰 없이 NPS 기준 비중을 기준으로 최적화를 실행합니다. 결과는 오른쪽 탭에서 확인하실 수 있습니다.");
    runSimulation("특별한 시장 뷰 없이 NPS 기준 비중을 유지합니다.");
  };
  // Attach the chosen digest and ask Ben to explain it — a real grounded LLM answer.
  const askBenAbout = async (d: any) => {
    if (!d) return;
    attachSource(d);
    setBenFollow("hidden");
    setPersona("ben");
    await sendChat({ persona: "ben", extraAttach: d, text: `방금 분석한 「${d.title}」 디제스트를 더 자세히 설명해 주세요. 핵심 내용과 자산배분 관점에서의 함의를 알려 주세요.` });
    if (!sim && !running) setViewFlow("form"); // after the explanation, offer the run bridge
  };
  // 2) Let Jerry run a deeper macro research deep-dive (research feature).
  const chooseJerryDeepDive = () => {
    setEntryChoice("jerry-deepdive");
    setPersona("jerry");
    setTab("리서치");
    pushPersonaMsg("jerry",
      "매크로를 더 깊이 파고들어 보겠습니다. 리서치 탭에서 '수집'을 실행하면 FRED 지표와 뉴스, 리서치 자료를 모아 자산군별로 정리하고, 이를 근거로 하우스 뷰(테제)를 구성합니다. 준비되시면 리서치 탭에서 시작하실 수 있습니다.");
  };
  // 3) Ask Ben to explain any number on the macro dashboard.
  const chooseAskBen = () => {
    setEntryChoice("ask-ben");
    setPersona("ben");
    setTab("매크로");
    pushPersonaMsg("ben",
      "매크로 대시보드의 수치 중 이해가 어려운 부분이 있으면 무엇이든 물어봐 주세요. 지표가 무엇을 의미하는지, 지금 수준이 어떤 신호인지 쉽게 풀어서 설명해 드리겠습니다.");
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  // Keep the conversation pinned to the latest message / streamed token.
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [chatMsgs, considerations.length, briefDone, entryChoice, benFollow, viewFlow]);

  // reasoning-trace typing loop (mirrors ReasoningTrace.dc.html)
  useEffect(() => {
    let len = 0;
    let t: ReturnType<typeof setTimeout>;
    const total = REASONING.length;
    const step = () => {
      len = Math.min(total, len + 2);
      setTraceLen(len);
      if (len < total) t = setTimeout(step, 26);
      else t = setTimeout(() => { len = 0; setTraceLen(0); step(); }, 5200);
    };
    t = setTimeout(step, 350);
    return () => clearTimeout(t);
  }, []);

  const prog = traceLen / REASONING.length;
  const activeStep = TRACE_STEPS.findIndex((s) => prog < s.at);

  // When a real run is in flight (or just finished), show the model's live reasoning;
  // otherwise fall back to the ambient scripted loop.
  const live = running || liveTrace.length > 0;
  const LIVE_FRAC: Record<number, number> = { 0: 0, 1: 0.05, 2: 0.1, 3: 0.4, 4: 0.55, 5: 0.78, 6: 0.86, 7: 0.92, 8: 0.97, 9: 1 };
  const effProg = live ? (LIVE_FRAC[loadingStep] ?? 0) : prog;
  const effActive = TRACE_STEPS.findIndex((s) => effProg < s.at);
  const traceText = live ? liveTrace : REASONING.slice(0, traceLen);
  const traceStatus = live ? (running ? "추론 중…" : "✓ 완료") : (traceLen >= REASONING.length ? "✓ 완료" : "추론 중…");

  const chips = parsedViews.length
    ? parsedViews.map((v) => v.view_type === "relative"
        ? { tag: "REL", tagBg: C.violet, text: `${ASSET_KR[v.asset1] || v.asset1} ▸ ${ASSET_KR[v.asset2] || v.asset2}`, val: `+${((v.outperformance || 0) * 100).toFixed(1)}%`, conf: `·${Math.round((v.confidence || 0) * 100)}%` }
        : { tag: "ABS", tagBg: C.green, text: `${ASSET_KR[v.asset] || v.asset} ${(v.expected_return || 0) >= 0 ? "강세" : "약세"}`, val: `${(v.expected_return || 0) >= 0 ? "+" : ""}${((v.expected_return || 0) * 100).toFixed(1)}%`, conf: `·${Math.round((v.confidence || 0) * 100)}%` })
    : isNew
      ? []
      : [
          { tag: "REL", tagBg: C.violet, text: "해외주식 ▸ 국내주식", val: "+5.0%", conf: "·68%" },
          { tag: "ABS", tagBg: C.green, text: "채권 강세 (금리↓)", val: "+2.2%", conf: "·55%" },
        ];

  return (
    <div style={{ width: "100%", height: "100vh", minHeight: 840, background: C.bg, color: C.white, fontFamily: FP, fontVariantNumeric: "tabular-nums", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style jsx global>{`
        @keyframes pulseDot { 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes growBar { from{ transform:scaleX(0) } to{ transform:scaleX(1) } }
        @keyframes growUp { from{ transform:scaleY(0) } to{ transform:scaleY(1) } }
        @keyframes donutIn { from{ opacity:0; transform:rotate(-90deg) scale(.72) } to{ opacity:1; transform:rotate(-90deg) scale(1) } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes ticker { from{ transform:translateX(0) } to{ transform:translateX(-50%) } }
        @keyframes slideInRight { from{ transform:translateX(100%) } to{ transform:translateX(0) } }
        .etc-scroll::-webkit-scrollbar{ width:8px; height:8px; }
        .etc-scroll::-webkit-scrollbar-thumb{ background:#1e1e1e; border-radius:4px; }
        .etc-scroll::-webkit-scrollbar-track{ background:transparent; }
        .etc-bar:hover .etc-tip{ opacity:1; }
        .etc-bar:hover .etc-fill{ filter:brightness(1.25); }
      `}</style>

      <ChangelogDrawer />

      {/* ============ TOP NAV ============ */}
      <div style={{ height: 54, flex: "0 0 54px", borderBottom: `1px solid ${C.b1}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <EtacollaLogo size={22} wordmarkSize={16} color={C.white} />
          <span style={{ width: 1, height: 18, background: "#222" }} />
          <span style={{ fontSize: 10.5, color: C.t4, letterSpacing: ".2px" }}>your personal macro asset allocation analyst</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.b5}`, padding: "5px 11px", borderRadius: 4 }}>
            <span style={{ fontSize: 9, fontFamily: FA, letterSpacing: "1.5px", color: "#6b6b6b" }}>MARKET REGIME</span>
            <span style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, letterSpacing: "1px", color: regimeColor, background: `${regimeColor}1a`, border: `1px solid ${regimeColor}40`, padding: "2px 7px", borderRadius: 3 }}>{regimeLabel}</span>
          </div>
          <VersionBadge />
          <span style={{ fontSize: 10, fontFamily: FA, letterSpacing: "1.5px", border: `1px solid ${C.b4}`, padding: "5px 10px", borderRadius: 4, color: "#999" }}>KO</span>
        </div>
      </div>

      {/* ============ LIVE TICKER ============ */}
      <div style={{ flex: "0 0 auto", height: 30, borderBottom: `1px solid ${C.b1}`, background: C.panel2, overflow: "hidden", display: "flex", alignItems: "center" }}>
        <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 8, fontFamily: FA, letterSpacing: "1.5px", color: "#000", background: C.green, padding: "3px 8px", margin: "0 12px", borderRadius: 3, fontWeight: 700 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#000", animation: "pulseDot 1.4s infinite" }} />LIVE
        </span>
        <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%" }}>
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", display: "flex", alignItems: "center", whiteSpace: "nowrap", animation: "ticker 64s linear infinite", willChange: "transform" }}>
            {[...tickerItems, ...tickerItems].map(([label, val, chg, col], i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 15px", borderRight: `1px solid #1a1a1a`, fontFamily: FM, fontSize: 11, color: "#d4d4d4" }}>
                <span style={{ color: C.t4 }}>{label}</span>{val}<span style={{ color: col as string }}>{chg}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ BACKEND-DOWN BANNER ============ */}
      {backendUp === false && (
        <div style={{ flex: "0 0 auto", background: "rgba(255,80,0,.12)", borderBottom: `1px solid ${C.red}`, color: "#ffb088", padding: "8px 22px", fontSize: 11.5, fontFamily: FM, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red }} />
          백엔드 서버에 연결할 수 없습니다 ({API_BASE}). 리서치·마켓 인텔리전스 기능이 동작하지 않으며 화면은 예시 데이터를 표시합니다. 백엔드를 실행한 뒤 새로고침하세요.
        </div>
      )}

      {/* ============ VIEW BUILDER BAR ============ */}
      <div style={{ flex: "0 0 auto", borderBottom: `1px solid ${C.b1}`, background: C.panel, padding: "12px 22px", display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5 }}>YOUR VIEW</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>내 투자 의견</span>
        </div>
        <div style={{ width: 1, height: 32, background: C.b2 }} />
        {chips.map((c, i) => (<Chip key={i} tag={c.tag} tagBg={c.tagBg} text={c.text} val={c.val} conf={c.conf} />))}
        <span style={{ fontSize: 11.5, color: C.t4, border: `1px dashed ${C.b4}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer" }}>+ 신호 추가</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9, fontFamily: FM, color: "#4a4a4a" }}>δ 5% · ENSEMBLE</span>
          <button onClick={() => runSimulation()} disabled={running} style={{ fontFamily: FA, fontWeight: 700, fontSize: 11, letterSpacing: "1.5px", background: "#fff", color: "#000", border: "none", padding: "10px 18px", borderRadius: 6, cursor: running ? "wait" : "pointer", opacity: running ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>{running ? "최적화 중…" : "▶ 다시 최적화"}</button>
        </div>
      </div>

      {/* ============ SPLIT BODY ============ */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* LEFT : conversation (also a drop target for intel cards) */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragOverChat) setDragOverChat(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverChat(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOverChat(false); const id = e.dataTransfer.getData("text/plain"); const item = intel.find((x: any) => x.id === id); if (item) { attachSource(item); return; } const th = houseTheses.find((x: any) => x.id === id); if (th) attachThesis(th); }}
          style={{ width: 466, flex: "0 0 466px", borderRight: `1px solid ${dragOverChat ? C.cyan : C.b1}`, background: dragOverChat ? "#06141a" : C.panelL, display: "flex", flexDirection: "column", minHeight: 0, transition: "background .15s, border-color .15s" }}
        >
          <div style={{ flex: "0 0 auto", padding: "12px 20px", borderBottom: `1px solid #141414`, display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ position: "relative", width: 8, height: 8 }}><span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, animation: "pulseDot 1.6s infinite" }} /></span>
            <span style={{ fontFamily: FA, fontSize: 9.5, letterSpacing: "2px", color: "#888" }}>투자 데스크 · 대화</span>
            <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: FM, color: "#4a4a4a" }}>{sim?.simulation_id ? `RUN #${sim.simulation_id}` : isNew ? "준비됨" : "RUN #248"}</span>
            <button
              onClick={startNewChat}
              disabled={chatBusy}
              title="대화를 처음부터 다시 시작합니다"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", color: chatBusy ? C.t5 : "#cfcfcf", background: "transparent", border: `1px solid ${C.b4}`, padding: "5px 10px", borderRadius: 6, cursor: chatBusy ? "default" : "pointer" }}
            >↻ 새 대화</button>
          </div>

          <div ref={threadRef} className="etc-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 17 }}>
            {/* Chris's greeting is seeded into chatMsgs by the onboarding flow (so
                「새 대화」 can fully reset the thread) — not hardcoded here. */}

            {/* user bubble (last-run view) — only after a real run, never on entry */}
            {hasRun && viewText && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: 330, background: "#fff", color: "#000", fontSize: 13, lineHeight: 1.6, padding: "11px 14px", borderRadius: "14px 14px 4px 14px" }}>{viewText}</div>
              </div>
            )}

            {/* ── live persona chat thread (multi-turn Q&A + view capture) ── */}
            {chatMsgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ maxWidth: 330, background: "#fff", color: "#000", fontSize: 13, lineHeight: 1.6, padding: "11px 14px", borderRadius: "14px 14px 4px 14px" }}>{m.content}</div>
                </div>
              ) : (
                <Msg key={m.id} who={m.who} role={m.role2} avatarColor={m.color} avatarBg={m.bg} avatarBorder={m.border}>
                  <span style={{ whiteSpace: "pre-wrap" }}>{m.content || (m.streaming ? "" : "…")}</span>
                  {/* Working state (e.g. Ben running the news digest): animated dots + a
                      live status label mirroring the actual pipeline stage. */}
                  {m.thinking ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, color: m.color, fontSize: 11.5 }}>
                      <span style={{ display: "inline-flex", gap: 3 }}>
                        {[0, 1, 2].map((i) => (
                          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: m.color, animation: `pulseDot 1.2s ${i * 0.2}s infinite` }} />
                        ))}
                      </span>
                      <span style={{ color: C.t3 }}>{m.status || "분석 중…"}</span>
                    </span>
                  ) : (
                    m.streaming && <span style={{ display: "inline-block", width: 6, height: 11, background: m.color, marginLeft: 2, verticalAlign: -1, animation: "blink 1s step-end infinite" }} />
                  )}
                </Msg>
              )
            )}

            {/* After Jerry's brief: three next-step hand-offs. Hidden once the user
                picks one or starts typing their own message. */}
            {briefDone && !entryChoice && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>다음 단계 · 무엇을 도와드릴까요?</div>
                {[
                  { on: runBenDigest, color: C.cyan, t: "Ben에게 자산·뉴스 디제스트 요청", d: "최신 뉴스를 새로고침해 분석하고, 그 결과를 요약해 드립니다." },
                  { on: chooseJerryDeepDive, color: C.amber, t: "Jerry의 매크로 심층 리서치", d: "FRED·뉴스·리서치를 수집해 하우스 뷰(테제)까지 이어지는 딥다이브를 진행합니다." },
                  { on: chooseAskBen, color: C.cyan, t: "대시보드 수치가 궁금하신가요?", d: "매크로 대시보드의 지표를 Ben이 쉽게 풀어서 설명해 드립니다." },
                ].map((o, i) => (
                  <div
                    key={i}
                    onClick={o.on}
                    style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, transition: "border-color .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = o.color)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b3)}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#eaeaea" }}>{o.t}</span>
                    <span style={{ fontSize: 10.5, lineHeight: 1.5, color: C.t4 }}>{o.d}</span>
                  </div>
                ))}
              </div>
            )}

            {/* After Ben's digest: hand-off state machine. boxes → include | ask. */}
            {benFollow !== "hidden" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                {benFollow === "boxes" && (<>
                  <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>다음 단계 · 디제스트를 어떻게 활용할까요?</div>
                  {[
                    { on: openBenInclude, t: "디제스트를 대화에 반영", d: "분석된 디제스트 중 원하는 것을 골라 근거로 첨부합니다 (배분·답변에 활용)." },
                    { on: () => setBenFollow("ask"), t: "특정 디제스트 자세히 알아보기", d: "한 건을 골라 Ben이 핵심과 배분 관점의 함의를 설명해 드립니다." },
                  ].map((o, i) => (
                    <div key={i} onClick={o.on}
                      style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, transition: "border-color .15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.cyan)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b3)}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#eaeaea" }}>{o.t}</span>
                      <span style={{ fontSize: 10.5, lineHeight: 1.5, color: C.t4 }}>{o.d}</span>
                    </div>
                  ))}
                </>)}

                {benFollow === "include" && (<>
                  <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>대화에 반영할 디제스트를 선택하세요</div>
                  {benDigests().map((d: any) => {
                    const on = benSelected.includes(d.id);
                    return (
                      <div key={d.id} onClick={() => toggleBenSelected(d.id)}
                        style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${on ? C.cyan : C.b3}`, borderRadius: 9, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 9 }}>
                        <span style={{ flex: "0 0 auto", width: 15, height: 15, borderRadius: 4, border: `1px solid ${on ? C.cyan : C.b5}`, background: on ? C.cyan : "transparent", color: "#000", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{on ? "✓" : ""}</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 11.5, color: "#e8e8e8", lineHeight: 1.4 }}>{d.title}</span>
                          <span style={{ fontSize: 9.5, color: C.t5 }}>{d.source || d.author || "출처"}</span>
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <div onClick={confirmBenInclude} style={{ cursor: benSelected.length ? "pointer" : "default", flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, fontFamily: FA, letterSpacing: ".5px", color: benSelected.length ? "#000" : C.t5, background: benSelected.length ? C.cyan : C.b3, borderRadius: 8, padding: "9px 10px" }}>선택한 {benSelected.length}건 반영</div>
                    <div onClick={() => setBenFollow("boxes")} style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.t3, background: "transparent", border: `1px solid ${C.b4}`, borderRadius: 8, padding: "9px 14px" }}>취소</div>
                  </div>
                </>)}

                {benFollow === "ask" && (<>
                  <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>어떤 디제스트를 더 자세히 볼까요?</div>
                  {benDigests().map((d: any) => (
                    <div key={d.id} onClick={() => askBenAbout(d)}
                      style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 9, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 2, transition: "border-color .15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.cyan)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b3)}>
                      <span style={{ fontSize: 11.5, color: "#e8e8e8", lineHeight: 1.4 }}>▸ {d.title}</span>
                      <span style={{ fontSize: 9.5, color: C.t5 }}>{d.source || d.author || "출처"}</span>
                    </div>
                  ))}
                  <div onClick={() => setBenFollow("boxes")} style={{ cursor: "pointer", alignSelf: "flex-start", fontSize: 11, fontWeight: 600, color: C.t3, background: "transparent", border: `1px solid ${C.b4}`, borderRadius: 8, padding: "8px 14px", marginTop: 2 }}>취소</div>
                </>)}
              </div>
            )}

            {/* View → Run bridge (stage B→C): form/confirm a view, then run the
                optimizer. Shown after evidence is gathered; hidden once a run fires. */}
            {viewFlow === "form" && !running && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>뷰 정하기 · 무엇을 근거로 배분을 조정할까요?</div>
                {[
                  { on: viewInputDirect, t: "직접 뷰 입력", d: "시장에 대한 생각을 채팅으로 남기면 고려사항으로 캡처되어 최적화에 반영됩니다." },
                  { on: adoptHouseView, t: "하우스 뷰(리서치) 채택", d: houseTheses.length ? `리서치에서 만든 하우스 뷰 ${houseTheses.length}건을 근거로 채택합니다.` : "하우스 뷰가 없으면 리서치 탭으로 이동해 먼저 생성합니다." },
                ].map((o, i) => (
                  <div key={i} onClick={o.on}
                    style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, transition: "border-color .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.white)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b3)}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#eaeaea" }}>{o.t}</span>
                    <span style={{ fontSize: 10.5, lineHeight: 1.5, color: C.t4 }}>{o.d}</span>
                  </div>
                ))}

                {/* Run settings the user chooses before executing. */}
                <div style={{ background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 9, marginTop: 2 }}>
                  <div>
                    <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1px", color: C.t5, marginBottom: 6 }}>최적화 방식</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {([["ensemble", "앙상블"], ["markowitz", "MVO"], ["risk_parity", "리스크패리티"], ["hrp", "HRP"]] as const).map(([k, label]) => {
                        const on = optimizer === k;
                        return (
                          <span key={k} onClick={() => setOptimizer(k)} style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 600, color: on ? "#000" : C.t3, background: on ? C.white : "transparent", border: `1px solid ${on ? C.white : C.b4}`, borderRadius: 7, padding: "5px 10px" }}>{label}</span>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1px", color: C.t5, marginBottom: 6 }}>이탈 한도 δ · 벤치마크(NPS) 대비 최대 조정폭</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {[0.03, 0.05, 0.10].map((d) => {
                        const on = Math.abs(maxDeviation - d) < 1e-6;
                        return (
                          <span key={d} onClick={() => setMaxDeviation(d)} style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 600, color: on ? "#000" : C.t3, background: on ? C.green : "transparent", border: `1px solid ${on ? C.green : C.b4}`, borderRadius: 7, padding: "5px 12px" }}>±{Math.round(d * 100)}%p</span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {considerations.length + attached.length > 0 ? (
                  <div onClick={runWithViews} style={{ cursor: "pointer", textAlign: "center", fontSize: 11.5, fontWeight: 700, fontFamily: FA, letterSpacing: ".5px", color: "#000", background: C.green, borderRadius: 8, padding: "11px 10px", marginTop: 2 }}>▶ 이 뷰로 최적화 실행 · 반영 {considerations.length + attached.length}건</div>
                ) : (
                  <div onClick={runPriorOnly} style={{ cursor: "pointer", textAlign: "center", fontSize: 11, fontWeight: 600, color: C.t3, background: "transparent", border: `1px solid ${C.b4}`, borderRadius: 8, padding: "10px", marginTop: 2 }}>뷰 없이 기준 비중으로 실행 →</div>
                )}
              </div>
            )}

            {/* Run artifacts — only after a REAL optimization runs. No scripted/hardcoded
                analyst chatter on entry; live persona replies come from the chat thread above. */}
            {hasRun && (
            /* reasoning trace */
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Avatar color={C.violet} small>∑</Avatar>
              <div style={{ flex: 1 }}>
                <div style={{ background: C.panel2, border: `1px solid ${C.b2}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.b1}` }}>
                    <span style={{ position: "relative", width: 7, height: 7 }}><span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.violet, animation: "pulseDot 1.4s infinite" }} /></span>
                    <span style={{ fontFamily: FA, fontSize: 9, letterSpacing: "1.5px", color: "#9a9a9a" }}>NEMOTRON 3 SUPER · 추론 트레이스</span>
                    <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: FM, letterSpacing: ".5px", color: C.violet }}>{traceStatus}</span>
                  </div>
                  <div style={{ padding: "11px 13px", borderBottom: `1px solid #141414`, background: C.panel }}>
                    <div style={{ fontFamily: FM, fontSize: 10, lineHeight: 1.7, color: "#8f8f8f", minHeight: 96, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {traceText || (running ? "추론을 시작하는 중…" : "")}
                      <span style={{ display: "inline-block", width: 6, height: 11, background: C.violet, marginLeft: 2, verticalAlign: -1, animation: "blink 1s step-end infinite" }} />
                    </div>
                  </div>
                  <div style={{ padding: "12px 13px 6px" }}>
                    {TRACE_STEPS.map((s, i) => {
                      const done = effProg >= s.at;
                      const active = i === effActive;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10 }}>
                          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span style={{ width: 15, height: 15, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, flex: "0 0 auto",
                              ...(done ? { background: "#0e0e0e", border: "1px solid #2a2a2a", color: C.green }
                                : active ? { background: C.violet, color: "#000", animation: "pulseDot 1.3s infinite" }
                                : { background: "#0a0a0a", border: `1px solid ${C.b2}`, color: "#444" }) }}>
                              {done ? "✓" : active ? "●" : String(i + 1)}
                            </span>
                            <span style={{ width: 1, flex: 1, background: C.b2, minHeight: 14 }} />
                          </div>
                          <div style={{ paddingBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: done || active ? "#cfcfcf" : "#666" }}>{s.l}</div>
                            <div style={{ fontSize: 10.5, lineHeight: 1.5, color: "#777" }}>{s.d}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            )}

            {/* Chris reports back to chat only once the run has FULLY completed
                (sim received + not running) — never mid-reasoning. */}
            {sim && !running && (<>
              <Msg who="Chris" role="PM · 최종 검토" avatarColor={C.white}>
                <span>의견을 반영해 배분을 마무리했습니다. 시장 레짐을 감안해 틸트 강도는 δ 한도 내로 절제했어요. 아래에서 결과를 함께 살펴보시죠.</span>
              </Msg>
              {/* Stage D: guided walk through the results, ending at the PM report. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                <div style={{ fontSize: 9, fontFamily: FA, fontWeight: 700, letterSpacing: "1.2px", color: C.t5, paddingLeft: 2 }}>결과 둘러보기</div>
                {[
                  { t: "배분 결과", d: "벤치마크(NPS) 대비 자산별 비중 변화와 근거", go: "배분" },
                  { t: "리스크 지표", d: "기대수익률·변동성·샤프·VaR/CVaR·최대낙폭", go: "리스크" },
                  { t: "효율적 프론티어", d: "최적 포트폴리오의 위험–수익 위치", go: "프론티어" },
                ].map((o, i) => (
                  <div key={i} onClick={() => setTab(o.go)}
                    style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, transition: "border-color .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.white)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b3)}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#eaeaea" }}>{o.t}</span>
                    <span style={{ fontSize: 10.5, lineHeight: 1.5, color: C.t4 }}>{o.d}</span>
                  </div>
                ))}
                <div onClick={() => { setTab("리포트"); if (sim) setOpenReport(sim); }} style={{ cursor: "pointer", textAlign: "center", fontSize: 11.5, fontWeight: 700, fontFamily: FA, letterSpacing: ".5px", color: "#000", background: "#fff", borderRadius: 8, padding: "11px 10px", marginTop: 2 }}>PM 최종 리포트 →</div>
              </div>
            </>)}
          </div>

          {/* composer */}
          <div style={{ flex: "0 0 auto", borderTop: `1px solid #141414`, padding: "11px 16px 13px" }}>
            {/* Attached sources — a compact one-line summary that expands into a
                scrollable tray, so many sources don't stack up and eat the composer. */}
            {attached.length > 0 && (
              <div style={{ marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5 }}>
                  <span onClick={() => setAttachOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: C.cyan, background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.3)", borderRadius: 13, padding: "4px 10px" }}>
                    <span style={{ transform: attachOpen ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: 8 }}>▶</span>
                    📎 첨부 자료 {attached.length}건
                  </span>
                  <span onClick={() => { setAttached([]); setAttachOpen(false); }} style={{ cursor: "pointer", color: C.t4, fontSize: 10 }}>모두 지우기</span>
                </div>
                {attachOpen && (
                  <div className="etc-scroll" style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7, maxHeight: 132, overflowY: "auto", paddingRight: 2 }}>
                    {attached.map((a) => (
                      <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.cyan, background: "rgba(34,211,238,.06)", border: "1px solid rgba(34,211,238,.22)", borderRadius: 8, padding: "5px 9px" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📎 {a.title}</span>
                        <span onClick={() => detachSource(a.id)} style={{ cursor: "pointer", color: C.t4, flex: "0 0 auto" }}>✕</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* captured considerations — fold into the next optimization run */}
            {considerations.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t5, marginRight: 2 }}>고려사항</span>
                {considerations.map((c) => (
                  <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 230, fontSize: 10, color: C.green, background: "rgba(0,200,5,.08)", border: "1px solid rgba(0,200,5,.25)", borderRadius: 13, padding: "4px 8px 4px 10px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↑ {c.label}</span>
                    <span onClick={() => removeConsideration(c.id)} style={{ cursor: "pointer", color: C.t4, flex: "0 0 auto" }}>✕</span>
                  </span>
                ))}
              </div>
            )}
            {/* persona selector — choose who you're addressing */}
            <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap", position: "relative" }}>
              {(["chris", "jerry", "ben"] as const).map((key) => {
                const meta = PERSONA_META[key];
                const active = persona === key;
                return (
                  <span
                    key={key}
                    onClick={() => setPersona(key)}
                    onMouseEnter={() => setHoveredPersona(key)}
                    onMouseLeave={() => setHoveredPersona(null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, cursor: "pointer", color: active ? "#000" : meta.color, background: active ? meta.color : "transparent", border: `1px solid ${active ? meta.color : C.b3}`, borderRadius: 13, padding: "4px 10px" }}
                  >
                    <img src={meta.avatar} alt={meta.name} style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", border: `1px solid ${active ? "#000" : meta.color}` }} />@{meta.name}
                  </span>
                );
              })}
              {hoveredPersona && (() => {
                const meta = PERSONA_META[hoveredPersona];
                const caretLeft = hoveredPersona === "chris" ? 30 : hoveredPersona === "jerry" ? 95 : 157;
                return (
                  <div style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    marginBottom: 10,
                    width: 260,
                    background: "rgba(15, 15, 15, 0.98)",
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${meta.color === C.white ? "rgba(255, 255, 255, 0.2)" : meta.color + "40"}`,
                    borderRadius: 8,
                    padding: "12px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                    zIndex: 1000,
                    pointerEvents: "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <img src={meta.avatar} alt={meta.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: `1px solid ${meta.color}` }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>@{meta.name}</div>
                        <div style={{ fontSize: 9.5, color: "#888", fontFamily: FP }}>{meta.role}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.6, fontFamily: FP, fontWeight: 400, textAlign: "left", whiteSpace: "normal" }}>
                      {meta.desc}
                    </div>
                    <div style={{
                      position: "absolute",
                      bottom: -4,
                      left: caretLeft,
                      transform: "translateX(-50%) rotate(45deg)",
                      width: 8,
                      height: 8,
                      background: "rgba(15, 15, 15, 0.98)",
                      borderRight: `1px solid ${meta.color === C.white ? "rgba(255, 255, 255, 0.2)" : meta.color + "40"}`,
                      borderBottom: `1px solid ${meta.color === C.white ? "rgba(255, 255, 255, 0.2)" : meta.color + "40"}`,
                    }} />
                  </div>
                );
              })()}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.chip, border: `1px solid ${C.b4}`, borderRadius: 10, padding: "10px 12px" }}>
              <input
                ref={chatInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                disabled={running}
                placeholder={running ? "최적화 중… 잠시만 기다려 주세요" : chatBusy ? `${PERSONA_META[persona].name}이(가) 답변 중…` : `${PERSONA_META[persona].name}에게 질문하거나 시장 의견을 남겨보세요…`}
                style={{ flex: 1, fontSize: 12.5, color: "#eee", background: "transparent", border: "none", outline: "none", fontFamily: FP }}
              />
              <div onClick={sendChat} style={{ width: 28, height: 28, borderRadius: 7, background: draft.trim() && !running && !chatBusy ? "#fff" : "#333", display: "flex", alignItems: "center", justifyContent: "center", color: draft.trim() && !running && !chatBusy ? "#000" : "#777", fontSize: 13, cursor: draft.trim() && !running && !chatBusy ? "pointer" : "default", flex: "0 0 auto" }}>↑</div>
            </div>
          </div>
        </div>

        {/* RIGHT : results */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="etc-scroll" style={{ flex: "0 0 auto", padding: "0 22px", display: "flex", alignItems: "center", gap: 2, borderBottom: `1px solid ${C.b1}`, overflowX: "auto" }}>
            {TAB_GROUPS.map((group, gi) => (
              <React.Fragment key={group.label}>
                {gi > 0 && <span style={{ width: 1, height: 16, background: C.b3, flex: "0 0 auto", margin: "0 14px" }} />}
                <span style={{ fontSize: 8.5, fontFamily: FA, fontWeight: 700, letterSpacing: "1.5px", color: C.t5, flex: "0 0 auto", paddingRight: 2 }}>{group.label}</span>
                {group.tabs.map((label) => {
                  const active = tab === label;
                  return (
                    <span key={label} onClick={() => setTab(label)} style={{ fontSize: 12, fontFamily: FA, fontWeight: 600, letterSpacing: ".5px", padding: "14px 14px", cursor: "pointer", whiteSpace: "nowrap", color: active ? "#fff" : "#666", borderBottom: active ? "2px solid #fff" : "2px solid transparent" }}>{label}</span>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div className="etc-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 24px" }}>
            {tab === "배분" && (isNew && !hasRun ? <EmptyResults go={setTab} /> : <AllocationTab sim={sim} />)}
            {tab === "리스크" && (isNew && !hasRun ? <EmptyResults go={setTab} /> : <RiskTab sim={sim} />)}
            {tab === "프론티어" && (isNew && !hasRun ? <EmptyResults go={setTab} /> : <FrontierTab sim={sim} />)}
            {tab === "인텔리전스" && <IntelTab intel={intel} onOpen={openIntel} seenIds={seenIntel} onAttach={attachSource} onDelete={deleteIntel} onRefresh={refreshIntel} refreshing={refreshingIntel} progress={refreshProgress} notice={intelNotice} onIngestUrl={ingestUrl} onIngestPdf={ingestPdf} ingesting={ingesting} />}
            {tab === "매크로" && <MacroTab macro={macro} regime={regime} regimeLabel={regimeLabel} regimeColor={regimeColor} />}
            {tab === "리서치" && <ResearchTab queue={queue} theses={houseTheses} onCollect={runCollect} collecting={collecting} collectProgress={collectProgress} onBuild={buildTheses} building={buildingTheses} msg={researchMsg} onAttachThesis={attachThesis} onDeleteThesis={deleteThesis} onResetTheses={resetTheses} />}
            {tab === "리포트" && <ReportTab reports={reports} openReport={openReport} running={running} reportLoading={reportLoading} onOpen={openReportDetail} onBack={() => setOpenReport(null)} />}
            {tab === "가이드" && <GuideTab onNavigate={setTab} runSimulation={runSimulation} running={running} />}
            {tab === "설정" && <ConfigTab />}
          </div>
        </div>
      </div>
      {intelOpen && <IntelModal item={intelOpen} onClose={() => setIntelOpen(null)} onAttach={attachSource} onDelete={deleteIntel} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function IntelModal({ item, onClose, onAttach, onDelete }: { item: any; onClose: () => void; onAttach: (t: any) => void; onDelete: (id: string) => void }) {
  const fr = item.full_report || {};
  const link = fr.source_url || item.url || "";
  const conf = Math.round((item.ai_interpretation?.confidence ?? 0) * 100);
  const cat = item.category || "NEWS";
  const [tag, tagStyle] = INTEL_CAT[cat] || INTEL_CAT.NEWS;
  const assets: string[] = item.ai_interpretation?.impacted_assets || [];
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    children ? (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: C.t1 }}>{children}</div>
      </div>
    ) : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="etc-scroll" style={{ width: "100%", maxWidth: 720, maxHeight: "88vh", overflowY: "auto", background: "#0b0b0b", border: `1px solid ${C.b3}`, borderRadius: 14, padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <Tag kind={tag} style={tagStyle} />
          <span style={{ fontSize: 11, fontFamily: FM, color: conf >= 70 ? C.up : conf >= 60 ? C.amber : "#888" }}>신뢰도 {conf}%</span>
          <span onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", color: C.t4, fontSize: 20, lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ fontFamily: FA, fontWeight: 700, fontSize: 20, lineHeight: 1.35, marginBottom: 8 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: C.t4, marginBottom: 20 }}>{item.author}{item.author_title ? ` · ${item.author_title}` : ""} · {item.source}{item.date ? ` · ${String(item.date).slice(0, 10)}` : ""}</div>
        {fmtKST(item.created_at) && <div style={{ fontSize: 10.5, fontFamily: FM, color: C.t5, marginTop: -14, marginBottom: 20 }}>분석 발행 시각 · {fmtKST(item.created_at)}</div>}
        <Field label="AI 해석">{item.ai_interpretation?.summary}</Field>
        {assets.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {assets.map((a) => (<span key={a} style={{ fontSize: 10.5, fontFamily: FM, color: ASSET_HEX[a] || C.t2, border: `1px solid ${C.b4}`, padding: "4px 10px", borderRadius: 4 }}>{ASSET_KR[a] || a}</span>))}
          </div>
        )}
        <Field label="본문">{item.content}</Field>
        <Field label="핵심 논거">{fr.rationale}</Field>
        <Field label="권고">{fr.recommendation}</Field>
        <Field label="리스크 요인">{fr.risk_factors}</Field>
        <div style={{ display: "flex", gap: 9, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.b1}` }}>
          <button onClick={() => { onAttach(item); onClose(); }} style={{ flex: 1, fontFamily: FA, fontWeight: 700, fontSize: 12.5, letterSpacing: "1px", color: "#000", background: C.cyan, border: "none", padding: "12px", borderRadius: 8, cursor: "pointer" }}>+ 채팅에 추가</button>
          {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: FA, fontWeight: 600, fontSize: 12, letterSpacing: ".5px", color: "#ddd", border: `1px solid ${C.b4}`, padding: "12px 18px", borderRadius: 8, textDecoration: "none", display: "flex", alignItems: "center" }}>원문 열기 ↗</a>}
          <button onClick={() => onDelete(item.id)} title="이 소스 삭제" style={{ fontFamily: FA, fontWeight: 600, fontSize: 12, letterSpacing: ".5px", color: "#f87171", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", padding: "12px 18px", borderRadius: 8, cursor: "pointer" }}>✕ 삭제</button>
        </div>
      </div>
    </div>
  );
}
function VersionBadge() {
  const [v, setV] = useState<{ sha: string; branch: string; date: string; subject: string; dirty: boolean } | null>(null);
  useEffect(() => { fetch("/api/version").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => {}); }, []);
  if (!v?.sha) return null;
  const dot = v.dirty ? "#FBBF24" : "#34D399";
  return (
    <span
      title={`${v.branch}@${v.sha} · ${v.date}\n${v.subject}${v.dirty ? "\n⚠ uncommitted changes in working tree" : "\n✓ matches commit"}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: FM, letterSpacing: ".5px", color: "#999", border: `1px solid ${C.b4}`, padding: "4px 9px", borderRadius: 4, cursor: "default" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flex: "0 0 auto" }} />
      {v.branch} · {v.sha}{v.dirty ? "*" : ""}
    </span>
  );
}
// Right-edge slide-out changelog. The vertical tab is always visible; clicking it
// opens a drawer listing CHANGELOG newest-first. Append entries in the CHANGELOG
// constant above to "log a version".
function ChangelogDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Always-visible vertical tab on the right edge */}
      <button
        onClick={() => setOpen(true)}
        title="변경 이력 · Changelog"
        style={{
          position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 60,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
          background: C.panel2, color: "#bbb", border: `1px solid ${C.b4}`, borderRight: "none",
          borderRadius: "7px 0 0 7px", padding: "13px 7px", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 9, fontFamily: FM, fontWeight: 700, color: C.green, letterSpacing: ".5px" }}>v{APP_VERSION}</span>
        <span style={{ writingMode: "vertical-rl", fontSize: 9, fontFamily: FA, letterSpacing: "2px" }}>CHANGELOG</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 90 }} />
          <div className="etc-scroll" style={{
            position: "fixed", top: 0, right: 0, height: "100vh", width: 380, maxWidth: "92vw", zIndex: 100,
            background: C.bg, borderLeft: `1px solid ${C.b3}`, overflowY: "auto",
            animation: "slideInRight .2s ease", boxShadow: "-24px 0 48px rgba(0,0,0,.6)",
          }}>
            <div style={{ position: "sticky", top: 0, background: C.bg, borderBottom: `1px solid ${C.b2}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 11, fontFamily: FA, fontWeight: 700, letterSpacing: "2px", color: C.white }}>CHANGELOG</span>
                <span style={{ fontSize: 9, fontFamily: FM, color: C.t4 }}>변경 이력</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: `1px solid ${C.b4}`, borderRadius: 5, color: "#999", fontSize: 13, lineHeight: 1, width: 26, height: 26, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: "8px 20px 48px" }}>
              {CHANGELOG.map((e) => (
                <div key={e.version} style={{ padding: "18px 0", borderBottom: `1px solid ${C.b1}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontFamily: FM, fontWeight: 700, color: C.white }}>v{e.version}</span>
                    {e.current && (
                      <span style={{ fontSize: 8, fontFamily: FA, fontWeight: 700, letterSpacing: "1px", color: "#000", background: C.green, padding: "2px 6px", borderRadius: 3 }}>CURRENT</span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: FM, color: C.t4 }}>{e.date}</span>
                  </div>
                  <div style={{ fontSize: 11.5, fontFamily: FA, fontWeight: 600, letterSpacing: ".3px", color: C.t2, marginBottom: 11 }}>{e.title}</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {e.items.map((it, i) => (
                      <li key={i} style={{ display: "flex", gap: 9, fontSize: 12, lineHeight: 1.55, color: C.t3 }}>
                        <span style={{ flex: "0 0 auto", marginTop: 6, width: 4, height: 4, borderRadius: "50%", background: C.green }} />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
function EmptyResults({ go }: { go: (t: string) => void }) {
  return (
    <div style={{ minHeight: 460, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", border: `1px dashed ${C.b4}`, borderRadius: 12, background: C.card, padding: "48px 24px" }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", border: `1px solid ${C.b3}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t5, fontSize: 18 }}>◷</div>
      <div style={{ fontFamily: FA, fontWeight: 700, fontSize: 14, letterSpacing: ".5px" }}>아직 표시할 분석 결과가 없습니다</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: C.t3, maxWidth: 430 }}>왼쪽 하단에 시장에 대한 생각을 입력하면 최적 자산배분·리스크·프론티어·리포트가 여기에 나타납니다. 먼저 아래 탭에서 시장을 살펴보세요.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {[["매크로", "매크로 지표"], ["인텔리전스", "마켓 인텔리전스"], ["리서치", "리서치 파이프라인"]].map(([t, label]) => (
          <button key={t} onClick={() => go(t)} style={{ fontFamily: FA, fontWeight: 600, fontSize: 10, letterSpacing: "1px", color: "#bbb", background: "transparent", border: `1px solid ${C.b4}`, padding: "9px 14px", borderRadius: 7, cursor: "pointer" }}>{label} →</button>
        ))}
      </div>
    </div>
  );
}
function Avatar({ children, color, bg, border, small }: { children: React.ReactNode; color: string; bg?: string; border?: string; small?: boolean }) {
  return (
    <div style={{ flex: "0 0 30px", width: 30, height: 30, borderRadius: "50%", background: bg || "#0e0e0e", border: `1px solid ${border || "#2e2e2e"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FA, fontWeight: 700, fontSize: small ? 9 : 11, color }}>
      {children}
    </div>
  );
}

function Msg({ who, role, children, avatarColor, avatarBg, avatarBorder }: { who: string; role: string; children: React.ReactNode; avatarColor: string; avatarBg?: string; avatarBorder?: string }) {
  const nameKey = who.toLowerCase() as "chris" | "jerry" | "ben";
  const hasAvatar = nameKey in PERSONA_META;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {hasAvatar ? (
        <img
          src={PERSONA_META[nameKey].avatar}
          alt={who}
          style={{ flex: "0 0 30px", width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: `1px solid ${avatarBorder || avatarColor}` }}
        />
      ) : (
        <Avatar color={avatarColor} bg={avatarBg} border={avatarBorder}>{who[0]}</Avatar>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{who}</span>
          <span style={{ fontSize: 9, fontFamily: FA, letterSpacing: ".5px", color: C.t5 }}>{role}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: C.t1 }}>{children}</div>
      </div>
    </div>
  );
}

function DeskBtn({ children }: { children: React.ReactNode }) {
  return <button style={{ alignSelf: "flex-start", fontFamily: FA, fontWeight: 600, fontSize: 10, letterSpacing: "1px", background: "transparent", color: "#bbb", border: `1px solid ${C.b4}`, padding: "7px 12px", borderRadius: 6, cursor: "pointer", marginTop: 10, display: "block" }}>{children}</button>;
}

function SrcRow({ tag, text, score, sc, tagCyan }: { tag: string; text: string; score: string; sc: string; tagCyan?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.b5}`, borderRadius: 7, padding: "8px 10px" }}>
      <span style={{ fontSize: 7.5, fontFamily: FA, letterSpacing: ".5px", color: tagCyan ? "#000" : C.t3, background: tagCyan ? C.cyan : "transparent", border: tagCyan ? "none" : `1px solid ${C.b4}`, padding: "2px 5px", borderRadius: 3 }}>{tag}</span>
      <span style={{ flex: 1, fontSize: 11.5, color: C.t2 }}>{text}</span>
      <span style={{ fontSize: 10, fontFamily: FM, color: sc }}>{score}</span>
    </div>
  );
}

function BullBear({ kind, color, bg, bd, text }: { kind: string; color: string; bg: string; bd: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: bg, border: `1px solid ${bd}`, borderRadius: 7, padding: "8px 10px" }}>
      <span style={{ flex: "0 0 auto", fontSize: 8, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", color, marginTop: 1 }}>{kind}</span>
      <span style={{ fontSize: 11.5, lineHeight: 1.5, color: C.t2 }}>{text}</span>
    </div>
  );
}

function Chip({ tag, tagBg, text, val, conf }: { tag: string; tagBg: string; text: string; val: string; conf: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.card2, border: `1px solid ${C.b3}`, borderRadius: 8, padding: "7px 11px" }}>
      <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: ".5px", color: "#000", background: tagBg, padding: "2px 5px", borderRadius: 3, fontWeight: 700 }}>{tag}</span>
      <span style={{ fontSize: 12, color: "#eee" }}>{text}</span>
      <span style={{ fontFamily: FM, fontSize: 11, color: "#fff" }}>{val}</span>
      <span style={{ fontSize: 10, color: "#777", fontFamily: FM }}>{conf}</span>
      <span style={{ color: C.t6, fontSize: 12, cursor: "pointer" }}>✎</span>
    </div>
  );
}

function SignalCard({ idx, tag, tagBg, title, a, aCol, b, bCol, mid, val, conf, confCol, left, right }: { idx: string; tag: string; tagBg: string; title: string; a: string; aCol: string; b: string; bCol: string; mid: string; val: string; conf: number; confCol: string; left: string; right: string }) {
  return (
    <div style={{ background: C.chip, border: `1px solid #222`, borderRadius: 9, padding: 13, marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: "1px", color: "#000", background: tagBg, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>{tag}</span>
          <span style={{ fontSize: 12, color: "#eaeaea", fontWeight: 600 }}>{title}</span>
        </div>
        <span style={{ fontSize: 9.5, fontFamily: FM, color: C.t6 }}>{idx}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: aCol }} />{a}</span>
        <span style={{ color: mid === "▸" ? C.amber : "#666", fontSize: mid === "▸" ? 12 : 11 }}>{mid}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: mid === "▸" ? C.t3 : "#fff" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: bCol }} />{b}</span>
        <div style={{ marginLeft: "auto", display: "flex", border: `1px solid ${C.b4}`, borderRadius: 6, overflow: "hidden" }}>
          <span style={{ fontSize: 10, padding: "4px 8px", background: "#fff", color: "#000", fontWeight: 600 }}>{left}</span>
          <span style={{ fontSize: 10, padding: "4px 8px", color: "#666" }}>{right}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.b4}`, borderRadius: 6, padding: "3px 4px" }}>
          <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12, cursor: "pointer" }}>−</span>
          <span style={{ fontFamily: FM, fontSize: 11.5, color: "#fff", minWidth: 44, textAlign: "center" }}>{val}</span>
          <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12, cursor: "pointer" }}>+</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t5 }}><span>신뢰도</span><span style={{ color: "#fff", fontFamily: FM }}>{conf}%</span></div>
          <div style={{ height: 4, background: C.b5, borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: 4, width: `${conf}%`, background: confCol, borderRadius: 2 }} />
            <div style={{ position: "absolute", left: `${conf}%`, top: "50%", transform: "translate(-50%,-50%)", width: 11, height: 11, borderRadius: "50%", background: "#fff", border: `2px solid ${confCol}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ border: `1px solid ${C.b6}`, background: C.card, borderRadius: 10, padding: "18px 22px", ...style }}>{children}</div>;
}

// ── Map a /simulate result into the shapes each tab expects ──────────────────
const ASSET_ORDER = ["GLOBAL_STOCK", "KR_STOCK", "KR_BOND", "GLOBAL_BOND", "ALTERNATIVE"];
const ASSET_KR: Record<string, string> = { GLOBAL_STOCK: "해외주식", KR_STOCK: "국내주식", KR_BOND: "국내채권", GLOBAL_BOND: "해외채권", ALTERNATIVE: "대체투자" };
const r1 = (x: number) => Math.round((x || 0) * 1000) / 10;

function allocFromSim(sim: any) {
  const opt = sim?.optimized_weights, mkt = sim?.market_weights;
  if (!opt || !mkt) return null;
  return ASSET_ORDER.filter((a) => a in opt).map((a) => ({ name: ASSET_KR[a], color: ASSET_HEX[a] || C.violet, w: r1(opt[a]), d: r1((opt[a] || 0) - (mkt[a] || 0)), bench: r1(mkt[a]) }));
}
function attribFromSim(sim: any) {
  const va = sim?.view_attribution;
  if (!Array.isArray(va) || !va.length) return null;
  const by: Record<string, any> = {}; va.forEach((r: any) => (by[r.asset] = r));
  return ASSET_ORDER.filter((a) => by[a]).map((a) => {
    const r = by[a]; const dv = r.driving_views || []; const first = dv[0]; const d = r.delta_pp || 0;
    const srcs = first?.sources || [];
    return {
      name: ASSET_KR[a], color: ASSET_HEX[a] || C.violet,
      prior: `${(r.prior_return || 0).toFixed(2)}%`, post: `${(r.posterior_return || 0).toFixed(2)}%`,
      delta: Math.abs(d) < 0.005 ? "—" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`,
      dc: Math.abs(d) < 0.005 ? C.t6 : d > 0 ? C.up : C.red,
      why: first ? String(first.thesis || "적용된 뷰").slice(0, 64) : "시장 균형 유지 (적용된 뷰 없음)",
      src: srcs.length ? String(srcs[0]) : "", tag: "근거", tagDark: true,
    };
  });
}
// ── Conversation desk: derive the three analyst bubbles from the live run ────
// Ben (market intel): how many sources fed the run + the dominant view direction + source rows.
function benFromSim(sim: any, attached: any[], intel: any[], views: any[]) {
  if (!sim) return null;
  if (!views.length && !attached.length) return null;
  const cat = (x: any) => String(x?.category || "").toUpperCase();
  const newsN = intel.filter((x) => cat(x) === "NEWS").length;
  const resN = intel.filter((x) => cat(x) === "RESEARCH").length;
  const attN = attached.length;
  const mag = (v: any) => Math.abs((v.view_type === "relative" ? v.outperformance : v.expected_return) || 0) * (v.confidence || 0.5);
  const ranked = [...views].sort((a, b) => mag(b) - mag(a));
  const top = ranked[0];
  let dir: { asset: string; pos: boolean } | null = null;
  if (top) dir = top.view_type === "relative"
    ? { asset: ASSET_KR[top.asset1] || top.asset1, pos: (top.outperformance || 0) >= 0 }
    : { asset: ASSET_KR[top.asset] || top.asset, pos: (top.expected_return || 0) >= 0 };
  const rows: { tag: string; text: string; score: string; sc: string; tagCyan?: boolean }[] = [];
  attached.slice(0, 3).forEach((a) => {
    const c = cat(a); const conf = a.ai_interpretation?.confidence;
    rows.push({ tag: c === "RESEARCH" ? "리서치" : c === "NEWS" ? "뉴스" : "첨부", tagCyan: true, text: a.title || "첨부 자료", score: typeof conf === "number" ? `${Math.round(conf * 100)}%` : "참고", sc: "#888" });
  });
  for (const v of ranked) {
    if (rows.length >= 3) break;
    const m = (v.view_type === "relative" ? v.outperformance : v.expected_return) || 0;
    rows.push({ tag: "뷰", text: String(v.thesis || (v.sources || [])[0] || "추출된 투자 뷰").slice(0, 52), score: `${m >= 0 ? "+" : ""}${(m * 100).toFixed(1)}%`, sc: m >= 0 ? C.up : C.red });
  }
  return { newsN, resN, attN, dir, rows };
}
// Jerry (macro PM): bull thesis vs top risk → house view, straight from pm_memo.
function jerryFromSim(sim: any) {
  const pm = sim?.pm_memo;
  const thesis = pm?.investment_thesis_summary;
  if (!thesis || /disabled|API key|being integrated/i.test(thesis)) return null; // skip fallback sentinels → use mock
  const risks: string[] = Array.isArray(pm.key_risks_considered) ? pm.key_risks_considered : [];
  const sentiment = String(pm.macro_regime_sentiment || "NEUTRAL").toUpperCase();
  const sentLabel = sentiment === "RISK-OFF" ? "위험 회피 · RISK-OFF" : sentiment === "RISK-ON" ? "위험 선호 · RISK-ON" : "중립 · NEUTRAL";
  const sentColor = sentiment === "RISK-OFF" ? C.red : sentiment === "RISK-ON" ? C.up : C.amber;
  return { bull: thesis, bear: risks[0] || "추가 변동성 및 추정오차에 유의.", bear2: risks[1] || "", advice: pm.strategic_positioning_advice || "", sentLabel, sentColor };
}
// Chris (synthesis): one signal card per parsed view — the same data that drives the chips.
function chrisSignalsFromViews(views: any[]) {
  if (!views.length) return null;
  return views.slice(0, 4).map((v, i) => {
    const idx = `신호 ${String(i + 1).padStart(2, "0")}`;
    if (v.view_type === "relative") {
      const op = v.outperformance || 0; const pos = op >= 0;
      return { idx, tag: "REL", tagBg: C.violet, title: "상대 우위 뷰", a: ASSET_KR[v.asset1] || v.asset1, aCol: C.violet, b: ASSET_KR[v.asset2] || v.asset2, bCol: C.blue, mid: "▸", val: `${pos ? "+" : "−"}${Math.abs(op * 100).toFixed(1)}%`, conf: Math.round((v.confidence || 0) * 100), confCol: C.violet, left: pos ? "우위" : "열위", right: pos ? "열위" : "우위" };
    }
    const er = v.expected_return || 0; const pos = er >= 0;
    return { idx, tag: "ABS", tagBg: C.green, title: pos ? "절대 강세 뷰" : "절대 약세 뷰", a: ASSET_KR[v.asset] || v.asset, aCol: C.green2, b: pos ? "강세 전망" : "약세 전망", bCol: pos ? C.up : C.red, mid: "·", val: `${pos ? "+" : "−"}${Math.abs(er * 100).toFixed(1)}%`, conf: Math.round((v.confidence || 0) * 100), confCol: C.green, left: pos ? "강세" : "약세", right: pos ? "약세" : "강세" };
  });
}
function riskFromSim(sim: any): [string, string, string][] | null {
  const m = sim?.risk_metrics; if (!m) return null;
  const rf = sim.risk_free_rate || 0.035; const vol = m.volatility || 1e-6;
  const sharpe = ((m.expected_return || 0) - rf) / vol;
  const pct = (x: number) => `${((x || 0) * 100).toFixed(2)}%`;
  return [["기대수익률", pct(m.expected_return), C.white], ["변동성", pct(m.volatility), C.white], ["샤프 비율", sharpe.toFixed(2), C.white], ["95% VaR", pct(m.var_95), C.redL], ["95% CVaR", pct(m.cvar_95), C.redL], ["최대낙폭", pct(m.max_drawdown_estimate), C.redL]];
}
function devFromSim(sim: any) {
  const opt = sim?.optimized_weights, mkt = sim?.market_weights; if (!opt || !mkt) return null;
  return ASSET_ORDER.filter((a) => a in opt).map((a) => ({
    n: ASSET_KR[a], dpp: ((opt[a] || 0) - (mkt[a] || 0)) * 100,
  }));
}
function buildFrontier(sim: any) {
  const ef = sim?.efficient_frontier;
  if (!Array.isArray(ef) || ef.length < 2) return null;
  const bm = sim.benchmark_portfolio, op = sim.optimized_portfolio;
  const V = ef.map((p: any) => p.volatility), R = ef.map((p: any) => p.return);
  if (bm) { V.push(bm.volatility); R.push(bm.return); } if (op) { V.push(op.volatility); R.push(op.return); }
  const vMin = Math.min(...V), vMax = Math.max(...V), rMin = Math.min(...R), rMax = Math.max(...R);
  const sx = (v: number) => 38 + ((v - vMin) / ((vMax - vMin) || 1)) * (350 - 38);
  const sy = (r: number) => 200 - ((r - rMin) / ((rMax - rMin) || 1)) * (200 - 20);
  const path = ef.slice().sort((a: any, b: any) => a.volatility - b.volatility).map((p: any, i: number) => `${i ? "L" : "M"}${sx(p.volatility).toFixed(1)},${sy(p.return).toFixed(1)}`).join(" ");
  return { path, bm: bm ? { x: sx(bm.volatility), y: sy(bm.return) } : null, op: op ? { x: sx(op.volatility), y: sy(op.return) } : null };
}
function buildMC(sim: any) {
  const paths = sim?.risk_metrics?.simulation_paths;
  if (!Array.isArray(paths) || !paths.length || !Array.isArray(paths[0])) return null;
  const n = paths[0].length;
  const idx = [0, 1, 2, 3, 4, 5].map((k) => Math.floor((k / 5) * (paths.length - 1)));
  let maxAbs = 0.05;
  idx.forEach((i) => paths[i].forEach((v: number) => { maxAbs = Math.max(maxAbs, Math.abs(v)); }));
  const sx = (i: number) => 30 + (i / (n - 1)) * (350 - 30);
  const sy = (v: number) => Math.max(5, Math.min(225, 115 - (v / maxAbs) * 80));
  return idx.map((i) => paths[i].map((v: number, j: number) => `${j ? "L" : "M"}${sx(j).toFixed(1)},${sy(v).toFixed(1)}`).join(" "));
}

function AllocationTab({ sim }: { sim: any }) {
  const alloc = allocFromSim(sim) || ALLOC;
  const attrib = attribFromSim(sim) || ATTRIB;
  let cum = 0;
  const donut = alloc.map((a) => { const seg = { c: a.color, len: a.w, off: -cum }; cum += a.w; return seg; });
  const maxBar = 50;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* donut + legend */}
      <Card style={{ display: "flex", gap: 22, alignItems: "center", padding: "20px 24px" }}>
        <div style={{ flex: "0 0 auto", position: "relative", width: 166, height: 166 }}>
          <svg viewBox="0 0 42 42" style={{ width: 166, height: 166, transform: "rotate(-90deg)", animation: "donutIn .7s cubic-bezier(.2,.7,.2,1) both" }}>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#111" strokeWidth="5.4" />
            {donut.map((d, i) => (
              <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={d.c} strokeWidth="5.4" strokeDasharray={`${d.len} ${100 - d.len}`} strokeDashoffset={d.off} />
            ))}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5 }}>최적화</span>
            <span style={{ fontFamily: FA, fontSize: 14, fontWeight: 700 }}>5개 자산</span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {alloc.map((a) => (
            <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: "0 0 86px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ddd" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: a.color }} />{a.name}</span>
              <div style={{ flex: 1, height: 6, background: C.b1, borderRadius: 3, overflow: "hidden" }}><div style={{ height: 6, width: `${(a.w / maxBar) * 100}%`, background: a.color, transformOrigin: "left", animation: "growBar .6s ease both" }} /></div>
              <span style={{ flex: "0 0 90px", textAlign: "right", fontFamily: FM, fontSize: 12 }}>{a.w}% <span style={{ color: a.d >= 0 ? C.up : C.red, fontSize: 10 }}>{a.d >= 0 ? "▲" : "▼"}{Math.abs(a.d)}</span></span>
            </div>
          ))}
        </div>
      </Card>

      {/* grouped benchmark vs optimized */}
      <Card style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.b1}` }}>
          <span style={{ fontFamily: FA, fontWeight: 600, fontSize: 11, letterSpacing: "1.5px", color: "#bbb" }}>배분 비교 (벤치마크 vs 최적화)</span>
          <div style={{ display: "flex", gap: 14, fontSize: 9.5, fontFamily: FA, letterSpacing: "1px", color: "#666" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 6, background: "#404040", borderRadius: 1 }} />국민연금</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 6, background: "#fff", borderRadius: 1 }} />최적화</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: "0 0 30px", width: 30, height: 180, position: "relative" }}>
            {["50%", "40", "30", "20", "10", "0"].map((y, i) => (
              <span key={y} style={{ position: "absolute", right: 3, top: i * 36, transform: "translateY(-50%)", fontSize: 8, fontFamily: FM, color: C.t5 }}>{y}</span>
            ))}
          </div>
          <div style={{ flex: 1, height: 180, position: "relative" }}>
            {[0, 36, 72, 108, 144, 180].map((t) => (<div key={t} style={{ position: "absolute", left: 0, right: 0, top: t, height: 1, background: t === 180 ? "#262626" : "#141414" }} />))}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 26, padding: "0 6px" }}>
              {alloc.map((a) => (
                <div key={a.name} className="etc-bar" style={{ flex: 1, height: 180, display: "flex", alignItems: "flex-end", justifyContent: "center", position: "relative" }}>
                  <div className="etc-tip" style={{ opacity: 0, transition: "opacity .12s ease", pointerEvents: "none", position: "absolute", bottom: 158, left: "50%", transform: "translateX(-50%)", background: "#000", border: `1px solid ${C.b4}`, borderRadius: 6, padding: "6px 9px", fontSize: 10, fontFamily: FM, whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,.5)" }}>
                    <span style={{ color: "#888" }}>벤치</span> {a.bench}% <span style={{ color: C.t6 }}>→</span> <span style={{ color: "#fff" }}>{a.w}%</span> <span style={{ color: a.d >= 0 ? C.up : C.red }}>{a.d >= 0 ? "▲" : "▼"}{Math.abs(a.d)}</span>
                  </div>
                  <div className="etc-fill" style={{ width: "100%", display: "flex", gap: 5, alignItems: "flex-end", height: 180, transformOrigin: "bottom", animation: "growUp .7s cubic-bezier(.2,.7,.2,1) both" }}>
                    <div style={{ flex: 1, background: "#404040", height: (a.bench / maxBar) * 180 }} />
                    <div style={{ flex: 1, background: a.color, height: (a.w / maxBar) * 180 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 26, padding: "8px 6px 0", marginLeft: 38 }}>
          {alloc.map((a) => (<span key={a.name} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#aaa" }}>{a.name}</span>))}
        </div>
      </Card>

      {/* BL attribution */}
      <Card style={{ padding: "18px 22px" }}>
        <div style={{ fontFamily: FA, fontWeight: 600, fontSize: 11, letterSpacing: "1.5px", color: "#bbb", marginBottom: 14 }}>BL 기대수익률 산출 근거 (Prior → Posterior)</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 64px 1fr", gap: "0 14px", fontSize: 9, fontFamily: FA, letterSpacing: "1px", color: C.t5, paddingBottom: 9, borderBottom: `1px solid ${C.b1}` }}>
          <span>자산</span><span style={{ textAlign: "right" }}>PRIOR</span><span style={{ textAlign: "right" }}>POST</span><span style={{ textAlign: "right" }}>Δ</span><span style={{ paddingLeft: 6 }}>뷰 근거</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 64px 1fr", gap: "15px 14px", alignItems: "start", fontSize: 11.5, paddingTop: 11 }}>
          {attrib.map((r: any) => (
            <React.Fragment key={r.name}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#ddd", paddingTop: 1 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: r.color, flex: "0 0 auto" }} />{r.name}</span>
              <span style={{ textAlign: "right", fontFamily: FM, color: "#999", paddingTop: 1 }}>{r.prior}</span>
              <span style={{ textAlign: "right", fontFamily: FM, color: r.delta === "—" ? "#999" : "#fff", paddingTop: 1 }}>{r.post}</span>
              <span style={{ textAlign: "right", fontFamily: FM, color: r.dc, paddingTop: 1 }}>{r.delta}</span>
              <span style={{ paddingLeft: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: r.src ? "#9a9a9a" : "#666" }}>{r.why}</span>
                {r.src ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.cyan, cursor: "pointer" }}>
                    <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: ".5px", color: r.tagDark ? "#fff" : "#000", background: r.tagDark ? "transparent" : "#fff", border: r.tagDark ? "1px solid #333" : "none", padding: "1px 4px", borderRadius: 2, fontWeight: 700 }}>{r.tag}</span>
                    {r.src}
                  </span>
                ) : (<span style={{ fontSize: 10, color: "#4a4a4a" }}>기여 소스 없음</span>)}
              </span>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RiskTab({ sim }: { sim: any }) {
  const risk = riskFromSim(sim) || RISK;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 1, background: C.b1, border: `1px solid ${C.b6}`, borderRadius: 8, overflow: "hidden" }}>
        {risk.map(([label, val, col]) => (
          <div key={label} style={{ background: C.card, padding: "15px 13px", display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t5 }}>{label}</span>
            <span style={{ fontFamily: FP, fontSize: 18, fontWeight: 700, color: col }}>{val}</span>
          </div>
        ))}
      </div>
      <Card>
        <div style={{ fontFamily: FA, fontWeight: 600, fontSize: 11, letterSpacing: "1.5px", color: "#bbb", marginBottom: 6 }}>몬테카를로 · 역사적 스트레스</div>
        <p style={{ fontSize: 12, lineHeight: 1.7, color: C.t3 }}>10,000회 몬테카를로 경로와 역사적 위기 시나리오(GFC·코로나·2022 금리인상)를 적용한 분포·낙폭 차트가 이 자리에 들어갑니다. 다음 단계에서 <span style={{ color: "#fff" }}>/simulate · /stress-test</span> 엔드포인트와 recharts로 연결합니다.</p>
      </Card>
    </div>
  );
}

function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontFamily: FA, fontWeight: 600, fontSize: 11, letterSpacing: "1.5px", color: "#bbb" }}>{children}</span>
      {right && <span style={{ fontSize: 9, fontFamily: FM, color: C.t6 }}>{right}</span>}
    </div>
  );
}

const DEV_MOCK = [
  { n: "해외주식", dpp: 4.8 },
  { n: "국내주식", dpp: -3.6 },
  { n: "국내채권", dpp: 1.4 },
  { n: "해외채권", dpp: 1.7 },
  { n: "대체투자", dpp: -4.3 },
];

function FrontierTab({ sim }: { sim: any }) {
  const DEV = devFromSim(sim) || DEV_MOCK;
  const fr = buildFrontier(sim);
  const mc = buildMC(sim);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardTitle right="위험 vs 수익">효율적 프론티어</CardTitle>
          <svg viewBox="0 0 360 230" style={{ width: "100%", height: 230 }}>
            <line x1="38" y1="12" x2="38" y2="200" stroke="#1d1d1d" strokeWidth="1" />
            <line x1="38" y1="200" x2="350" y2="200" stroke="#1d1d1d" strokeWidth="1" />
            {fr ? (
              <>
                <path d={fr.path} fill="none" stroke="#525252" strokeWidth="1.6" />
                {fr.bm && <><circle cx={fr.bm.x} cy={fr.bm.y} r="5" fill="#8a8a8f" /><text x={fr.bm.x + 9} y={fr.bm.y + 4} fill="#888" fontSize="9" fontFamily="Pretendard">벤치마크</text></>}
                {fr.op && <><path d={`M${fr.op.x},${fr.op.y - 6} l7,12 l-14,0 z`} fill="#fff" /><text x={fr.op.x - 16} y={fr.op.y - 10} fill="#fff" fontSize="9" fontFamily="Pretendard">최적화</text></>}
              </>
            ) : (
              <>
                <path d="M60,180 C140,90 250,55 340,40" fill="none" stroke="#525252" strokeWidth="1.6" />
                <circle cx="172" cy="118" r="5" fill="#8a8a8f" /><text x="182" y="122" fill="#888" fontSize="9" fontFamily="Pretendard">벤치마크</text>
                <path d="M236,72 l7,12 l-14,0 z" fill="#fff" /><text x="220" y="64" fill="#fff" fontSize="9" fontFamily="Pretendard">최적화</text>
              </>
            )}
            <text x="300" y="216" fill="#555" fontSize="9" fontFamily="Pretendard">변동성 →</text>
            <text x="6" y="20" fill="#555" fontSize="9" fontFamily="Pretendard">수익</text>
          </svg>
        </Card>
        <Card>
          <CardTitle right="15개 샘플">몬테카를로 드리프트 경로</CardTitle>
          <svg viewBox="0 0 360 230" style={{ width: "100%", height: 230 }}>
            <line x1="30" y1="115" x2="350" y2="115" stroke="#161616" strokeWidth="1" strokeDasharray="3 3" />
            {mc ? (
              mc.map((d, i) => (<path key={i} d={d} fill="none" stroke={`rgba(255,255,255,${[1, 0.4, 0.28, 0.22, 0.18, 0.14][i] ?? 0.2})`} strokeWidth={i === 0 ? 1.4 : 1} />))
            ) : (
              <>
                <path d="M30,115 C110,100 200,70 350,34" fill="none" stroke="#fff" strokeWidth="1.4" />
                <path d="M30,115 C110,108 200,92 350,66" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <path d="M30,115 C110,112 200,104 350,90" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
                <path d="M30,115 C110,120 200,118 350,108" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                <path d="M30,115 C110,126 200,138 350,156" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                <path d="M30,115 C110,134 200,160 350,194" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
              </>
            )}
            <text x="280" y="218" fill="#555" fontSize="9" fontFamily="Pretendard">252 거래일 →</text>
          </svg>
        </Card>
      </div>
      <Card>
        <CardTitle right="시장 비중 대비 ± 퍼센트포인트">BL 가중치 시장 편차 (pp)</CardTitle>
        {(() => {
          const PLOT = 150, HALF = PLOT / 2, W = 34;
          const MAXBAR = HALF - 24; // leave headroom for the value label above the bar tip
          const maxDev = Math.max(1, ...DEV.map((d) => Math.abs(d.dpp)));
          return (
            <div>
              <div style={{ position: "relative", height: PLOT, display: "flex", gap: 26, padding: "0 8px" }}>
                {/* zero baseline = market weight */}
                <div style={{ position: "absolute", left: 8, right: 8, top: HALF, height: 1, background: "#2c2c2c" }} />
                <span style={{ position: "absolute", left: 8, top: HALF - 13, fontSize: 8, fontFamily: FA, letterSpacing: ".5px", color: C.t5 }}>시장 비중</span>
                {DEV.map((d) => {
                  const up = d.dpp >= 0;
                  const col = up ? C.up : C.red;
                  const h = Math.max(2, (Math.abs(d.dpp) / maxDev) * MAXBAR);
                  return (
                    <div key={d.n} style={{ flex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: W, background: col, borderRadius: 2, height: h, transformOrigin: up ? "bottom" : "top", animation: "growUp .6s cubic-bezier(.2,.7,.2,1) both", ...(up ? { bottom: HALF } : { top: HALF }) }} />
                      <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 10.5, fontFamily: FM, fontWeight: 600, color: col, ...(up ? { bottom: HALF + h + 3 } : { top: HALF + h + 3 }) }}>{up ? "+" : "−"}{Math.abs(d.dpp).toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 26, padding: "9px 8px 0" }}>
                {DEV.map((d) => (<span key={d.n} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#aaa" }}>{d.n}</span>))}
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

const INTEL_CARDS = [
  { tag: "리서치", tagStyle: "fill", conf: "신뢰도 74%", cc: C.up, title: "미 연준, 2026 금리 인하 사이클 진입 전망", body: "AI 해석: 듀레이션 우호적 — 해외채권·국내채권 비중 확대 신호. 위험자산에도 점진적 우호.", src: "NPS 하우스뷰", action: "시뮬에 포함", actGreen: true, border: C.b5 },
  { tag: "뉴스", tagStyle: "outline", conf: "신뢰도 68%", cc: C.up, title: "엔비디아 실적 서프라이즈 — AI 설비투자 지속", body: "AI 해석: 글로벌 성장주 모멘텀 지속 → 해외주식 강세 근거 강화.", src: "Reuters", action: "시뮬에 포함", actGreen: true, border: C.b5 },
  { tag: "내 자산", tagStyle: "cyan", conf: "신뢰도 55%", cc: "#888", title: "KB증권 2026 자산시장 전망.pdf", body: "AI 해석: 국내주식 중립, 밸류에이션 부담 vs 정책 기대 혼재. 직접 업로드한 자료.", src: "회원 업로드 · PDF", action: "도크에 추가", actGreen: false, border: "rgba(34,211,238,.3)" },
  { tag: "뉴스", tagStyle: "outline", conf: "신뢰도 61%", cc: C.amber, title: "원/달러 1,380원 돌파 — 환헤지 비용 상승", body: "AI 해석: 해외주식 환위험 요인 — 강세 뷰의 상단을 일부 제한.", src: "연합인포맥스", action: "도크에 추가", actGreen: false, border: C.b5 },
];

function Tag({ kind, style }: { kind: string; style: string }) {
  const base = { fontSize: 8, fontFamily: FA, letterSpacing: "1px", padding: "2px 6px", borderRadius: 3, fontWeight: 700 } as React.CSSProperties;
  if (style === "fill") return <span style={{ ...base, color: "#000", background: "#fff" }}>{kind}</span>;
  if (style === "cyan") return <span style={{ ...base, color: "#000", background: C.cyan }}>{kind}</span>;
  return <span style={{ ...base, color: "#fff", border: "1px solid #333" }}>{kind}</span>;
}

const INTEL_CAT: Record<string, [string, string]> = { RESEARCH: ["리서치", "fill"], NEWS: ["뉴스", "outline"], USER_ASSET: ["내 자산", "cyan"] };

function IntelTab({ intel, onOpen, seenIds, onAttach, onDelete, onRefresh, refreshing, progress, notice, onIngestUrl, onIngestPdf, ingesting }: {
  intel: any[]; onOpen: (t: any) => void; seenIds: Set<string>; onAttach: (t: any) => void; onDelete: (id: string) => void; onRefresh: () => void; refreshing: boolean;
  progress: { phase: string; items: string[] } | null; notice?: string; onIngestUrl: (u: string) => void; onIngestPdf: (f: File) => void; ingesting: boolean;
}) {
  const [urlText, setUrlText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [progress]);
  const cards = (intel && intel.length)
    ? intel.slice(0, 12).map((t) => {
        const cat = t.category || "NEWS";
        const [tag, tagStyle] = INTEL_CAT[cat] || INTEL_CAT.NEWS;
        const conf = Math.round((t.ai_interpretation?.confidence ?? 0.6) * 100);
        const cc = conf >= 70 ? C.up : conf >= 60 ? C.amber : "#888";
        const isAsset = cat === "USER_ASSET";
        return {
          tag, tagStyle, conf: `신뢰도 ${conf}%`, cc,
          date: t.date ? String(t.date).slice(0, 10) : "",
          released: fmtKST(t.created_at),                 // when the AI released this analysis (KST)
          isNew: !!t.id && !seenIds.has(t.id),            // unopened by this user
          assets: (t.ai_interpretation?.impacted_assets || []) as string[],
          title: t.title || "(제목 없음)",
          body: `${t.ai_interpretation?.summary || t.content || ""}`.slice(0, 165),
          src: t.author || t.source || "출처 미상",
          border: isAsset ? "rgba(34,211,238,.3)" : C.b5,
          raw: t as any,
        };
      })
    : INTEL_CARDS.map((c) => ({ ...c, date: "2026-06-28", released: "", isNew: false, assets: [] as string[], raw: null as any }));
  const submitUrl = () => { if (urlText.trim()) { onIngestUrl(urlText); setUrlText(""); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
          <span style={{ fontFamily: FA, fontWeight: 700, fontSize: 16, letterSpacing: ".5px" }}>마켓 인텔리전스</span>
          <span style={{ fontSize: 11.5, color: "#666" }}>Ben · 큐레이션{intel?.length ? ` · ${intel.length}건` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["전체", "주식", "채권", "대체", "경제"].map((f, i) => (
              <span key={f} style={{ fontSize: 10, fontFamily: FA, letterSpacing: "1px", color: i === 0 ? "#000" : "#999", background: i === 0 ? "#fff" : "transparent", border: i === 0 ? "none" : `1px solid ${C.b4}`, padding: "5px 10px", borderRadius: 5 }}>{f}</span>
            ))}
          </div>
          <button onClick={onRefresh} disabled={refreshing} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", color: refreshing ? C.t5 : "#000", background: refreshing ? C.b3 : C.green, border: "none", padding: "7px 12px", borderRadius: 5, cursor: refreshing ? "wait" : "pointer" }}>{refreshing ? "새로고침 중…" : "↻ 뉴스 새로고침"}</button>
        </div>
      </div>

      {/* 내 자료 첨부 — link/PDF ingestion, moved to top & functional */}
      <div style={{ border: `1px dashed ${C.b4}`, background: C.panel2, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: C.t2, flex: "0 0 auto", fontWeight: 600 }}>📎 내 자료 첨부</span>
        <input
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitUrl(); }}
          disabled={ingesting}
          placeholder="기사·리포트 링크를 붙여넣으면 Ben이 분석해 인텔로 추가합니다"
          style={{ flex: 1, minWidth: 220, fontSize: 12, color: "#eee", background: C.bg, border: `1px solid ${C.b3}`, borderRadius: 7, padding: "8px 11px", outline: "none", fontFamily: FP }}
        />
        <button onClick={submitUrl} disabled={ingesting || !urlText.trim()} style={{ fontSize: 10, fontFamily: FA, fontWeight: 600, letterSpacing: ".5px", color: "#bbb", background: "transparent", border: `1px solid ${C.b4}`, padding: "8px 13px", borderRadius: 7, cursor: ingesting ? "wait" : "pointer", opacity: !urlText.trim() && !ingesting ? 0.5 : 1 }}>{ingesting ? "분석 중…" : "링크 분석"}</button>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onIngestPdf(f); e.currentTarget.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={ingesting} style={{ fontSize: 10, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", color: "#000", background: "#fff", padding: "8px 13px", borderRadius: 7, border: "none", cursor: ingesting ? "wait" : "pointer" }}>PDF 업로드</button>
      </div>

      {/* result/error notice from the last refresh — never fail silently */}
      {!refreshing && notice && (
        <div style={{ border: `1px solid ${notice.startsWith("⚠") ? C.red : C.b3}`, background: notice.startsWith("⚠") ? "rgba(255,80,0,.10)" : C.panel2, color: notice.startsWith("⚠") ? "#ffb088" : C.t2, borderRadius: 8, padding: "9px 13px", fontSize: 11.5, fontFamily: FM }}>{notice}</div>
      )}

      {/* progress log during refresh, else the cards */}
      {refreshing && progress ? (
        <div style={{ border: `1px solid ${C.b3}`, background: "#050505", borderRadius: 10, overflow: "hidden", minHeight: 340 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${C.b1}` }}>
            <span style={{ position: "relative", width: 8, height: 8 }}><span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, animation: "pulseDot 1.4s infinite" }} /></span>
            <span style={{ fontFamily: FA, fontSize: 10, letterSpacing: "1.5px", color: "#cfcfcf" }}>마켓 인텔리전스 새로고침 중</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.green, fontFamily: FM }}>{progress.phase}</span>
          </div>
          <div ref={logRef} className="etc-scroll" style={{ padding: "12px 15px", fontFamily: FM, fontSize: 11.5, lineHeight: 1.85, maxHeight: 440, overflowY: "auto" }}>
            {progress.items.length === 0
              ? <span style={{ color: C.t5 }}>피드를 불러오는 중…</span>
              : progress.items.map((it, i) => (<div key={i} style={{ color: it.startsWith("✓") ? C.up : it.startsWith("⬡") ? C.cyan : "#8f8f8f" }}>{it}</div>))}
            <span style={{ display: "inline-block", width: 7, height: 13, background: C.green, animation: "blink 1s step-end infinite", verticalAlign: -2 }} />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {cards.map((c, i) => (
            <div
              key={i}
              draggable={!!c.raw}
              onDragStart={(e) => { if (c.raw) { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", c.raw.id); } }}
              onClick={() => c.raw && onOpen(c.raw)}
              title={c.raw ? "클릭: 상세 보기 · 드래그: 채팅에 추가" : undefined}
              style={{ border: `1px solid ${c.isNew ? C.green : c.border}`, borderLeft: c.isNew ? `3px solid ${C.green}` : `1px solid ${c.border}`, background: C.card, borderRadius: 9, padding: 16, cursor: c.raw ? "pointer" : "default", transition: "border-color .12s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <Tag kind={c.tag} style={c.tagStyle} />
                {c.isNew && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8, fontFamily: FA, fontWeight: 700, letterSpacing: "1px", color: "#000", background: C.green, padding: "2px 6px", borderRadius: 3 }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#000" }} />NEW
                  </span>
                )}
                {(c.released || c.date) && <span style={{ fontSize: 9.5, fontFamily: FM, color: C.t5 }}>{c.released || c.date}</span>}
                <span style={{ fontSize: 10, fontFamily: FM, color: c.cc, marginLeft: "auto" }}>{c.conf}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.45, marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#9a9a9a", marginBottom: 11 }}>{c.body}</div>
              {c.assets.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 11 }}>
                  {c.assets.slice(0, 4).map((a) => (<span key={a} style={{ fontSize: 9, fontFamily: FM, color: ASSET_HEX[a] || C.t3, border: `1px solid ${C.b4}`, padding: "2px 7px", borderRadius: 4 }}>{ASSET_KR[a] || a}</span>))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 10, color: "#777", fontFamily: FM }}>{c.src}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); if (c.raw) onAttach(c.raw); }}
                  style={{ marginLeft: "auto", fontSize: 10, fontFamily: FA, letterSpacing: ".5px", color: C.cyan, border: "1px solid rgba(34,211,238,.3)", background: "rgba(34,211,238,.08)", padding: "4px 9px", borderRadius: 4, cursor: c.raw ? "pointer" : "default" }}
                >+ 채팅에 추가</span>
                {c.raw && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onDelete(c.raw.id); }}
                    title="이 소스 삭제"
                    style={{ fontSize: 10, fontFamily: FA, letterSpacing: ".5px", color: "#b15", border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", padding: "4px 9px", borderRadius: 4, cursor: "pointer" }}
                  >✕ 삭제</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MacroTab helpers & constants ─────────────────────────────────────────────

const MACRO_IND = [
  ["US 10Y", "4.18%", "▼", C.up], ["DXY", "104.2", "▲", C.red], ["USD/KRW", "1,382", "▲", C.red], ["WTI", "$71.3", "▼", C.up],
  ["GOLD", "$2,340", "▲", C.red], ["KOSPI", "2,610", "▼", C.red], ["S&P 500", "5,420", "▲", C.up], ["NASDAQ", "17,330", "▲", C.up],
  ["VIX", "23.4", "▲", C.red], ["MOVE", "115", "▲", C.red],
];
const HEAT_LABELS = ["국내株", "해외株", "국내債", "해외債", "대체"];
const HEAT: [string, string, string][][] = [
  [["1.00", "#171717", "#fff"], [".72", "rgba(16,185,129,.50)", "#fff"], ["-.18", "rgba(239,68,68,.13)", "#fca5a5"], ["-.05", "rgba(239,68,68,.04)", "#fca5a5"], [".41", "rgba(16,185,129,.29)", "#a7f3d0"]],
  [[".72", "rgba(16,185,129,.50)", "#fff"], ["1.00", "#171717", "#fff"], ["-.22", "rgba(239,68,68,.15)", "#fca5a5"], ["-.12", "rgba(239,68,68,.08)", "#fca5a5"], [".55", "rgba(16,185,129,.39)", "#fff"]],
  [["-.18", "rgba(239,68,68,.13)", "#fca5a5"], ["-.22", "rgba(239,68,68,.15)", "#fca5a5"], ["1.00", "#171717", "#fff"], [".63", "rgba(16,185,129,.44)", "#fff"], [".08", "rgba(16,185,129,.06)", "#a7f3d0"]],
  [["-.05", "rgba(239,68,68,.04)", "#fca5a5"], ["-.12", "rgba(239,68,68,.08)", "#fca5a5"], [".63", "rgba(16,185,129,.44)", "#fff"], ["1.00", "#171717", "#fff"], [".15", "rgba(16,185,129,.11)", "#a7f3d0"]],
  [[".41", "rgba(16,185,129,.29)", "#a7f3d0"], [".55", "rgba(16,185,129,.39)", "#fff"], [".08", "rgba(16,185,129,.06)", "#a7f3d0"], [".15", "rgba(16,185,129,.11)", "#a7f3d0"], ["1.00", "#171717", "#fff"]],
];

const REGIME_DESC: Record<string, string> = {
  CRISIS: "RISK-OFF · 주식 비중 대폭 축소", ELEVATED_RISK: "RISK-OFF · 주식 비중 확대에 신중",
  NORMAL: "NEUTRAL · 균형 배분", LOW_VOL: "RISK-ON · 위험자산 비중 확대 여지",
};
const MACRO_IND_SPEC: [string, string][] = [
  ["US 10Y", "US10Y"], ["DXY", "DXY"], ["USD/KRW", "USD_KRW"], ["WTI", "WTI"],
  ["GOLD", "GOLD"], ["KOSPI", "KOSPI"], ["S&P 500", "SPY"], ["NASDAQ", "QQQ"],
  ["VIX", "VIX"], ["채권변동성", "MOVE"],
];
const HEAT_PROXY: [string, string][] = [["국내株", "KOSPI"], ["해외株", "SPY"], ["국내債", "US10Y"], ["해외債", "HYG"], ["대체", "GOLD"]];

function heatCell(v: number): [string, string, string] {
  const s = v >= 0.999 ? "1.00" : v.toFixed(2).replace(/^(-?)0\./, "$1.");
  if (v >= 0.999) return [s, "#171717", "#fff"];
  const a = Math.min(0.5, Math.abs(v) * 0.55 + 0.04);
  if (v >= 0) return [s, `rgba(16,185,129,${a.toFixed(2)})`, v > 0.45 ? "#fff" : "#a7f3d0"];
  return [s, `rgba(239,68,68,${a.toFixed(2)})`, "#fca5a5"];
}

function Sparkline({ history, color, w = 60, h = 24 }: { history?: Array<{ date: string; value: number }>; color?: string; w?: number; h?: number }) {
  if (!history || history.length < 3) return <span style={{ display: "inline-block", width: w, height: h }} />;
  const vals = history.slice(-30).map(p => p.value);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const tx = (i: number) => (i / (vals.length - 1)) * w;
  const ty = (v: number) => h - 2 - ((v - mn) / rng) * (h - 4);
  const pts = vals.map((v, i) => `${tx(i)},${ty(v)}`).join(" ");
  const trend = vals[vals.length - 1] >= vals[0];
  const stroke = color || (trend ? C.up : C.red);
  const lx = tx(vals.length - 1), ly = ty(vals[vals.length - 1]);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={1.8} fill={stroke} />
    </svg>
  );
}

function YieldCurveChart({ macro }: { macro: any }) {
  const curvePts = [
    { label: "3M", key: "US3M" },
    { label: "5Y", key: "US5Y" },
    { label: "10Y", key: "US10Y" },
    { label: "30Y", key: "US30Y" },
  ].map(p => ({ label: p.label, rate: macro?.[p.key]?.current as number | undefined }))
   .filter((p): p is { label: string; rate: number } => p.rate != null);

  const useFallback = curvePts.length < 2;
  const pts = useFallback
    ? [{ label: "3M", rate: 5.27 }, { label: "5Y", rate: 4.21 }, { label: "10Y", rate: 4.18 }, { label: "30Y", rate: 4.41 }]
    : curvePts;

  const W = 420, H = 190, PL = 42, PR = 14, PT = 20, PB = 34;
  const iW = W - PL - PR, iH = H - PT - PB;
  const rates = pts.map(p => p.rate);
  const mn = Math.min(...rates) - 0.15, mx = Math.max(...rates) + 0.15, rng = mx - mn || 1;
  const tx = (i: number) => PL + (i / (pts.length - 1)) * iW;
  const ty = (r: number) => PT + iH - ((r - mn) / rng) * iH;
  const inverted = pts[0]?.rate != null && pts.find(p => p.label === "10Y") != null
    ? pts[0].rate > (pts.find(p => p.label === "10Y")!.rate)
    : false;
  const col = inverted ? C.red : C.green;
  const pathStr = pts.map((p, i) => `${tx(i)},${ty(p.rate)}`).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5 }}>미국 국채 수익률 곡선</span>
        {inverted && <span style={{ fontSize: 8, fontFamily: FA, color: C.red, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)", padding: "2px 7px", borderRadius: 3, letterSpacing: ".5px" }}>역전 · 침체 경보</span>}
        {!useFallback && <span style={{ fontSize: 8, fontFamily: FM, color: C.t5, marginLeft: "auto" }}>실시간</span>}
        {useFallback && <span style={{ fontSize: 8, fontFamily: FM, color: C.t5, marginLeft: "auto" }}>예시</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", flex: 1, minHeight: 0 }}>
        {[mn + rng * 0.1, mn + rng * 0.5, mn + rng * 0.9].map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={ty(v)} x2={W - PR} y2={ty(v)} stroke="#1c1c1c" strokeWidth={1} />
            <text x={PL - 5} y={ty(v) + 3.5} fill="#444" fontSize={9} textAnchor="end" fontFamily={FM}>{v.toFixed(1)}</text>
          </g>
        ))}
        <polygon points={`${tx(0)},${PT + iH} ${pathStr} ${tx(pts.length - 1)},${PT + iH}`} fill={col} fillOpacity={0.08} />
        <polyline points={pathStr} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.label}>
            <circle cx={tx(i)} cy={ty(p.rate)} r={4} fill={col} />
            <text x={tx(i)} y={ty(p.rate) - 9} fill={col} fontSize={10} textAnchor="middle" fontFamily={FM}>{p.rate.toFixed(2)}</text>
            <text x={tx(i)} y={H - 8} fill="#555" fontSize={10} textAnchor="middle" fontFamily={FM}>{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const REGIME_ORDER_LIST = ["LOW_VOL", "NORMAL", "ELEVATED_RISK", "CRISIS"] as const;
const REGIME_COLORS_SEQ = [C.green, "#cfcfcf", C.amber, C.red];
const REGIME_KR_SHORT: Record<string, string> = { LOW_VOL: "저위험", NORMAL: "정상", ELEVATED_RISK: "위험 고조", CRISIS: "위기" };

function MacroTab({ macro, regime, regimeLabel, regimeColor }: { macro: any; regime: string; regimeLabel: string; regimeColor: string }) {
  const vix = macro?.VIX;
  const yieldSpread = macro?.YIELD_SPREAD;

  const regimeCards = [
    { l: "감지된 시장 레짐", v: macro ? regimeLabel : "위험 고조", vc: macro ? regimeColor : C.amber, d: REGIME_DESC[regime] || "RISK-OFF · 주식 비중 확대에 신중" },
    { l: "VIX 변동성", v: vix ? String(vix.current) : "23.4", vc: C.white, arrow: vix ? (vix.change_1d >= 0 ? "▲" : "▼") : "▲", ac: vix ? (vix.change_1d >= 0 ? C.red : C.up) : C.red, d: vix?.change_1d != null ? `1일 ${vix.change_1d >= 0 ? "+" : ""}${vix.change_1d.toFixed(2)}%` : "장기 평균 상회" },
    { l: "위험회피 배율 λ", v: REGIME_LAMBDA[regime] || "1.25×", vc: C.white, d: "방어적 배분으로 상향" },
  ];

  const regimeIdx = REGIME_ORDER_LIST.indexOf(regime as typeof REGIME_ORDER_LIST[number]);

  const indCells = macro
    ? MACRO_IND_SPEC.flatMap(([label, key]) => {
        const d = macro[key];
        if (!d || typeof d.current !== "number") return [];
        const up = (d.change_1d ?? 0) >= 0;
        return [{ label, value: fmtQuote(key, d.current), up, change1d: d.change_1d ?? 0, history: d.history as Array<{ date: string; value: number }> | undefined }];
      })
    : (MACRO_IND as [string, string, string, string][]).map(([l, v, a]) => ({ label: l, value: v, up: a === "▲", change1d: 0, history: undefined as undefined }));

  const sentimentPulse: Array<{ label: string; sub: string; raw: number | undefined; fmt: (v: number) => string; tag: (v: number) => [string, string]; fallback: string }> = [
    { label: "VIX 지수", sub: "주식 내재변동성", raw: vix?.current, fmt: (v) => v.toFixed(1), tag: (v) => v > 30 ? ["위기", C.red] : v > 20 ? ["경계", C.amber] : v > 13 ? ["정상", C.t3] : ["안정", C.green], fallback: "23.4" },
    { label: "MOVE 지수", sub: "채권 내재변동성", raw: macro?.MOVE?.current, fmt: (v) => v.toFixed(0), tag: (v) => v > 140 ? ["고변동", C.red] : v > 100 ? ["경계", C.amber] : ["정상", C.t3], fallback: "—" },
    { label: "10Y-3M 스프레드", sub: "장단기 금리차", raw: yieldSpread?.current, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", tag: (v) => v < -0.1 ? ["역전", C.red] : v < 0.3 ? ["평탄", C.amber] : ["정상", C.green], fallback: "—" },
    { label: "HY 크레딧", sub: "HYG 1일 변화", raw: macro?.HYG?.change_1d, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", tag: (v) => v < -1 ? ["확대", C.red] : v < 0 ? ["소폭 약세", C.amber] : ["타이트", C.green], fallback: "—" },
  ];

  const keyRates = [
    { label: "미국 단기금리", sub: "US 3M T-Bill", key: "US3M" },
    { label: "미국 장기금리", sub: "US 10Y Treasury", key: "US10Y" },
    { label: "하이일드 ETF", sub: "HYG 현재가", key: "HYG" },
  ].map(r => ({ ...r, current: macro?.[r.key]?.current as number | undefined, change1d: macro?.[r.key]?.change_1d as number | undefined }));

  const cm = macro?.correlation_matrix;
  const heatRows: [string, string, string][][] | null = cm
    ? HEAT_PROXY.map(([, k1]) => HEAT_PROXY.map(([, k2]) => {
        const raw = k1 === k2 ? 1 : Number(cm?.[k1]?.[k2] ?? cm?.[k2]?.[k1] ?? 0);
        return heatCell(isFinite(raw) ? raw : 0);
      }))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* S1: Regime Dashboard ──────────────────────────────────────────────── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr" }}>
          {regimeCards.map((r, i) => (
            <div key={r.l} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, borderRight: i < 2 ? `1px solid ${C.b2}` : undefined }}>
              <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: "1.5px", color: C.t5 }}>{r.l}</span>
              <span style={{ fontFamily: FA, fontSize: 20, fontWeight: 700, color: r.vc }}>
                {r.v}{r.arrow && <span style={{ fontSize: 11, color: r.ac, marginLeft: 4 }}>{r.arrow}</span>}
              </span>
              <span style={{ fontSize: 10, color: "#777" }}>{r.d}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.b2}`, padding: "10px 18px 12px" }}>
          <div style={{ display: "flex", gap: 3 }}>
            {REGIME_ORDER_LIST.map((r, i) => {
              const active = i === regimeIdx;
              const col = REGIME_COLORS_SEQ[i];
              const isFirst = i === 0;
              const isLast = i === REGIME_ORDER_LIST.length - 1;
              return (
                <div key={r} style={{
                  flex: 1,
                  height: 40,
                  borderRadius: isFirst ? "5px 2px 2px 5px" : isLast ? "2px 5px 5px 2px" : 2,
                  background: active ? `${col}1f` : `${col}08`,
                  border: `1px solid ${active ? col + "90" : col + "22"}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  boxShadow: active ? `0 0 14px ${col}30` : "none",
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: active ? col : col + "40" }} />
                  <span style={{ fontSize: 9, fontFamily: FA, letterSpacing: ".5px", fontWeight: active ? 700 : 400, color: active ? col : col + "55" }}>{REGIME_KR_SHORT[r]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* S2: Yield Curve + Key Rates ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 }}>
        <Card style={{ padding: "14px 18px", display: "flex", flexDirection: "column" }}>
          <YieldCurveChart macro={macro} />
        </Card>
        <Card style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }}>
          <CardTitle>주요 금리 현황</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-around" }}>
            {keyRates.map((r, i) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < keyRates.length - 1 ? `1px solid ${C.b2}` : undefined }}>
                <div>
                  <div style={{ fontSize: 11, color: "#bbb", fontWeight: 500 }}>{r.label}</div>
                  <div style={{ fontSize: 8.5, color: C.t5, fontFamily: FA, letterSpacing: ".5px", marginTop: 1 }}>{r.sub}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color: "#fff" }}>{r.current != null ? fmtQuote(r.key, r.current) : "—"}</div>
                  {r.change1d != null && (
                    <div style={{ fontSize: 9, fontFamily: FM, color: r.change1d >= 0 ? C.up : C.red, marginTop: 1 }}>
                      {r.change1d >= 0 ? "▲" : "▼"}{Math.abs(r.change1d).toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* S3: Macro Indicators with Sparklines ──────────────────────────────── */}
      <Card style={{ padding: "14px 18px" }}>
        <CardTitle right={macro ? "실시간" : undefined}>실시간 매크로 지표</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.b2, border: `1px solid ${C.b2}`, borderRadius: 6, overflow: "hidden" }}>
          {indCells.map((cell) => (
            <div key={cell.label} style={{ background: C.card, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 8.5, color: C.t5, fontFamily: FM }}>{cell.label}</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: FA, fontSize: 14, fontWeight: 700 }}>
                  {cell.value} <span style={{ fontSize: 9.5, color: cell.up ? C.up : C.red }}>{cell.up ? "▲" : "▼"}</span>
                </span>
                <Sparkline history={cell.history} color={cell.up ? C.up : C.red} w={52} h={22} />
              </div>
              <span style={{ fontSize: 8, color: cell.up ? C.up : C.red, fontFamily: FM }}>{cell.up ? "+" : ""}{cell.change1d.toFixed(2)}% 1일</span>
            </div>
          ))}
        </div>
      </Card>

      {/* S4: Sentiment Pulse ────────────────────────────────────────────────── */}
      <Card style={{ padding: "14px 18px" }}>
        <CardTitle right="시장 심리 지표">센티멘트 펄스</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {sentimentPulse.map((s) => {
            const val = s.raw != null ? s.fmt(s.raw) : s.fallback;
            const [tagLabel, tagColor] = s.raw != null ? s.tag(s.raw) : ["—", C.t5];
            return (
              <div key={s.label} style={{ background: C.card2, border: `1px solid ${C.b2}`, borderRadius: 7, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t5 }}>{s.label}</span>
                <span style={{ fontFamily: FM, fontSize: 18, fontWeight: 700, color: s.raw != null ? "#fff" : C.t5 }}>{val}</span>
                <span style={{ fontSize: 9, color: C.t4, marginTop: -2 }}>{s.sub}</span>
                <span style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 8.5, fontFamily: FA, color: tagColor, background: `${tagColor}1a`, border: `1px solid ${tagColor}40`, borderRadius: 3, padding: "2px 7px", letterSpacing: ".5px", marginTop: 2 }}>{tagLabel}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* S5: Correlation Heatmap ────────────────────────────────────────────── */}
      <Card style={{ padding: "14px 18px" }}>
        <CardTitle right={cm ? "1년 롤링 · 대용지표" : "60일 롤링"}>자산 상관관계 히트맵</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "60px repeat(5,1fr)", gap: 4, fontFamily: FM, fontSize: 10.5 }}>
          <span />
          {HEAT_LABELS.map((l) => (<span key={l} style={{ textAlign: "center", color: "#777", fontSize: 9 }}>{l}</span>))}
          {(heatRows || HEAT).map((row, ri) => (
            <React.Fragment key={ri}>
              <span style={{ color: "#777", fontSize: 9, display: "flex", alignItems: "center" }}>{HEAT_LABELS[ri]}</span>
              {row.map(([v, bg, col], ci) => (
                <span key={ci} style={{ textAlign: "center", padding: "11px 0", background: bg, color: col, borderRadius: 3 }}>{v}</span>
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

const ASSET_HEX: Record<string, string> = { KR_STOCK: "#3B82F6", GLOBAL_STOCK: "#A855F7", KR_BOND: "#2DD4BF", GLOBAL_BOND: "#FB923C", ALTERNATIVE: "#FACC15" };
const Q_MOCK: any[] = [
  ["연준 의사록 — 도비시 기조 확인", "관련도 0.91", "감성 +0.6", C.up],
  ["반도체 수출 3개월 연속 증가", "관련도 0.84", "감성 +0.5", C.up],
  ["중국 부동산 디레버리징 장기화", "관련도 0.77", "감성 −0.4", C.red],
  ["유로존 PMI 50 회복", "관련도 0.69", "감성 +0.3", C.up],
];
const T_MOCK: any[] = [
  ["해외주식 비중확대", C.violet, "72%", C.up, "금리 인하 + 이익 모멘텀이 환위험을 상회."],
  ["듀레이션 확대", C.green, "58%", C.amber, "금리 하락 우세, 단 레짐 리스크로 강도 절제."],
  ["국내주식 중립", C.blue, "50%", "#888", "수출 호조 vs 환·중국 리스크 균형."],
];
const D_MOCK: any[] = [
  ["BULL", C.up, "금리 인하 = 멀티플 확장. 해외주식 오버웨이트.", C.t3, false],
  ["BEAR", C.red, "VIX·환율 부담. 듀레이션이 더 안전.", C.t3, false],
  ["JERRY", C.amber, "근거 폭은 Bull 우세 — 해외주식 확대, 단 강도 절제하고 채권 소폭 확대로 헤지.", C.t2, true],
];

function ResearchTab({ queue: qIn, theses: tIn, onCollect, collecting, collectProgress, onBuild, building, msg, onAttachThesis, onDeleteThesis, onResetTheses }: {
  queue: any[]; theses: any[]; onCollect: () => void; collecting: boolean; collectProgress: { phase: string; items: string[] } | null;
  onBuild: () => void; building: boolean; msg: string; onAttachThesis: (t: any) => void;
  onDeleteThesis: (id: string) => void; onResetTheses: () => void;
}) {
  const queueRows = (qIn && qIn.length)
    ? qIn.slice(0, 12).map((d) => {
        const rel = d.relevance ? Math.max(0, ...Object.values(d.relevance).map((x) => Number(x) || 0)) : 0;
        return { title: d.title || "(제목 없음)", rel: `관련도 ${rel.toFixed(2)}`, score: `점수 ${(d.composite_score ?? 0).toFixed(2)}` };
      })
    : Q_MOCK.map((m: any[]) => ({ title: m[0], rel: m[1], score: m[2] }));
  const log = tIn?.[0]?.evidence?.debate_log;
  const debate = (Array.isArray(log) && log.length)
    ? log.slice(0, 3).map((e: any, i: number) => {
        const sp = String(e.speaker || "").toLowerCase();
        const color = sp.includes("bull") ? C.up : sp.includes("bear") ? C.red : C.amber;
        const top = i === log.length - 1 && !sp.includes("bull") && !sp.includes("bear");
        return [String(e.speaker || "").toUpperCase(), color, e.message || "", top ? C.t2 : C.t3, top];
      })
    : D_MOCK;
  const colHdr: React.CSSProperties = { fontSize: 9, fontFamily: FA, letterSpacing: "1.5px", color: C.t5, paddingBottom: 8, borderBottom: `1px solid ${C.b1}` };
  const btn = (active: boolean): React.CSSProperties => ({ fontSize: 10, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", padding: "7px 13px", borderRadius: 6, border: "none", display: "flex", alignItems: "center", gap: 5, cursor: active ? "wait" : "pointer", color: "#000", background: active ? C.b3 : C.green });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FA, fontWeight: 700, fontSize: 16, letterSpacing: ".5px" }}>매크로 리서치 파이프라인</span>
        <span style={{ fontSize: 11.5, color: "#666" }}>수집 → 논거 구축 (Jerry) → 채팅으로 드래그</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <button onClick={onCollect} disabled={collecting} style={btn(collecting)}>{collecting ? "수집 중…" : "1 · 수집"}</button>
          <button onClick={onBuild} disabled={building || collecting} style={{ ...btn(building), background: building ? C.b3 : "#fff" }}>{building ? "구축 중…" : "2 · 논거 구축"}</button>
        </div>
      </div>
      {msg && <div style={{ fontSize: 11, color: C.amber, fontFamily: FP }}>{msg}</div>}

      {collecting && collectProgress ? (
        <div style={{ border: `1px solid ${C.b3}`, background: "#050505", borderRadius: 10, overflow: "hidden", minHeight: 300 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${C.b1}` }}>
            <span style={{ position: "relative", width: 8, height: 8 }}><span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, animation: "pulseDot 1.4s infinite" }} /></span>
            <span style={{ fontFamily: FA, fontSize: 10, letterSpacing: "1.5px", color: "#cfcfcf" }}>매크로 소스 수집 중</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.green, fontFamily: FM }}>{collectProgress.phase}</span>
          </div>
          <div className="etc-scroll" style={{ padding: "12px 15px", fontFamily: FM, fontSize: 11.5, lineHeight: 1.9, color: "#8f8f8f", maxHeight: 420, overflowY: "auto" }}>
            {collectProgress.items.length === 0 ? <span style={{ color: C.t5 }}>소스에 연결하는 중…</span> : collectProgress.items.map((it, i) => (<div key={i} style={{ color: C.cyan }}>{it}</div>))}
            <span style={{ display: "inline-block", width: 7, height: 13, background: C.green, animation: "blink 1s step-end infinite", verticalAlign: -2 }} />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {/* research queue */}
          <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, maxHeight: "64vh", overflowY: "auto" }}>
            <div style={colHdr}>리서치 큐 · 수집됨 ({queueRows.length})</div>
            {queueRows.map((d, i) => (
              <div key={i} style={{ background: C.panel2, border: `1px solid #1a1a1a`, borderRadius: 6, padding: "9px 10px" }}>
                <div style={{ fontSize: 11.5, color: "#ddd", lineHeight: 1.45, marginBottom: 5 }}>{d.title}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 9, fontFamily: FM, color: "#666" }}><span>{d.rel}</span><span>{d.score}</span></div>
              </div>
            ))}
          </Card>

          {/* house theses — draggable to chat */}
          <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, maxHeight: "64vh", overflowY: "auto" }}>
            <div style={{ ...colHdr, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>하우스 논거 · 채팅으로 드래그</span>
              {tIn && tIn.length > 0 && (
                <button
                  onClick={onResetTheses}
                  style={{
                    fontSize: 9,
                    fontFamily: FA,
                    background: "none",
                    border: "none",
                    color: C.red,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  전체 초기화
                </button>
              )}
            </div>
            {tIn && tIn.length ? tIn.slice(0, 8).map((t: any) => {
              const key = t.asset || t.asset1 || "GLOBAL_STOCK";
              const conf = Math.round((t.confidence ?? 0) * 100);
              const cc = conf >= 70 ? C.up : conf >= 50 ? C.amber : "#888";
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", t.id); }}
                  title="드래그: 채팅에 추가"
                  style={{ background: C.panel2, border: `1px solid ${C.b3}`, borderRadius: 7, padding: 11, cursor: "grab" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ASSET_HEX[key] || C.violet }} />
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.35 }}>{t.title || ASSET_KR[key] || key}</span>
                    <span style={{ marginLeft: "auto", fontSize: 9.5, fontFamily: FM, color: cc, flex: "0 0 auto" }}>{conf}%</span>
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.55, color: "#8a8a8a", marginBottom: 9 }}>{t.rationale}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span onClick={() => onAttachThesis(t)} style={{ fontSize: 9.5, fontFamily: FA, letterSpacing: ".5px", color: C.cyan, border: "1px solid rgba(34,211,238,.3)", background: "rgba(34,211,238,.08)", padding: "4px 9px", borderRadius: 4, cursor: "pointer" }}>+ 채팅에 추가</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteThesis(t.id); }}
                      style={{
                        fontFamily: FA,
                        fontSize: 9,
                        color: C.red,
                        background: "rgba(239,68,68,.08)",
                        border: "1px solid rgba(239,68,68,.3)",
                        padding: "3px 6px",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                      title="삭제"
                    >
                      ✕ 삭제
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div style={{ fontSize: 11, color: C.t4, lineHeight: 1.6, padding: "8px 2px" }}>아직 하우스 뷰가 없습니다. <b style={{ color: "#bbb" }}>1 · 수집</b> 후 <b style={{ color: "#bbb" }}>2 · 논거 구축</b>을 실행하세요.</div>
            )}
          </Card>

          {/* debate log */}
          <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, maxHeight: "64vh", overflowY: "auto" }}>
            <div style={colHdr}>토론 로그</div>
            {debate.map(([who, wc, m, mc, top]: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 7, ...(top ? { borderTop: `1px solid ${C.b1}`, paddingTop: 8 } : {}) }}>
                <span style={{ flex: "0 0 auto", fontSize: 8, fontFamily: FA, fontWeight: 700, color: wc }}>{who}</span>
                <span style={{ fontSize: 10.5, lineHeight: 1.5, color: mc }}>{m}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

const REPORT_MOCK_ROWS = [
  { name: "해외주식", color: "#A855F7", w: 39.5, d: 4.8, bench: 34.7 },
  { name: "국내주식", color: "#3B82F6", w: 17.2, d: -3.6, bench: 20.8 },
  { name: "국내채권", color: "#2DD4BF", w: 24.5, d: 1.4, bench: 23.1 },
  { name: "해외채권", color: "#FB923C", w: 9.1, d: 1.7, bench: 7.4 },
  { name: "대체투자", color: "#FACC15", w: 9.7, d: -4.3, bench: 14.0 },
];
const SOURCES_MOCK: [string, string, string, string, string][] = [
  ["리서치", "fill", "미 연준 2026 금리 인하 전망 · NPS 하우스뷰", "74%", C.up],
  ["뉴스", "outline", "엔비디아 실적 서프라이즈 · Reuters", "68%", C.up],
  ["내 자산", "cyan", "KB증권 2026 자산시장 전망.pdf · 회원 업로드", "55%", "#888"],
  ["뉴스", "outline", "원/달러 1,380원 돌파 · 연합인포맥스", "61%", C.amber],
];

// ── Report tab: a 4-column grid of past reports; selecting one shows the full
// report (ReportDoc). A loading card appears while a new one is being generated.
function ReportCard({ r, onClick }: { r: any; onClick: () => void }) {
  const date = (r.created_at || "").slice(0, 10);
  const opt = (r.optimizer || "ensemble").toUpperCase();
  return (
    <div onClick={onClick}
      style={{ cursor: "pointer", background: C.panel2, border: `1px solid ${C.b2}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8, minHeight: 128, transition: "border-color .15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.cyan)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.b2)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, fontFamily: FM, color: C.t5 }}>#{r.id} · {date}</span>
        <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: ".5px", color: C.t3, border: `1px solid ${C.b4}`, borderRadius: 3, padding: "2px 5px" }}>{opt}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#eaeaea", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title || "무제 리포트"}</span>
      <span style={{ marginTop: "auto", fontSize: 9.5, color: C.green, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px" }}>리포트 열기 →</span>
    </div>
  );
}
function LoadingReportCard() {
  return (
    <div style={{ background: C.panel2, border: `1px dashed ${C.violet}`, borderRadius: 10, padding: 14, minHeight: 128, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center" }}>
      <span style={{ display: "inline-flex", gap: 4 }}>
        {[0, 1, 2].map((i) => (<span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.violet, animation: `pulseDot 1.2s ${i * 0.2}s infinite` }} />))}
      </span>
      <span style={{ fontSize: 10.5, color: C.violet, fontFamily: FA, letterSpacing: ".5px" }}>리포트 생성 중…</span>
    </div>
  );
}
function ReportTab({ reports, openReport, running, reportLoading, onOpen, onBack }: {
  reports: any[]; openReport: any | null; running: boolean; reportLoading: boolean;
  onOpen: (id: number) => void; onBack: () => void;
}) {
  if (openReport) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div onClick={onBack} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", color: C.t3, marginBottom: 14 }}>← 리포트 목록</div>
        <ReportDoc sim={openReport} />
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: FA, fontWeight: 800, fontSize: 18, letterSpacing: ".3px" }}>생성된 리포트</span>
        <span style={{ fontSize: 11, color: C.t4 }}>{reports.length}건{reportLoading ? " · 불러오는 중…" : ""}</span>
      </div>
      {reports.length === 0 && !running ? (
        <div style={{ color: C.t4, fontSize: 12, lineHeight: 1.8, padding: "20px 2px" }}>아직 생성된 리포트가 없습니다. 왼쪽 데스크에서 뷰를 정하고 <b style={{ color: "#fff" }}>최적화 실행</b>을 하면 이 자리에 리포트가 생성됩니다.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {running && <LoadingReportCard />}
          {reports.map((r) => (<ReportCard key={r.id} r={r} onClick={() => onOpen(r.id)} />))}
        </div>
      )}
    </div>
  );
}

function ReportDoc({ sim }: { sim: any }) {
  const SectionH = ({ children, bar = "#fff", badge }: { children: React.ReactNode; bar?: string; badge?: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "26px 0 12px" }}>
      <span style={{ width: 3, height: 13, background: bar }} />
      <span style={{ fontFamily: FA, fontWeight: 700, fontSize: 11, letterSpacing: "2px", color: "#fff" }}>{children}</span>
      {badge && <span style={{ fontSize: 8, fontFamily: FA, letterSpacing: "1px", color: C.red, border: "1px solid rgba(239,68,68,.3)", padding: "2px 6px", borderRadius: 3 }}>{badge}</span>}
    </div>
  );
  // ── derive everything from the live run (mock-equivalent fallback pre-run) ──
  const rows = allocFromSim(sim) || REPORT_MOCK_ROWS;
  const attrib = attribFromSim(sim) || ATTRIB;
  const rm = sim?.risk_metrics, bm = sim?.benchmark_portfolio, op = sim?.optimized_portfolio;
  const mc = sim?.macro_context || {}, pm = sim?.pm_memo || {};
  const rf = sim?.risk_free_rate ?? 0.035;
  const expR = rm?.expected_return ?? 0.0684, vol = rm?.volatility ?? 0.0912;
  const sharpe = rm ? (rm.expected_return - rf) / (rm.volatility || 1e-6) : 0.61;
  const var95 = rm?.var_95 ?? -0.137, cvar = rm?.cvar_95 ?? -0.182, mdd = rm?.max_drawdown_estimate ?? -0.224;
  const benchR = bm?.return ?? 0.0641, benchV = bm?.volatility ?? 0.0938, benchS = bm?.sharpe ?? 0.54;
  const sorted = [...rows].sort((a, b) => b.d - a.d);
  const ow = sorted[0], uw = sorted[sorted.length - 1];
  const bondDelta = rows.filter((r) => r.name === "국내채권" || r.name === "해외채권").reduce((s, r) => s + r.d, 0);
  const regimeKey = mc.market_regime || "ELEVATED_RISK";
  const regLabel = (REGIME_MAP[regimeKey] || ["위험 고조"])[0];
  const lam = REGIME_LAMBDA[regimeKey] || "1.4×";
  const vixV = mc?.VIX?.current ?? 23.4, usdkrw = mc?.USD_KRW?.current ?? 1382, us10y = mc?.US10Y?.current ?? 4.18;
  const pf = (x: number) => `${(x * 100).toFixed(2)}%`;
  const dpp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}`;
  const f1 = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;

  const posRows = rows.map((r) => {
    const a = (attrib as any[]).find((x) => x.name === r.name);
    const [stance, sc] = r.d >= 2 ? ["비중확대 OW", C.up] : r.d <= -2 ? ["비중축소 UW", C.red] : r.d > 0.3 ? ["소폭 확대", C.t2] : r.d < -0.3 ? ["소폭 축소", C.t2] : ["중립", C.t2];
    const conf = Math.abs(r.d) >= 3 ? "高" : Math.abs(r.d) >= 1 ? "中" : "—";
    return [r.name, r.color, stance, sc, conf, f1(r.d), r.d >= 0 ? C.up : C.red, (a?.why as string) || "시장 균형 유지"];
  });
  const rrRows: [string, string, string, string, string][] = [
    ["연간 기대수익률", pf(benchR), pf(expR), dpp(expR - benchR), "#fff"],
    ["연간 변동성", pf(benchV), pf(vol), dpp(vol - benchV), "#fff"],
    ["샤프 비율", benchS.toFixed(2), sharpe.toFixed(2), `${sharpe - benchS >= 0 ? "+" : "−"}${Math.abs(sharpe - benchS).toFixed(2)}`, "#fff"],
    ["95% VaR (1Y)", "—", pf(var95), "—", C.redL],
    ["95% CVaR (1Y)", "—", pf(cvar), "—", C.redL],
    ["예상 최대낙폭", "—", pf(mdd), "—", C.redL],
  ];
  const risks = [
    [`① ${ow.name} 집중`, "영향 高 · 가능성 中", `단일 최대 오버웨이트(${f1(ow.d)}%p, 비중 ${ow.w.toFixed(1)}%). 해당 모멘텀 되돌림 시 손실 기여가 가장 크다.`, `${ow.name} 액티브 비중을 벤치마크 +5%p로 캡, 지수 풋 스프레드로 하방 5% 헤지.`],
    ["② 환위험 (USD/KRW)", "영향 中 · 가능성 高", `원/달러 ${Math.round(usdkrw).toLocaleString()}원 수준에서 해외 익스포저가 KRW 대비 환노출. 원화 강세 전환 시 해외 수익을 잠식한다.`, "해외 익스포저 50%에 KRW 선물 오버레이, 분기 리밸런싱 시 헤지비율 재산정."],
    ["③ 금리·듀레이션", "영향 中 · 가능성 中", `채권 합산 ${f1(bondDelta)}%p 조정이 금리 경로 가정에 의존. 인하 지연·반등 시 채권·대체가 동반 약세할 수 있다.`, `채권 듀레이션 중립~단기 유지, US10Y 4.5% 상향 돌파를 뷰 재검토 트리거로 설정.`],
    ["④ 모델 리스크 (BL)", "영향 中 · 가능성 中", "사후 기대수익률이 뷰 신뢰도·τ·λ 가정에 민감하며 추정오차가 존재한다.", "앙상블(MVO·RP·HRP)로 단일모델 민감도 완화, 신뢰도 ±10% 민감도 분석 병행."],
  ];
  const srcs = Array.from(new Set((attrib as any[]).map((a) => a.src).filter(Boolean))).slice(0, 5);
  const sources: [string, string, string, string, string][] = srcs.length
    ? srcs.map((s) => ["근거", "outline", String(s), "", C.t3] as [string, string, string, string, string])
    : SOURCES_MOCK;
  const convictionText = pm?.investment_thesis_summary
    || `“${ow.name} 비중확대로 뷰를 표현하되, 환·변동성은 헤지로 관리한다 — δ 한도 내 절제된 배분.”`;
  const runId = sim?.simulation_id ? `#${sim.simulation_id}` : "#248";
  const today = new Date().toISOString().slice(0, 10);
  const engine = (sim?.optimizer || "ensemble").toUpperCase();
  const gT = "96px 92px 78px 64px 1fr";
  const rrT = "1.6fr 1fr 1fr 1fr";
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* masthead */}
      <div style={{ border: `1px solid ${C.b2}`, borderBottom: "none", background: "linear-gradient(180deg,#0c0c0c,#080808)", borderRadius: "10px 10px 0 0", padding: "24px 30px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: FM, letterSpacing: "1px", color: C.t5, marginBottom: 9 }}>국민연금공단 · 투자정책실 · 글로벌 멀티에셋 데스크</div>
            <div style={{ fontFamily: FA, fontWeight: 800, fontSize: 22, letterSpacing: ".5px", lineHeight: 1.15, marginBottom: 10 }}>글로벌 멀티에셋 배분 보고서</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.t2, maxWidth: 540 }}>{ow.name} {ow.d >= 0 ? "비중확대" : "비중축소"}를 중심으로 한 전술적 배분 — {regLabel} 레짐과 환위험은 절제로 관리</div>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <span style={{ fontSize: 8.5, fontFamily: FM, color: C.amber, border: "1px solid rgba(251,191,36,.3)", padding: "3px 8px", borderRadius: 3 }}>CONFIDENTIAL · IC ONLY</span>
            <button style={{ fontFamily: FA, fontWeight: 700, fontSize: 9.5, letterSpacing: "1.5px", background: "#fff", color: "#000", border: "none", padding: "8px 13px", borderRadius: 6, cursor: "pointer" }}>⤓ PDF 내보내기</button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 18, paddingTop: 15, borderTop: `1px solid ${C.b1}`, fontSize: 9.5, fontFamily: FM, color: "#777" }}>
          {[["실행 ID", runId], ["일자", today], ["엔진", engine], ["이탈 한도 δ", "5%"], ["작성", "Chris (CIS)"], ["검토", "Jerry (선임 PM)"]].map(([k, v]) => (
            <span key={k}>{k} <span style={{ color: "#ddd" }}>{v}</span></span>
          ))}
        </div>
      </div>
      {/* body */}
      <div style={{ border: `1px solid ${C.b2}`, background: "#090909", borderRadius: "0 0 10px 10px", padding: "8px 30px 30px" }}>
        <SectionH>핵심 요약 · EXECUTIVE SUMMARY</SectionH>
        <div style={{ borderLeft: "2px solid #fff", background: C.card2, padding: "14px 18px", fontSize: 13, lineHeight: 1.8, color: "#dadada" }}>
          <b style={{ color: "#fff" }}>결론 먼저(BLUF).</b> {ow.name}을 전략적 벤치마크 대비 <b style={{ color: "#fff" }}>{f1(ow.d)}%p {ow.d >= 0 ? "비중확대" : "비중축소"}({ow.w.toFixed(1)}%)</b>하고, {uw.name}을 <b style={{ color: "#fff" }}>{f1(uw.d)}%p {uw.d >= 0 ? "확대" : "축소"}({uw.w.toFixed(1)}%)</b>할 것을 권고한다. 채권은 합산 {f1(bondDelta)}%p 조정해 균형을 잡았다. 본 배분의 연간 기대수익률은 <b style={{ color: "#fff" }}>{pf(expR)}</b>, 변동성 <b style={{ color: "#fff" }}>{pf(vol)}</b>, 샤프 <b style={{ color: "#fff" }}>{sharpe.toFixed(2)}</b>로 벤치마크 대비 위험조정수익을 개선한다. {regLabel} 레짐을 감안해 모든 틸트는 δ 5% 한도 내로 절제했다.
        </div>
        <SectionH>시장 국면 진단 · MARKET REGIME DIAGNOSIS</SectionH>
        <div style={{ fontSize: 13, lineHeight: 1.85, color: C.t2 }}>시스템은 현재 국면을 <b style={{ color: C.amber }}>{regLabel}</b>로 판정했다. VIX는 <b style={{ color: "#fff" }}>{vixV}</b> 수준이고, 원/달러는 <b style={{ color: "#fff" }}>{Math.round(usdkrw).toLocaleString()}원</b>, 미 10년물은 <b style={{ color: "#fff" }}>{us10y}%</b>로 관측된다. 이 국면 판단에 따라 위험예산을 조정하며, 위험회피계수 λ를 <b style={{ color: "#fff" }}>{lam}</b>로 적용해 틸트 강도를 제한했다.</div>
        <SectionH>포지셔닝 논리 · POSITIONING RATIONALE</SectionH>
        <div style={{ fontSize: 13, lineHeight: 1.85, color: C.t2, marginBottom: 14 }}>최대 오버웨이트는 <b style={{ color: "#fff" }}>{ow.name}({f1(ow.d)}%p)</b>, 최대 언더웨이트는 <b style={{ color: "#fff" }}>{uw.name}({f1(uw.d)}%p)</b>다. 틸트는 사후 기대수익률을 끌어올린 활성 뷰에 직접 기인하며, Ben의 마켓 근거와 Jerry의 매크로 하우스 뷰가 같은 방향을 가리킨다. {uw.name} 축소는 {regLabel} 레짐에서 변동성 기여가 컸기 때문이다.</div>
        <div style={{ border: `1px solid #1a1a1a`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: gT, gap: "0 12px", padding: "9px 14px", background: C.card2, fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t4 }}>
            <span>자산</span><span>스탠스</span><span>확신도</span><span style={{ textAlign: "right" }}>액티브</span><span style={{ paddingLeft: 8 }}>핵심 논거</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: gT, gap: "10px 12px", padding: "12px 14px", fontSize: 11.5, alignItems: "center" }}>
            {posRows.map((r) => (
              <React.Fragment key={r[0] as string}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#ddd" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: r[1] as string }} />{r[0]}</span>
                <span style={{ color: r[3] as string, fontSize: 10.5 }}>{r[2]}</span>
                <span style={{ fontFamily: FM, color: "#bbb" }}>{r[4]}</span>
                <span style={{ textAlign: "right", fontFamily: FM, color: r[6] as string }}>{r[5]}</span>
                <span style={{ color: C.t3, fontSize: 11, paddingLeft: 8 }}>{r[7]}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <SectionH>기대 성과 및 리스크 프로파일 · RETURN &amp; RISK</SectionH>
        <div style={{ border: `1px solid #1a1a1a`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: rrT, gap: "0 12px", padding: "9px 14px", background: C.card2, fontSize: 8.5, fontFamily: FA, letterSpacing: "1px", color: C.t4 }}>
            <span>지표</span><span style={{ textAlign: "right" }}>전략적 벤치마크</span><span style={{ textAlign: "right" }}>최적화</span><span style={{ textAlign: "right" }}>액티브</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: rrT, gap: "10px 12px", padding: "12px 14px", fontSize: 11.5, fontFamily: FM, alignItems: "center" }}>
            {rrRows.map((r) => (
              <React.Fragment key={r[0]}>
                <span style={{ fontFamily: FP, color: "#ddd" }}>{r[0]}</span>
                <span style={{ textAlign: "right", color: "#999" }}>{r[1]}</span>
                <span style={{ textAlign: "right", color: r[4] }}>{r[2]}</span>
                <span style={{ textAlign: "right", color: C.up }}>{r[3]}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.75, color: C.t3, marginTop: 11 }}>최적화 포트폴리오는 벤치마크 대비 기대수익률을 {dpp(expR - benchR)}%p 조정하고 샤프를 {benchS.toFixed(2)}→{sharpe.toFixed(2)}로 개선한다. 10,000회 몬테카를로 기준 1년 95% VaR는 {pf(var95)}, 예상 최대낙폭은 {pf(mdd)}로 추정된다.</div>
        <SectionH bar={C.red} badge="필수">리스크 요인 및 완화 전략 · RISK &amp; MITIGATION</SectionH>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {risks.map(([t, sev, body, mit]) => (
            <div key={t} style={{ border: `1px solid #1a1a1a`, borderLeft: `2px solid ${C.red}`, borderRadius: "0 8px 8px 0", padding: "13px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>{t}</span>
                <span style={{ fontSize: 9, fontFamily: FM, color: C.amber, marginLeft: "auto" }}>{sev}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: "#bbb", marginBottom: 5 }}>{body}</div>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: C.t3 }}><b style={{ color: C.green }}>완화:</b> {mit}</div>
            </div>
          ))}
        </div>
        <SectionH>실행 권고 · ACTIONABLE RECOMMENDATIONS</SectionH>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, lineHeight: 1.65, color: C.t2 }}>
          {[["리밸런싱.", "분기 1회 정기 + δ 5% 이탈 시 수시. 다음 정기검토 2026-09-30."], ["헤지 오버레이.", "해외주식 FX 50%에 KRW 선물, 주식 하방 5% 풋 스프레드."], ["비중 한도.", "대체투자 벤치마크 +5%p 캡, 단일 자산 액티브 ±5%p 이내."], ["모니터링 트리거.", "VIX 30 · US10Y 4.5% · USD/KRW 1,420 돌파 시 뷰 즉시 재검토."]].map(([b, t]) => (
            <div key={b} style={{ display: "flex", gap: 9 }}><span style={{ color: "#fff" }}>·</span><span><b style={{ color: "#fff" }}>{b}</b> {t}</span></div>
          ))}
        </div>
        <div style={{ marginTop: 24, border: `1px solid ${C.b3}`, background: C.card2, borderRadius: 8, padding: "16px 18px" }}>
          <div style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5, marginBottom: 7 }}>한 줄 결론 · CONVICTION CALL</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "#fff", fontWeight: 600 }}>{convictionText}</div>
        </div>
        {/* signature */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.b1}` }}>
          <Avatar color="#fff">C</Avatar>
          <div><div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>Chris</div><div style={{ fontSize: 9.5, color: "#777" }}>PM · 최고투자전략가 (CIS) · 작성</div></div>
          <div style={{ width: 1, height: 28, background: "#222", margin: "0 4px" }} />
          <Avatar color={C.amber}>J</Avatar>
          <div><div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>Jerry</div><div style={{ fontSize: 9.5, color: "#777" }}>선임 PM · 자산배분 총괄 · 검토</div></div>
          <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: FM, color: C.t6 }}>서명일 {today}</span>
        </div>
        <SectionH>본 분석에 사용된 출처 · SOURCES</SectionH>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sources.map(([tag, ts, txt, conf, cc]) => (
            <div key={txt} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: C.t3 }}>
              <Tag kind={tag} style={ts} />{txt}<span style={{ marginLeft: "auto", fontFamily: FM, color: cc }}>{conf}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22, padding: "13px 16px", background: C.panel2, border: `1px solid ${C.b1}`, borderRadius: 8, fontSize: 10, lineHeight: 1.7, color: C.t4 }}>면책: 본 보고서는 공급된 데이터에 근거한 내부 검토용 문서이며 투자 권유가 아닙니다. 사후 기대수익률·VaR·낙폭은 확정치가 아니라 블랙-리터만 및 몬테카를로 모델의 추정치이며, 실제 성과는 시장 상황에 따라 달라질 수 있습니다. NEMOTRON 3 SUPER 추론 기반 · RUN {runId}.</div>
      </div>
    </div>
  );
}

// ── 설정 (Config) tab — view & switch the LLM used for each task ──────────────
// Reads/writes the live backend model registry (/config/models). Switching a
// model takes effect immediately and is persisted to backend/.env.
type ModelChoice = { id: string; label: string; kind: "fast" | "reasoning"; note: string };
type ModelTask = { key: string; env: string; label: string; desc: string; prefer: "fast" | "reasoning"; current: string };

function ConfigTab() {
  const [tasks, setTasks] = useState<ModelTask[] | null>(null);
  const [choices, setChoices] = useState<ModelChoice[]>([]);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<string>("");      // env currently being saved
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = async () => {
    setError("");
    try {
      const r = await fetch(API_BASE + "/config/models");
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setTasks(j.tasks); setChoices(j.choices);
    } catch {
      setError("백엔드에 연결할 수 없습니다 (localhost:8000). 서버가 실행 중인지 확인하세요.");
    }
  };
  useEffect(() => { load(); }, []);

  const choiceOf = (id: string): ModelChoice | undefined => choices.find(c => c.id === id);

  const switchModel = async (env: string, model: string) => {
    setSaving(env); setToast(null);
    try {
      const r = await fetch(API_BASE + "/config/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env, model }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setTasks(ts => ts ? ts.map(t => t.env === env ? { ...t, current: j.model } : t) : ts);
      setToast({ msg: `${choiceOf(model)?.label || model} (으)로 변경되었습니다 · .env에 저장됨`, ok: true });
    } catch {
      setToast({ msg: "변경에 실패했습니다. 백엔드 연결을 확인하세요.", ok: false });
    }
    setSaving("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header card */}
      <div style={{ background: "linear-gradient(135deg, #050505 0%, #0a0a0a 100%)", border: `1px solid ${C.b1}`, padding: "20px 24px", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Settings size={16} style={{ color: C.violet }} />
          <h3 style={{ fontSize: 14, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", margin: 0, textTransform: "uppercase" }}>AI 모델 설정 · Model Configuration</h3>
        </div>
        <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.5 }}>
          각 작업(task)에 어떤 LLM이 사용되는지 확인하고, 클릭 한 번으로 모델을 교체할 수 있습니다.<br />
          변경 사항은 <span style={{ color: C.t2, fontFamily: FM }}>backend/.env</span> 에 즉시 저장되며 별도 재시작 없이 적용됩니다.
        </p>
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.red}`, background: "#160a05", color: C.redL, padding: "12px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={14} /> {error}
          <span onClick={load} style={{ marginLeft: "auto", cursor: "pointer", textDecoration: "underline", color: C.t2 }}>다시 시도</span>
        </div>
      )}

      {toast && (
        <div style={{ border: `1px solid ${toast.ok ? C.green : C.red}`, background: toast.ok ? "#04140a" : "#160a05", color: toast.ok ? C.green : C.redL, padding: "10px 14px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.msg}
        </div>
      )}

      {tasks?.map(task => {
        const cur = choiceOf(task.current);
        const mismatch = task.prefer === "reasoning" && cur?.kind === "fast";
        return (
          <div key={task.env} style={{ border: `1px solid ${C.b1}`, background: C.panel, borderRadius: 10, padding: "16px 18px" }}>
            {/* Task header */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{task.label}</span>
              <span style={{ fontSize: 10, fontFamily: FM, color: C.t5 }}>{task.env}</span>
            </div>
            <p style={{ fontSize: 11.5, color: C.t3, margin: "0 0 6px" }}>{task.desc}</p>
            <div style={{ fontSize: 11.5, color: C.t4, marginBottom: 12 }}>
              현재 모델: <span style={{ color: C.violet, fontWeight: 600 }}>{cur?.label || task.current}</span>
              {cur && <span style={{ color: C.t5 }}> · {cur.note}</span>}
            </div>

            {mismatch && (
              <div style={{ fontSize: 11, color: C.amber, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={12} /> 이 작업은 추론(CoT) 모델을 권장합니다. 현재 모델은 추론이 없어 결과 품질이 낮을 수 있습니다.
              </div>
            )}

            {/* Choice chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {choices.map(ch => {
                const active = ch.id === task.current;
                const isSaving = saving === task.env;
                return (
                  <button
                    key={ch.id}
                    disabled={active || isSaving}
                    onClick={() => switchModel(task.env, ch.id)}
                    title={ch.note}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontFamily: FA, fontSize: 11, fontWeight: 600, letterSpacing: ".3px",
                      padding: "7px 11px", borderRadius: 7,
                      cursor: active ? "default" : (isSaving ? "wait" : "pointer"),
                      background: active ? "#04140a" : C.card,
                      color: active ? C.green : C.t2,
                      border: `1px solid ${active ? C.green : C.b3}`,
                      opacity: isSaving && !active ? 0.5 : 1,
                      transition: "all .12s",
                    }}
                  >
                    {active && <Check size={12} />}
                    {ch.label}
                    <span style={{ fontSize: 9, color: active ? C.green : C.t5, border: `1px solid ${active ? C.green : C.b3}`, borderRadius: 4, padding: "1px 4px" }}>
                      {ch.kind === "reasoning" ? "추론" : "고속"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {!tasks && !error && <div style={{ fontSize: 12, color: C.t4 }}>모델 설정을 불러오는 중...</div>}
    </div>
  );
}

function GuideTab({ onNavigate, runSimulation, running }: { onNavigate: (t: string) => void; runSimulation: () => void; running: boolean }) {
  const [activeStep, setActiveStep] = useState<number>(1);

  const steps = [
    {
      id: 1,
      tab: "매크로",
      title: "매크로 국면 분석",
      desc: "VIX 지수, 거시경제 성장 및 인플레이션 지표를 검토하여 하락/상승 레짐을 파악합니다.",
      tip: "현재 위기(CRISIS) 또는 위험 고조 레짐일 경우 리스크 혐오도(λ) 계수가 자동으로 상향 조정됩니다.",
      actionText: "매크로 대시보드 검토 →",
      icon: TrendingUp,
    },
    {
      id: 2,
      tab: "인텔리전스",
      title: "실시간 뉴스 & 정보 수집",
      desc: "시장 리포트, 뉴스 기사, 웹 기사 URL 또는 PDF 문서를 수집하여 감성지수 신호를 인출합니다.",
      tip: "수집된 뉴스는 Ben(AI 애널리스트)이 읽어 드래그 앤 드롭으로 대화에 증거로 첨부할 수 있습니다.",
      actionText: "인텔리전스 기사 수집 →",
      icon: Newspaper,
    },
    {
      id: 3,
      tab: "리서치",
      title: "하우스 논거 구축",
      desc: "인텔리전스를 바탕으로 최종 하우스 뷰(수익률 전망치, 신뢰도) 논거 카드를 리서치 파이프라인에 구축합니다.",
      tip: "'BUILD HOUSE THESES' 버튼을 실행하면 수집된 뉴스를 바탕으로 AI가 투자 신호 카드를 자동 합성합니다.",
      actionText: "리서치 파이프라인 확인 →",
      icon: FileText,
    },
    {
      id: 4,
      tab: "시뮬레이션",
      title: "블랙-리터만 최적화",
      desc: "작성한 투자 의견과 하우스 신호를 결합하여 블랙-리터만 모델과 앙상블 MVO 알고리즘을 구동합니다.",
      tip: "대화창 상단의 '▶ 다시 최적화' 버튼 또는 아래 단축 실행 버튼으로 수시로 시뮬레이션할 수 있습니다.",
      actionText: running ? "최적화 연산 중..." : "최적화 엔진 다시 구동 ▶",
      icon: Cpu,
      isAction: true,
    },
    {
      id: 5,
      tab: "배분",
      title: "결과 및 보고서 검토",
      desc: "최적화된 포트폴리오 비중, 리스크 공헌도, 효율적 프론티어 곡선과 PM 최종 보고서를 최종 검토합니다.",
      tip: "배분 탭에서 prior(기존 비중) 대비 변동사항을 확인하고, 리포트 탭에서 최종 승인용 PDF 가안을 검토하세요.",
      actionText: "배분 비중 결과 검토 →",
      icon: CheckCircle2,
    },
  ];

  const current = steps.find(s => s.id === activeStep) || steps[0];
  const StepIcon = current.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header card */}
      <div style={{ background: "linear-gradient(135deg, #050505 0%, #0a0a0a 100%)", border: `1px solid ${C.b1}`, padding: "20px 24px", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <BookOpen size={16} style={{ color: C.violet }} />
          <h3 style={{ fontSize: 14, fontFamily: FA, fontWeight: 700, letterSpacing: ".5px", margin: 0, textTransform: "uppercase" }}>Etacolla Terminal Operational Guide</h3>
        </div>
        <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.5 }}>
          본 플랫폼은 퀀트 모델링(Black-Litterman)과 거시지표 분석을 결합하여 NPS 포트폴리오 최적 배분을 산출합니다.<br />
          아래의 5단계 순차적 워크플로우를 따라 시스템을 조작해 보세요.
        </p>
      </div>

      {/* Chevron progress bar */}
      <div style={{ display: "flex", border: `1px solid ${C.b1}`, background: "#030303", borderRadius: 8, overflow: "hidden" }}>
        {steps.map((s, idx) => {
          const isActive = s.id === activeStep;
          const isCompleted = s.id < activeStep;
          return (
            <div
              key={s.id}
              onClick={() => setActiveStep(s.id)}
              style={{
                flex: 1,
                padding: "12px 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
                background: isActive ? "#09090b" : "transparent",
                borderRight: idx < steps.length - 1 ? `1px solid ${C.b1}` : "none",
                transition: "background .15s",
                opacity: isActive ? 1 : 0.6,
              }}
              onMouseOver={(e) => { if (!isActive) e.currentTarget.style.opacity = "0.9"; }}
              onMouseOut={(e) => { if (!isActive) e.currentTarget.style.opacity = "0.6"; }}
            >
              <span style={{ fontSize: 9, fontFamily: FA, fontWeight: 800, color: isActive ? C.violet : isCompleted ? C.green : C.t4 }}>
                STEP 0{s.id}
              </span>
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : C.t3, textAlign: "center", whiteSpace: "nowrap" }}>
                {s.title.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step details Card */}
      <div style={{ background: C.card, border: `1px solid ${C.b1}`, borderRadius: 10, padding: 24, display: "flex", gap: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.b2}`, flexShrink: 0 }}>
          <StepIcon size={20} style={{ color: C.violet }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: FA, fontWeight: 800, color: C.violet, background: `${C.violet}1a`, border: `1px solid ${C.violet}33`, padding: "2px 6px", borderRadius: 3 }}>
              PHASE 0{current.id}
            </span>
            <h4 style={{ fontSize: 13, fontWeight: 600, fontFamily: FA, color: "#fff", margin: 0 }}>{current.title}</h4>
          </div>
          <p style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6, margin: "0 0 16px 0" }}>{current.desc}</p>

          {/* Pro tip box */}
          <div style={{ background: "#050505", borderLeft: `2px solid ${C.amber}`, padding: "10px 14px", borderRadius: "0 6px 6px 0", marginBottom: 20 }}>
            <span style={{ fontSize: 9, fontFamily: FA, fontWeight: 800, color: C.amber, display: "block", marginBottom: 3, letterSpacing: "1px" }}>OPERATIONAL PRO-TIP</span>
            <span style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.5 }}>{current.tip}</span>
          </div>

          {/* Action button */}
          {current.isAction ? (
            <button
              onClick={() => { runSimulation(); }}
              disabled={running}
              style={{
                fontFamily: FA,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1px",
                background: C.white,
                color: "#000",
                border: "none",
                padding: "10px 18px",
                borderRadius: 6,
                cursor: running ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Navigation size={12} />
              {current.actionText}
            </button>
          ) : (
            <button
              onClick={() => { onNavigate(current.tab); }}
              style={{
                fontFamily: FA,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1px",
                background: "transparent",
                color: C.white,
                border: `1px solid ${C.b3}`,
                padding: "10px 18px",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "background .15s",
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#111"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Navigation size={12} />
              {current.actionText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
