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
  TrendingUp, Newspaper, Cpu, Play, ChevronRight, Info, FileText, CheckCircle2, BookOpen, Navigation
} from "lucide-react";

const API_BASE = "http://localhost:8000";

// Regime → [short KR label, accent color], and the regime-scaled risk-aversion λ
// (mirrors backend _regime_lambda_multiplier in main.py).
const REGIME_MAP: Record<string, [string, string]> = {
  CRISIS: ["위기", "#EF4444"], ELEVATED_RISK: ["위험 고조", "#FBBF24"],
  NORMAL: ["정상", "#9a9a9a"], LOW_VOL: ["안정", "#34D399"],
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
  violet: "#A78BFA", green: "#34D399", green2: "#6EE7B7", blue: "#3B82F6",
  amber: "#FBBF24", red: "#EF4444", up: "#22C55E", cyan: "#22D3EE", redL: "#FCA5A5",
};
const FA = "'Archivo',sans-serif";
const FP = "'Pretendard',sans-serif";
// Numbers use the chat (Pretendard) font per user preference — was IBM Plex Mono.
// Column alignment is preserved via fontVariantNumeric:"tabular-nums" on the root.
const FM = FP;

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
  { label: "시스템", tabs: ["가이드"] },
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
  { name: "해외주식", color: C.violet, w: 39.5, d: 4.8, bench: 34.7 },
  { name: "국내주식", color: C.blue, w: 17.2, d: -3.6, bench: 20.8 },
  { name: "국내채권", color: C.green, w: 24.5, d: 1.4, bench: 23.1 },
  { name: "해외채권", color: C.green2, w: 9.1, d: 1.7, bench: 7.4 },
  { name: "대체투자", color: C.amber, w: 9.7, d: -4.3, bench: 14.0 },
];

const ATTRIB = [
  { name: "해외주식", color: C.violet, prior: "7.90%", post: "9.18%", delta: "+1.28", dc: C.up, why: "상대 우위 뷰 · 신뢰도 68%", src: "엔비디아 실적 서프라이즈 · Reuters ↗", tag: "뉴스", tagDark: true },
  { name: "국내주식", color: C.blue, prior: "6.40%", post: "5.72%", delta: "−0.68", dc: C.red, why: "상대 열위 (해외주식 반대편)", src: "원/달러 1,380원 돌파 · 연합인포맥스 ↗", tag: "뉴스", tagDark: true },
  { name: "국내채권", color: C.green, prior: "3.30%", post: "3.71%", delta: "+0.41", dc: C.up, why: "금리 하락 → 채권 강세 · 신뢰도 55%", src: "미 연준 2026 금리 인하 · NPS 하우스뷰 ↗", tag: "리서치", tagDark: false },
  { name: "해외채권", color: C.green2, prior: "3.60%", post: "3.97%", delta: "+0.37", dc: C.up, why: "금리 하락 → 채권 강세 · 신뢰도 55%", src: "미 연준 2026 금리 인하 · NPS 하우스뷰 ↗", tag: "리서치", tagDark: false },
  { name: "대체투자", color: C.amber, prior: "5.10%", post: "5.10%", delta: "—", dc: C.t6, why: "시장 균형 유지 (적용된 뷰 없음)", src: "", tag: "", tagDark: false },
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

  useEffect(() => {
    const getJson = async (path: string) => {
      try { const r = await fetch(API_BASE + path); if (r.ok) return await r.json(); } catch { /* offline → keep mock */ }
      return null;
    };
    (async () => {
      const m = await getJson("/macro-data"); if (m?.data) setMacro(m.data);
      const i = await getJson("/market-intelligence"); if (Array.isArray(i?.data)) setIntel(i.data);
      const q = await getJson("/research/queue?limit=12"); if (Array.isArray(q?.data)) setQueue(q.data);
      const t = await getJson("/theses"); if (Array.isArray(t?.data)) setHouseTheses(t.data);
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
  const [refreshingIntel, setRefreshingIntel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ phase: string; items: string[] } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [dragOverChat, setDragOverChat] = useState(false);

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
  const refreshIntel = async () => {
    setRefreshingIntel(true);
    setRefreshProgress({ phase: "연결 중…", items: [] });
    const items: string[] = [];
    try {
      const res = await fetch(API_BASE + "/market-intelligence/refresh-stream");
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
            if (evt.type === "phase") setRefreshProgress({ phase: evt.msg || "", items: [...items] });
            else if (evt.type === "article_read") { items.push(`📰 ${evt.source} · ${evt.title}`); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); }
            else if (evt.type === "article_selected") { items.push(`✓ 선택됨 · ${evt.title}`); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); }
            else if (evt.type === "article_analyzing" && evt.status === "done") { items.push(`⬡ 분석 완료 · ${evt.title}`); setRefreshProgress((p) => ({ phase: p?.phase ?? "", items: items.slice(-60) })); }
            else if (evt.type === "result" && Array.isArray(evt.data)) setIntel(evt.data);
          } catch { /* skip malformed */ }
        }
      }
    } catch { /* ignore */ } finally { setRefreshingIntel(false); setRefreshProgress(null); }
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

  const runSimulation = async (text?: string) => {
    const vt = (text ?? viewText).trim();
    if ((!vt && attached.length === 0) || running) return;
    setViewText(vt);
    setRunning(true); setLiveTrace(""); setLoadingStep(0); setParsedViews([]);
    // Fold any chat-attached market-intel sources into the view as structured references
    // ("[Source - Title]: summary") — the view-parsing prompt cites these directly.
    const composed = attached.length
      ? `${vt}\n\n--- [첨부된 마켓 인텔리전스] ---\n${attached.map((a) => `[${a.source || a.author || "출처"} - ${a.title}]: ${a.ai_interpretation?.summary || a.content || ""}`).join("\n")}`.trim()
      : vt;
    try {
      const res = await fetch(API_BASE + "/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view_text: composed, optimizer: "ensemble", max_deviation: 0.05 }),
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
    } catch { /* offline → tabs keep mock */ } finally { setRunning(false); }
  };

  const submitDraft = () => { const t = draft.trim(); if ((!t && attached.length === 0) || running) return; setDraft(""); runSimulation(t); };

  // Demo auto-runs a sample optimization on mount; new-user mode starts empty (no input yet).
  useEffect(() => { if (!isNew) runSimulation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hasRun = !!sim || running || liveTrace.length > 0;

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
        .etc-scroll::-webkit-scrollbar{ width:8px; height:8px; }
        .etc-scroll::-webkit-scrollbar-thumb{ background:#1e1e1e; border-radius:4px; }
        .etc-scroll::-webkit-scrollbar-track{ background:transparent; }
        .etc-bar:hover .etc-tip{ opacity:1; }
        .etc-bar:hover .etc-fill{ filter:brightness(1.25); }
      `}</style>

      {/* ============ TOP NAV ============ */}
      <div style={{ height: 54, flex: "0 0 54px", borderBottom: `1px solid ${C.b1}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FA, fontWeight: 800, fontSize: 16, letterSpacing: ".5px" }}>Etacolla</span>
          <span style={{ width: 1, height: 18, background: "#222" }} />
          <span style={{ fontSize: 10.5, color: C.t4, letterSpacing: ".2px" }}>your personal macro asset allocation analyst</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.b5}`, padding: "5px 11px", borderRadius: 4 }}>
            <span style={{ fontSize: 9, fontFamily: FA, letterSpacing: "1.5px", color: "#6b6b6b" }}>MARKET REGIME</span>
            <span style={{ fontSize: 9, fontFamily: FM, fontWeight: 600, letterSpacing: "1px", color: regimeColor, background: `${regimeColor}1a`, border: `1px solid ${regimeColor}40`, padding: "2px 7px", borderRadius: 3 }}>{regimeLabel}</span>
          </div>
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
          </div>

          <div ref={threadRef} className="etc-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 17 }}>
            <Msg who="Chris" role="PM · 최고투자전략가" avatarColor={C.white}>
              {isNew
                ? <>안녕하세요, 저는 <b style={{ color: "#fff" }}>Chris</b>입니다 — 이 데스크의 최고투자전략가예요. 바로 의견을 주셔도 좋지만, 그 전에 오른쪽 탭에서 시장을 먼저 둘러보시길 권합니다: <b style={{ color: "#fff" }}>매크로</b>로 현재 국면과 지표를, <b style={{ color: "#fff" }}>인텔리전스</b>로 큐레이션된 뉴스·리서치를, <b style={{ color: "#fff" }}>리서치</b> 파이프라인으로 하우스 논거를 확인하실 수 있어요. 준비되시면 아래에 시장에 대한 생각을 입력해 주세요 — Ben과 매크로 데스크가 근거를 모으고 제가 배분으로 옮겨드리겠습니다.</>
                : "안녕하세요. 오늘 시장을 어떻게 보고 계신가요? 편하게 말씀해 주시면 Ben(마켓)과 매크로 데스크가 근거를 모으고, 제가 최종 검토해 배분으로 옮겨드리겠습니다."}
            </Msg>

            {/* user bubble */}
            {viewText && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: 330, background: "#fff", color: "#000", fontSize: 13, lineHeight: 1.6, padding: "11px 14px", borderRadius: "14px 14px 4px 14px" }}>{viewText}</div>
              </div>
            )}

            {(!isNew || hasRun) && (<>
            {/* Ben */}
            <Msg who="Ben" role="마켓 인텔리전스 애널리스트" avatarColor={C.cyan} avatarBg="rgba(34,211,238,.12)" avatarBorder="rgba(34,211,238,.35)">
              <span>뉴스 <b style={{ color: "#fff" }}>12</b>건 · 리서치 <b style={{ color: "#fff" }}>5</b>건 · 회원님 업로드 <b style={{ color: "#fff" }}>2</b>건을 검토했습니다. 해외주식 우위 의견을 <b style={{ color: C.cyan }}>뒷받침하는 근거</b>가 우세합니다.</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                <SrcRow tag="뉴스" text="엔비디아 실적 서프라이즈 — AI 설비투자 지속" score="+0.71" sc={C.up} />
                <SrcRow tag="리서치" text="미 연준 2026 금리 인하 사이클 진입 전망" score="+0.74" sc={C.up} />
                <SrcRow tag="내 자산" tagCyan text="KB증권 2026 자산시장 전망.pdf" score="중립" sc="#888" />
              </div>
              <DeskBtn>마켓 인텔리전스 열기 →</DeskBtn>
            </Msg>

            {/* Jerry */}
            <Msg who="Jerry" role="선임 PM · 매크로 데스크" avatarColor={C.amber}>
              매크로 데스크의 강세·약세 논쟁을 종합했습니다.
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                <BullBear kind="BULL" color={C.up} bg="rgba(34,197,94,.05)" bd="rgba(34,197,94,.18)" text="금리 인하 + 글로벌 이익 모멘텀 → 위험자산, 특히 해외주식에 우호적." />
                <BullBear kind="BEAR" color={C.red} bg="rgba(239,68,68,.05)" bd="rgba(239,68,68,.18)" text="VIX 23.4 · 원화 약세 지속 → 변동성·환헤지 비용이 상단을 제한." />
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.t1, borderLeft: `2px solid ${C.amber}`, paddingLeft: 11, marginTop: 10 }}><b style={{ color: "#fff" }}>하우스 뷰:</b> 금리 하락 우세 — 채권 비중 소폭 확대, 단 위험 고조 레짐을 반영해 강도는 절제.</div>
              <DeskBtn>매크로 대시보드 열기 →</DeskBtn>
            </Msg>

            {/* Chris synthesis → signals */}
            <Msg who="Chris" role="PM · 검토" avatarColor={C.white}>
              <span>Ben의 근거와 매크로 하우스 뷰를 종합해 <b style={{ color: "#fff" }}>두 가지 신호</b>로 확정했어요. 위 빌더에서 직접 보정하실 수 있습니다.</span>
              <SignalCard idx="신호 01" tag="REL" tagBg={C.violet} title="상대 우위 뷰" a="해외주식" aCol={C.violet} b="국내주식" bCol={C.blue} mid="▸" val="+5.0%" conf={68} confCol={C.violet} left="우위" right="열위" />
              <SignalCard idx="신호 02" tag="ABS" tagBg={C.green} title="금리 하락 → 채권 강세" a="해외채권" aCol={C.green2} b="국내채권" bCol={C.green} mid="·" val="+2.2%" conf={55} confCol={C.green} left="강세" right="약세" />
            </Msg>

            {/* reasoning trace */}
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

            {/* Chris final */}
            <Msg who="Chris" role="PM · 최종 검토" avatarColor={C.white}>
              <span>의견을 반영해 배분을 마무리했습니다. 시장 레짐을 감안해 틸트 강도는 δ 한도 내로 절제했어요. 전체 결과와 제 IC 메모는 오른쪽 탭에서 확인하세요.</span>
              <button style={{ alignSelf: "flex-start", fontFamily: FA, fontWeight: 700, fontSize: 10, letterSpacing: "1px", background: "#fff", color: "#000", border: "none", padding: "8px 14px", borderRadius: 6, cursor: "pointer", marginTop: 10 }} onClick={() => setTab("리포트")}>PM 최종 리포트 →</button>
            </Msg>
            </>)}
          </div>

          {/* composer */}
          <div style={{ flex: "0 0 auto", borderTop: `1px solid #141414`, padding: "11px 16px 13px" }}>
            {attached.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                {attached.map((a) => (
                  <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 250, fontSize: 10, color: C.cyan, background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.3)", borderRadius: 13, padding: "4px 8px 4px 10px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {a.title}</span>
                    <span onClick={() => detachSource(a.id)} style={{ cursor: "pointer", color: C.t4, flex: "0 0 auto" }}>✕</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
              {["이번 주 뉴스 반영", "리스크 한도 조정", "자료 업로드"].map((p) => (
                <span key={p} style={{ fontSize: 10, color: C.t3, border: `1px solid ${C.b3}`, borderRadius: 13, padding: "4px 10px", cursor: "pointer" }}>{p}</span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.chip, border: `1px solid ${C.b4}`, borderRadius: 10, padding: "10px 12px" }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitDraft(); } }}
                disabled={running}
                placeholder={running ? "최적화 중… 잠시만 기다려 주세요" : "시장에 대한 생각을 입력하세요…"}
                style={{ flex: 1, fontSize: 12.5, color: "#eee", background: "transparent", border: "none", outline: "none", fontFamily: FP }}
              />
              <div onClick={submitDraft} style={{ width: 28, height: 28, borderRadius: 7, background: draft.trim() && !running ? "#fff" : "#333", display: "flex", alignItems: "center", justifyContent: "center", color: draft.trim() && !running ? "#000" : "#777", fontSize: 13, cursor: draft.trim() && !running ? "pointer" : "default", flex: "0 0 auto" }}>↑</div>
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
            {tab === "인텔리전스" && <IntelTab intel={intel} onOpen={setIntelOpen} onAttach={attachSource} onDelete={deleteIntel} onRefresh={refreshIntel} refreshing={refreshingIntel} progress={refreshProgress} onIngestUrl={ingestUrl} onIngestPdf={ingestPdf} ingesting={ingesting} />}
            {tab === "매크로" && <MacroTab macro={macro} regime={regime} regimeLabel={regimeLabel} regimeColor={regimeColor} />}
            {tab === "리서치" && <ResearchTab queue={queue} theses={houseTheses} onCollect={runCollect} collecting={collecting} collectProgress={collectProgress} onBuild={buildTheses} building={buildingTheses} msg={researchMsg} onAttachThesis={attachThesis} onDeleteThesis={deleteThesis} onResetTheses={resetTheses} />}
            {tab === "리포트" && (isNew && !hasRun ? <EmptyResults go={setTab} /> : <ReportTab sim={sim} />)}
            {tab === "가이드" && <GuideTab onNavigate={setTab} runSimulation={runSimulation} running={running} />}
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
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar color={avatarColor} bg={avatarBg} border={avatarBorder}>{who[0]}</Avatar>
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
  return ASSET_ORDER.filter((a) => a in opt).map((a) => {
    const dpp = ((opt[a] || 0) - (mkt[a] || 0)) * 100; const up = dpp >= 0;
    return { n: ASSET_KR[a], c: up ? C.up : C.red, h: `${Math.min(48, Math.abs(dpp) * 8)}%`, up, v: `${up ? "+" : "−"}${Math.abs(dpp).toFixed(1)}`, pos: (up ? { top: 6 } : { bottom: 6 }) as React.CSSProperties };
  });
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
          <div style={{ flex: "0 0 30px", width: 30, height: 150, position: "relative" }}>
            {["50%", "40", "30", "20", "10", "0"].map((y, i) => (
              <span key={y} style={{ position: "absolute", right: 3, top: i * 30, transform: "translateY(-50%)", fontSize: 8, fontFamily: FM, color: C.t5 }}>{y}</span>
            ))}
          </div>
          <div style={{ flex: 1, height: 150, position: "relative" }}>
            {[0, 30, 60, 90, 120, 150].map((t) => (<div key={t} style={{ position: "absolute", left: 0, right: 0, top: t, height: 1, background: t === 150 ? "#262626" : "#141414" }} />))}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 26, padding: "0 6px" }}>
              {alloc.map((a) => (
                <div key={a.name} className="etc-bar" style={{ flex: 1, height: 150, display: "flex", alignItems: "flex-end", justifyContent: "center", position: "relative" }}>
                  <div className="etc-tip" style={{ opacity: 0, transition: "opacity .12s ease", pointerEvents: "none", position: "absolute", bottom: 130, left: "50%", transform: "translateX(-50%)", background: "#000", border: `1px solid ${C.b4}`, borderRadius: 6, padding: "6px 9px", fontSize: 10, fontFamily: FM, whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,.5)" }}>
                    <span style={{ color: "#888" }}>벤치</span> {a.bench}% <span style={{ color: C.t6 }}>→</span> <span style={{ color: "#fff" }}>{a.w}%</span> <span style={{ color: a.d >= 0 ? C.up : C.red }}>{a.d >= 0 ? "▲" : "▼"}{Math.abs(a.d)}</span>
                  </div>
                  <div className="etc-fill" style={{ width: "100%", display: "flex", gap: 5, alignItems: "flex-end", height: 150, transformOrigin: "bottom", animation: "growUp .7s cubic-bezier(.2,.7,.2,1) both" }}>
                    <div style={{ flex: 1, background: "#404040", height: (a.bench / maxBar) * 150 }} />
                    <div style={{ flex: 1, background: a.color, height: (a.w / maxBar) * 150 }} />
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
  { n: "해외주식", c: C.up, h: "38%", up: true, v: "+4.8", pos: { top: 6 } as React.CSSProperties },
  { n: "국내주식", c: C.red, h: "30%", up: false, v: "−3.6", pos: { bottom: 24 } as React.CSSProperties },
  { n: "국내채권", c: C.up, h: "13%", up: true, v: "+1.4", pos: { top: 48 } as React.CSSProperties },
  { n: "해외채권", c: C.up, h: "16%", up: true, v: "+1.7", pos: { top: 44 } as React.CSSProperties },
  { n: "대체투자", c: C.red, h: "36%", up: false, v: "−4.3", pos: { bottom: 20 } as React.CSSProperties },
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
        <CardTitle>BL 가중치 시장 편차 (pp)</CardTitle>
        <div style={{ position: "relative", height: 150, display: "flex", alignItems: "center", gap: 26, padding: "0 8px" }}>
          <div style={{ position: "absolute", left: 8, right: 8, top: "50%", height: 1, background: "#262626" }} />
          {DEV.map((d) => (
            <div key={d.n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", position: "relative" }}>
              <div style={{ width: 38, background: d.c, height: d.h, ...(d.up ? { alignSelf: "flex-end", marginBottom: 75 } : { marginTop: 75 }) }} />
              <span style={{ position: "absolute", bottom: 8, fontSize: 10, color: "#aaa" }}>{d.n}</span>
              <span style={{ position: "absolute", ...d.pos, fontSize: 10, fontFamily: FM, color: d.c }}>{d.v}</span>
            </div>
          ))}
        </div>
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

function IntelTab({ intel, onOpen, onAttach, onDelete, onRefresh, refreshing, progress, onIngestUrl, onIngestPdf, ingesting }: {
  intel: any[]; onOpen: (t: any) => void; onAttach: (t: any) => void; onDelete: (id: string) => void; onRefresh: () => void; refreshing: boolean;
  progress: { phase: string; items: string[] } | null; onIngestUrl: (u: string) => void; onIngestPdf: (f: File) => void; ingesting: boolean;
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
          assets: (t.ai_interpretation?.impacted_assets || []) as string[],
          title: t.title || "(제목 없음)",
          body: `${t.ai_interpretation?.summary || t.content || ""}`.slice(0, 165),
          src: t.author || t.source || "출처 미상",
          border: isAsset ? "rgba(34,211,238,.3)" : C.b5,
          raw: t as any,
        };
      })
    : INTEL_CARDS.map((c) => ({ ...c, date: "2026-06-28", assets: [] as string[], raw: null as any }));
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
              style={{ border: `1px solid ${c.border}`, background: C.card, borderRadius: 9, padding: 16, cursor: c.raw ? "pointer" : "default", transition: "border-color .12s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <Tag kind={c.tag} style={c.tagStyle} />
                {c.date && <span style={{ fontSize: 9.5, fontFamily: FM, color: C.t5 }}>{c.date}</span>}
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

const MACRO_IND = [
  ["US 10Y", "4.18%", "▼", C.up], ["DXY", "104.2", "▲", C.red], ["USD/KRW", "1,382", "▲", C.red], ["WTI", "$71.3", "▼", C.up],
  ["GOLD", "$2,340", "▲", C.red], ["KOSPI", "2,610", "▼", C.red], ["S&P 500", "5,420", "▲", C.up], ["KR 3Y", "3.02%", "▼", C.up],
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
];
const HEAT_PROXY: [string, string][] = [["국내株", "KOSPI"], ["해외株", "SPY"], ["국내債", "US10Y"], ["해외債", "HYG"], ["대체", "GOLD"]];

function heatCell(v: number): [string, string, string] {
  const s = v >= 0.999 ? "1.00" : v.toFixed(2).replace(/^(-?)0\./, "$1.");
  if (v >= 0.999) return [s, "#171717", "#fff"];
  const a = Math.min(0.5, Math.abs(v) * 0.55 + 0.04);
  if (v >= 0) return [s, `rgba(16,185,129,${a.toFixed(2)})`, v > 0.45 ? "#fff" : "#a7f3d0"];
  return [s, `rgba(239,68,68,${a.toFixed(2)})`, "#fca5a5"];
}

function MacroTab({ macro, regime, regimeLabel, regimeColor }: { macro: any; regime: string; regimeLabel: string; regimeColor: string }) {
  const vix = macro?.VIX;
  const regimeCards = [
    { l: "감지된 시장 레짐", v: macro ? regimeLabel : "위험 고조", vc: macro ? regimeColor : C.amber, d: REGIME_DESC[regime] || "RISK-OFF · 주식 비중 확대에 신중" },
    { l: "VIX 변동성", v: vix ? String(vix.current) : "23.4", vc: C.white, arrow: vix ? (vix.change_1d >= 0 ? "▲" : "▼") : "▲", ac: vix ? (vix.change_1d >= 0 ? C.red : C.up) : C.red, d: "장기 평균 상회" },
    { l: "위험회피 배율 λ", v: REGIME_LAMBDA[regime] || "1.25×", vc: C.white, d: "방어적 배분으로 상향" },
  ];

  const indCells: [string, string, string, string][] = macro
    ? MACRO_IND_SPEC.flatMap(([label, key]) => {
        const d = macro[key];
        if (!d || typeof d.current !== "number") return [];
        const up = (d.change_1d ?? 0) >= 0;
        return [[label, fmtQuote(key, d.current), up ? "▲" : "▼", up ? C.up : C.red]] as [string, string, string, string][];
      })
    : (MACRO_IND as [string, string, string, string][]);

  const cm = macro?.correlation_matrix;
  const heatRows: [string, string, string][][] | null = cm
    ? HEAT_PROXY.map(([, k1]) => HEAT_PROXY.map(([, k2]) => {
        const raw = k1 === k2 ? 1 : Number(cm?.[k1]?.[k2] ?? cm?.[k2]?.[k1] ?? 0);
        return heatCell(isFinite(raw) ? raw : 0);
      }))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12 }}>
        {regimeCards.map((r) => (
          <Card key={r.l} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 8.5, fontFamily: FA, letterSpacing: "1.5px", color: C.t5 }}>{r.l}</span>
            <span style={{ fontFamily: FA, fontSize: 20, fontWeight: 700, color: r.vc }}>{r.v} {r.arrow && <span style={{ fontSize: 11, color: r.ac }}>{r.arrow}</span>}</span>
            <span style={{ fontSize: 10.5, color: "#888" }}>{r.d}</span>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle right={macro ? "실시간" : undefined}>실시간 매크로 지표</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.b1, border: `1px solid ${C.b1}`, borderRadius: 6, overflow: "hidden" }}>
          {indCells.map(([k, v, a, ac]) => (
            <div key={k} style={{ background: C.card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 9, color: C.t5, fontFamily: FM }}>{k}</span>
              <span style={{ fontFamily: FA, fontSize: 16, fontWeight: 700 }}>{v} <span style={{ fontSize: 10, color: ac }}>{a}</span></span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
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

const ASSET_HEX: Record<string, string> = { KR_STOCK: "#3B82F6", GLOBAL_STOCK: "#A78BFA", KR_BOND: "#34D399", GLOBAL_BOND: "#6EE7B7", ALTERNATIVE: "#FBBF24" };
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
  { name: "해외주식", color: C.violet, w: 39.5, d: 4.8, bench: 34.7 },
  { name: "국내주식", color: C.blue, w: 17.2, d: -3.6, bench: 20.8 },
  { name: "국내채권", color: C.green, w: 24.5, d: 1.4, bench: 23.1 },
  { name: "해외채권", color: C.green2, w: 9.1, d: 1.7, bench: 7.4 },
  { name: "대체투자", color: C.amber, w: 9.7, d: -4.3, bench: 14.0 },
];
const SOURCES_MOCK: [string, string, string, string, string][] = [
  ["리서치", "fill", "미 연준 2026 금리 인하 전망 · NPS 하우스뷰", "74%", C.up],
  ["뉴스", "outline", "엔비디아 실적 서프라이즈 · Reuters", "68%", C.up],
  ["내 자산", "cyan", "KB증권 2026 자산시장 전망.pdf · 회원 업로드", "55%", "#888"],
  ["뉴스", "outline", "원/달러 1,380원 돌파 · 연합인포맥스", "61%", C.amber],
];

function ReportTab({ sim }: { sim: any }) {
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
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>{current.title}</h4>
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
