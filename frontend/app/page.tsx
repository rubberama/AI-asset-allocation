"use client";

import React, { useState, useEffect, useRef } from "react";
import { translations, type Lang } from "./translations";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, ReferenceLine, ScatterChart, Scatter, Cell
} from "recharts";
import { 
  TrendingUp, ShieldAlert, Cpu, BarChart3, LineChart as LineIcon, 
  RefreshCw, Play, AlertCircle, Info, History, Globe, Newspaper,
  MessageSquare, CheckCircle2, ChevronRight, Check, ArrowUpCircle, Upload,
  Download, FileText
} from "lucide-react";

// Asset translation
const ASSET_LABELS: Record<string, string> = {
  KR_STOCK: "국내주식 (EWY)",
  GLOBAL_STOCK: "해외주식 (VT)",
  KR_BOND: "국내채권 (KBSTAR)",
  GLOBAL_BOND: "해외채권 (BNDX)",
  ALTERNATIVE: "대체투자 (VNQ)"
};

const VERSION = "v0.4.0";

// Consistent color identity for the 5 NPS asset classes — used in all charts and tags.
const ASSET_COLORS: Record<string, string> = {
  KR_STOCK:     "#3B82F6",   // korea blue
  GLOBAL_STOCK: "#A78BFA",   // global violet
  KR_BOND:      "#34D399",   // safe local emerald
  GLOBAL_BOND:  "#6EE7B7",   // safe global teal
  ALTERNATIVE:  "#FBBF24",   // amber
};

// Short labels for charts
const ASSET_SHORT: Record<string, string> = {
  KR_STOCK: "국내주식",
  GLOBAL_STOCK: "해외주식",
  KR_BOND: "국내채권",
  GLOBAL_BOND: "해외채권",
  ALTERNATIVE: "대체투자",
};

interface ViewItem {
  view_type: "absolute" | "relative";
  asset?: string;
  asset1?: string;
  asset2?: string;
  expected_return?: number;
  outperformance?: number;
  confidence: number;
  thesis?: string;
  sources?: string[];
}

interface ViewAttribution {
  asset: string;
  prior_return: number;
  posterior_return: number;
  delta_pp: number;
  driving_views: {
    view_type: string;
    confidence: number;
    thesis?: string;
    sources?: string[];
    expected_return?: number;
    outperformance?: number;
    asset?: string;
    asset1?: string;
    asset2?: string;
  }[];
}

interface SimulationData {
  simulation_id: number;
  title?: string;
  optimizer?: string;
  market_weights: Record<string, number>;
  parsed_views: ViewItem[];
  view_attribution?: ViewAttribution[];
  risk_free_rate: number;
  prior_returns: Record<string, number>;
  posterior_returns: Record<string, number>;
  optimized_weights: Record<string, number>;
  efficient_frontier?: {
    return: number;
    volatility: number;
    sharpe: number;
    weights: Record<string, number>;
  }[];
  benchmark_portfolio?: {
    return: number;
    volatility: number;
    sharpe: number;
  };
  optimized_portfolio?: {
    return: number;
    volatility: number;
    sharpe: number;
  };
  risk_metrics: {
    expected_return: number;
    volatility: number;
    var_95: number;
    cvar_95: number;
    max_drawdown_estimate: number;
    simulation_paths: number[][];
    histogram_data: { x: number; y: number }[];
  };
  risk_aversion?: number;
  tau?: number;
  macro_context?: Record<string, any>;
  ai_commentary?: string;
  pm_memo?: any;
  min_variance_fallback?: boolean;
  historical_stress_tests?: {
    name: string;
    name_kr: string;
    portfolio_return: number;
    asset_impacts: Record<string, number>;
  }[];
}

interface SimulationMeta {
  id: number;
  created_at: string;
  title?: string;
  user_view: string;
  optimizer: string;
}

type TabType = "SIMULATOR" | "INTELLIGENCE" | "MACRO" | "RESEARCH" | "HELP";

interface Thesis {
  id: string;
  author: string;
  author_title: string;
  source: string;
  date: string;
  title: string;
  content: string;
  image_url: string;
  category?: "RESEARCH" | "NEWS" | "USER_ASSET";
  ai_interpretation: {
    summary: string;
    impacted_assets: string[];
    confidence: number;
  };
  full_report?: {
    executive_summary: string;
    rationale: string;
    target_assets: any;
    recommendation: string;
    risk_factors: string;
    source_url?: string;
  };
}

export default function Dashboard() {
  // Language toggle
  const [lang, setLang] = useState<Lang>('ko');
  const t = translations[lang];

  // User Inputs
  const [viewText, setViewText] = useState("해외주식이 국내주식보다 연 5% 우세할 것 같다. 그리고 금리는 하락할 것이다.");
  const [optimizer, setOptimizer] = useState("ensemble");
  const [maxDeviation, setMaxDeviation] = useState<number>(0.05); // Default 5%
  
  // App States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SimulationData | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000");
  const [simulationsList, setSimulationsList] = useState<SimulationMeta[]>([]);

  // Streaming States
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [thinkingText, setThinkingText] = useState<string>("");
  const [showThinking, setShowThinking] = useState<boolean>(true);

  // Tab & New Feature States
  const [activeTab, setActiveTab] = useState<TabType>("INTELLIGENCE");
  const [intelligenceFeed, setIntelligenceFeed] = useState<Thesis[]>([]);
  const [macroData, setMacroData] = useState<any | null>(null);
  const [selectedTheses, setSelectedTheses] = useState<string[]>([]);
  const [userComments, setUserComments] = useState<Record<string, string>>({});
  const [isFetchingMacro, setIsFetchingMacro] = useState(false);
  const [selectedThesisId, setSelectedThesisId] = useState<string | null>(null);
  const [isRefreshingIntel, setIsRefreshingIntel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{phase: string; items: string[]}| null>(null);

  // URL / article ingestion states
  const [articleUrl, setArticleUrl] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestNeedsContent, setIngestNeedsContent] = useState(false);
  const [pastedContent, setPastedContent] = useState("");
  const [ingestNotice, setIngestNotice] = useState<string | null>(null);

  // Research pipeline (Stage 1→2→3) states
  const [researchQueue, setResearchQueue] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);
  const [allocation, setAllocation] = useState<any | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isBuildingTheses, setIsBuildingTheses] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);

  // Search, Category, and Sorting States
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"RESEARCH" | "NEWS" | "USER_ASSET">("NEWS");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "EQUITY" | "BOND" | "ALTERNATIVE" | "MACRO">("ALL");
  const [sortMode, setSortMode] = useState<"CHRONOLOGICAL" | "RANKED">("CHRONOLOGICAL");
  const [isPromoting, setIsPromoting] = useState(false);
  const [isDragOverDock, setIsDragOverDock] = useState(false);
  const [showRunConfirmModal, setShowRunConfirmModal] = useState(false);
  const [selectedMacroKey, setSelectedMacroKey] = useState<string>("SPY");
  const [selectedTimeframe, setSelectedTimeframe] = useState<"1M" | "3M" | "6M" | "1Y">("3M");
  const [compareMacroKey, setCompareMacroKey] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedCell, setSelectedCell] = useState<{ x: string; y: string } | null>(null);
  const [isDragOverBox3, setIsDragOverBox3] = useState(false);
  const [activeHelpStep, setActiveHelpStep] = useState<number>(1);
  // Promotion queue for Box 3 (batch promote)
  const [promotionQueue, setPromotionQueue] = useState<string[]>([]);
  const [batchPromoteProgress, setBatchPromoteProgress] = useState<string | null>(null);

  // Auto-scroll ref for the thinking panel
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [thinkingText]);

  // Computed global rank map based on confidence
  const globalRankMap = React.useMemo(() => {
    const sortedAll = [...intelligenceFeed].sort(
      (a, b) => (b.ai_interpretation?.confidence ?? 0) - (a.ai_interpretation?.confidence ?? 0)
    );
    const ranks: Record<string, number> = {};
    sortedAll.forEach((t, index) => {
      ranks[t.id] = index + 1;
    });
    return ranks;
  }, [intelligenceFeed]);

  // Computed filtered and sorted feed
  const filteredAndSortedFeed = React.useMemo(() => {
    // First, filter by source type (RESEARCH, NEWS, USER_ASSET)
    let result = intelligenceFeed.filter(thesis => {
      const cat = thesis.category || "NEWS";
      return cat === sourceFilter;
    });

    // 1. Category Filter (Subcategory)
    if (categoryFilter !== "ALL") {
      result = result.filter(thesis => {
        const assets = thesis.ai_interpretation?.impacted_assets || [];
        if (categoryFilter === "EQUITY") {
          return assets.includes("KR_STOCK") || assets.includes("GLOBAL_STOCK");
        }
        if (categoryFilter === "BOND") {
          return assets.includes("KR_BOND") || assets.includes("GLOBAL_BOND");
        }
        if (categoryFilter === "ALTERNATIVE") {
          return assets.includes("ALTERNATIVE");
        }
        if (categoryFilter === "MACRO") {
          // Macro is anything that doesn't belong to Equity, Bond, or Alternatives
          return !assets.some(a => ["KR_STOCK", "GLOBAL_STOCK", "KR_BOND", "GLOBAL_BOND", "ALTERNATIVE"].includes(a));
        }
        return true;
      });
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(thesis => 
        (thesis.title ?? "").toLowerCase().includes(q) ||
        (thesis.content ?? "").toLowerCase().includes(q) ||
        (thesis.author ?? "").toLowerCase().includes(q) ||
        (thesis.source ?? "").toLowerCase().includes(q)
      );
    }

    // 3. Sorting
    if (sortMode === "RANKED") {
      result.sort((a, b) => (b.ai_interpretation?.confidence ?? 0) - (a.ai_interpretation?.confidence ?? 0));
    } else {
      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return result;
  }, [intelligenceFeed, sourceFilter, categoryFilter, searchQuery, sortMode]);


  // Fetch initial data (no auto-run simulation)
  useEffect(() => {
    fetchSimulationsList();
    fetchIntelligenceFeed();
    fetchMacroData();
    fetchResearchQueue();
    fetchTheses();
  }, []);

  const fetchIntelligenceFeed = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/market-intelligence`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        setIntelligenceFeed(data);
        if (data.length > 0) {
          setSelectedThesisId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch intelligence:", err);
    }
  };

  const handleRefreshIntelligence = async () => {
    setIsRefreshingIntel(true);
    setRefreshProgress({ phase: "Connecting...", items: [] });
    try {
      const response = await fetch(`${apiBaseUrl}/market-intelligence/refresh-stream`);
      if (!response.body) throw new Error("No stream body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const items: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") {
              setRefreshProgress({ phase: evt.msg, items: [...items] });
            } else if (evt.type === "article_read") {
              items.push(`📰 ${evt.source}: ${evt.title}`);
              setRefreshProgress(p => ({ phase: p?.phase ?? "", items: [...items].slice(-20) }));
            } else if (evt.type === "article_selected") {
              items.push(`✓ Selected: ${evt.title}`);
              setRefreshProgress(p => ({ phase: p?.phase ?? "", items: [...items].slice(-20) }));
            } else if (evt.type === "article_analyzing") {
              if (evt.status === "done") {
                items.push(`⬡ Analyzed: ${evt.title}`);
                setRefreshProgress(p => ({ phase: p?.phase ?? "", items: [...items].slice(-20) }));
              }
            } else if (evt.type === "result") {
              const data = evt.data || [];
              setIntelligenceFeed(data);
              if (data.length > 0) setSelectedThesisId(data[0].id);
            } else if (evt.type === "done") {
              break;
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      console.error("Failed to refresh intelligence:", err);
    } finally {
      setIsRefreshingIntel(false);
      setRefreshProgress(null);
    }
  };

  // Submit an article URL (or pasted content) for AI analysis into a thesis.
  // If the backend can't fetch the URL, it returns status "needs_content" and
  // we reveal a textarea asking the user to paste the article body.
  const handleIngestArticle = async () => {
    const url = articleUrl.trim();
    const content = pastedContent.trim();
    if (!url && !content) return;

    setIsIngesting(true);
    setIngestError(null);
    setIngestNotice(null);
    try {
      const res = await fetch(`${apiBaseUrl}/market-intelligence/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url || null, content: content || null }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "분석 요청에 실패했습니다.");
      }

      const json = await res.json();

      if (json.status === "needs_content") {
        // URL not fetchable — prompt the user to paste the article body.
        setIngestNeedsContent(true);
        setIngestNotice(json.message || "URL 본문을 불러오지 못했습니다. 기사 내용을 붙여넣어 주세요.");
        return;
      }

      if (json.status === "ok") {
        const data = json.data || [];
        setIntelligenceFeed(data);
        if (json.thesis?.id) {
          setSelectedThesisId(json.thesis.id);
        }
        // Reset the input UI on success.
        setArticleUrl("");
        setPastedContent("");
        setIngestNeedsContent(false);
        setIngestNotice("기사를 분석하여 새로운 투자 의견(Thesis)을 생성했습니다.");
      }
    } catch (err: any) {
      console.error("Failed to ingest article:", err);
      setIngestError(err?.message || "분석 중 오류가 발생했습니다.");
    } finally {
      setIsIngesting(false);
    }
  };

  // Upload a PDF (research report / policy paper) → extract text → analyze into a thesis.
  const handleIngestPdf = async (file: File) => {
    setIsIngesting(true);
    setIngestError(null);
    setIngestNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBaseUrl}/market-intelligence/from-pdf`, { method: "POST", body: form });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "PDF 분석에 실패했습니다.");
      }
      const json = await res.json();
      if (json.status === "needs_content") {
        setIngestNeedsContent(true);
        setIngestNotice(json.message || "PDF 본문을 추출하지 못했습니다. 내용을 붙여넣어 주세요.");
        return;
      }
      if (json.status === "ok") {
        setIntelligenceFeed(json.data || []);
        if (json.thesis?.id) setSelectedThesisId(json.thesis.id);
        setIngestNotice(`PDF(${file.name})를 분석하여 새로운 투자 의견(Thesis)을 생성했습니다.`);
      }
    } catch (err: any) {
      console.error("Failed to ingest PDF:", err);
      setIngestError(err?.message || "PDF 분석 중 오류가 발생했습니다.");
    } finally {
      setIsIngesting(false);
    }
  };

  // ---- Research pipeline handlers ----
  const fetchResearchQueue = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/research/queue?limit=30`);
      if (res.ok) setResearchQueue((await res.json()).data || []);
    } catch (err) { console.error("queue fetch failed:", err); }
  };

  const fetchTheses = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/theses`);
      if (res.ok) setTheses((await res.json()).data || []);
    } catch (err) { console.error("theses fetch failed:", err); }
  };

  const handleCollect = async () => {
    setIsCollecting(true);
    setResearchMsg("매크로 소스(FRED·GDELT·Marketaux)에서 정보를 수집하고 있습니다…");
    try {
      const res = await fetch(`${apiBaseUrl}/research/collect`, { method: "POST" });
      const json = await res.json();
      const s = json.summary || {};
      setResearchMsg(
        `✓ 수집 완료 (총 ${s.total_in_store ?? 0}건) — FRED ${s.fred ?? 0} · GDELT ${s.gdelt ?? 0} · Marketaux ${s.marketaux ?? 0} · ECOS ${s.ecos ?? 0} · CFTC ${s.cftc ?? 0} · ETF Flows ${s.etf_flows ?? 0} · Central Banks ${s.central_banks ?? 0} · Bank Research ${s.bank_research ?? 0} · News Feeds ${s.news_feeds ?? 0}`
      );
      await fetchResearchQueue();
    } catch (err) {
      setResearchMsg("수집 중 오류가 발생했습니다.");
    } finally { setIsCollecting(false); }
  };

  const handleBuildTheses = async () => {
    setIsBuildingTheses(true);
    setResearchMsg("DeepSeek R1 추론 모델이 Bull·Bear 페르소나로 리서치 큐를 분석한 후 포트폴리오 매니저 시각으로 하우스 뷰를 통합하고 있습니다. 최대 3분 소요될 수 있습니다…");
    try {
      const res = await fetch(`${apiBaseUrl}/thesis/build`, { method: "POST" });
      const json = await res.json();
      const built = json.data || [];
      if (built.length > 0) {
        setTheses(built);
      } else {
        await fetchTheses();
      }
      setResearchMsg(`✓ ${(built.length > 0 ? built : theses).length}개의 보정된 하우스 뷰를 생성했습니다. DRAG → Stage 3으로 이동 후 PROMOTE하세요.`);
    } catch (err) {
      setResearchMsg("Thesis 생성 중 오류가 발생했습니다. 모델 응답이 지연될 수 있습니다 — 잠시 후 다시 시도하세요.");
      await fetchTheses();
    } finally { setIsBuildingTheses(false); }
  };

  const setThesisStatus = async (id: string, status: string) => {
    try {
      await fetch(`${apiBaseUrl}/theses/${id}/status?status=${status}`, { method: "POST" });
      setTheses(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch (err) { console.error("status update failed:", err); }
  };

  const handleAllocate = async () => {
    setIsAllocating(true);
    setResearchMsg("승인된 Thesis를 Idzorek 보정 Black-Litterman + 레짐 조정으로 자산배분을 계산하고 있습니다…");
    try {
      const res = await fetch(`${apiBaseUrl}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optimizer, max_deviation: maxDeviation, use_theses: true }),
      });
      const json = await res.json();
      setAllocation(json);
      setResearchMsg(`자산배분 완료 (레짐: ${json.regime}, 사용된 뷰: ${json.n_views}개).`);
    } catch (err) {
      setResearchMsg("자산배분 계산 중 오류가 발생했습니다.");
    } finally { setIsAllocating(false); }
  };

  const fetchMacroData = async (refresh = false) => {
    setIsFetchingMacro(true);
    try {
      const res = await fetch(`${apiBaseUrl}/macro-data${refresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const json = await res.json();
        setMacroData(json.data || null);
      }
    } catch (err) {
      console.error("Failed to fetch macro:", err);
    } finally {
      setIsFetchingMacro(false);
    }
  };

  const fetchSimulationsList = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/simulations`);
      if (res.ok) {
        const list = await res.json();
        setSimulationsList(list);
      }
    } catch (err) {
      console.error("Failed to fetch simulations list:", err);
    }
  };

  // Thesis selection handlers
  const toggleThesisSelection = (id: string) => {
    setSelectedTheses(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const updateComment = (id: string, comment: string) => {
    setUserComments(prev => ({...prev, [id]: comment}));
  };

  const applyToSimulator = (customOptimizer?: string, customDeviation?: number) => {
    if (selectedTheses.length === 0) return;
    
    let combinedViewText = "";
    combinedViewText += "--- [Selected Market Intelligence] ---\n";
    
    selectedTheses.forEach(id => {
      const thesis = intelligenceFeed.find(t => t.id === id);
      if (thesis) {
        combinedViewText += `[${thesis.author} - ${thesis.title}]: ${thesis.content}\n`;
        const userComment = userComments[id];
        if (userComment) {
          combinedViewText += `User Feedback/Adjustment: ${userComment}\n`;
        }
        combinedViewText += "\n";
      }
    });
    
    setViewText(combinedViewText);
    setActiveTab("SIMULATOR");
    handleRunSimulation(combinedViewText, customOptimizer, customDeviation);
  };

  const handlePromoteThesis = async (thesisId: string) => {
    setIsPromoting(true);
    setResearchMsg("연구의견(Thesis)을 Market Intelligence로 격상하며 보고서 상세 분석을 수행하고 있습니다...");
    try {
      const res = await fetch(`${apiBaseUrl}/market-intelligence/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_id: thesisId })
      });
      if (res.ok) {
        setResearchMsg("성공적으로 연구의견을 Market Intelligence 탭으로 이전했습니다.");
        await fetchIntelligenceFeed();
        await fetchResearchQueue();
        await fetchTheses();
        setSourceFilter("RESEARCH"); // Switch filter to RESEARCH to see it immediately!
      } else {
        const detail = await res.json().catch(() => ({}));
        setResearchMsg(`이전 실패: ${detail?.detail || "알 수 없는 오류"}`);
      }
    } catch (err: any) {
      console.error(err);
      setResearchMsg(`이전 오류: ${err?.message}`);
    } finally {
      setIsPromoting(false);
    }
  };

  const handleBatchPromote = async () => {
    if (promotionQueue.length === 0) return;
    setIsPromoting(true);
    setBatchPromoteProgress(`Analyzing ${promotionQueue.length} thesis${promotionQueue.length > 1 ? 'es' : ''} in parallel...`);
    try {
      const res = await fetch(`${apiBaseUrl}/market-intelligence/promote-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis_ids: promotionQueue })
      });
      if (res.ok) {
        const result = await res.json();
        const count = result.promoted_count ?? promotionQueue.length;
        setBatchPromoteProgress(null);
        setResearchMsg(`✓ ${count} thesis${count > 1 ? 'es' : ''} promoted to Market Intelligence.`);
        setPromotionQueue([]);
        await fetchIntelligenceFeed();
        await fetchTheses();
        setActiveTab("INTELLIGENCE" as any);
        setSourceFilter("RESEARCH");
      } else {
        const detail = await res.json().catch(() => ({}));
        setBatchPromoteProgress(null);
        setResearchMsg(`Promotion failed: ${detail?.detail || "Unknown error"}`);
      }
    } catch (err: any) {
      setBatchPromoteProgress(null);
      setResearchMsg(`Error: ${err?.message}`);
    } finally {
      setIsPromoting(false);
    }
  };

  const renderReportField = (val: any) => {
    if (val === null || val === undefined) return null;
    if (typeof val === "object") {
      if (Array.isArray(val)) {
        return val.join(", ");
      }
      return (
        <div className="flex flex-col gap-1.5 pl-2.5 border-l border-neutral-900 mt-1 font-sans">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="text-xs leading-relaxed">
              <span className="font-display uppercase text-[9px] tracking-wider text-neutral-500 font-bold mr-1.5">{k.replace("_", " ")}:</span>
              <span className="text-neutral-300">{String(v)}</span>
            </div>
          ))}
        </div>
      );
    }
    return String(val);
  };

  const handleRunSimulation = async (customViewText?: string, customOptimizer?: string, customDeviation?: number) => {
    setIsLoading(true);
    setError(null);
    setLoadingStep(0);
    setLoadingMessage("서버와의 연결을 초기화하고 있습니다...");
    setData(null);
    setThinkingText("");
    setShowThinking(true);
    
    const textToUse = customViewText !== undefined ? customViewText : viewText;
    const optToUse = customOptimizer !== undefined ? customOptimizer : optimizer;
    const devToUse = customDeviation !== undefined ? customDeviation : maxDeviation;
    
    try {
      const response = await fetch(`${apiBaseUrl}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          view_text: textToUse, 
          optimizer: optToUse,
          max_deviation: devToUse
        }),
      });
      
      if (!response.ok) {
        throw new Error("서버 연결에 실패했습니다. 포트 8000에서 FastAPI 백엔드가 실행 중인지 확인하세요.");
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("스트리밍 응답을 읽을 수 없습니다.");
      }
      
      const decoder = new TextDecoder();
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.error) {
              throw new Error(payload.error);
            }
            
            if (payload.step) {
              setLoadingStep(payload.step);
            }
            if (payload.message) {
              setLoadingMessage(payload.message);
            }
            if (payload.type === "thinking" && payload.chunk) {
              setThinkingText(prev => prev + payload.chunk);
            }
            if (payload.step === 9 && payload.data) {
              setData(payload.data);
            }
          } catch (e: any) {
            if (e.message && e.message !== "Unexpected token") {
              throw e;
            }
            console.error("Failed to parse JSON stream line:", line, e);
          }
        }
      }
      fetchSimulationsList();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "서버 계산 오류가 발생했습니다. FastAPI 로그를 확인하세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleLoadSimulation = async (simId: number) => {
    setIsLoading(true);
    setError(null);
    setLoadingStep(0);
    setLoadingMessage("서버에서 시뮬레이션 기록을 복원하고 있습니다...");
    setData(null);
    
    try {
      const res = await fetch(`${apiBaseUrl}/simulations/${simId}`);
      if (!res.ok) {
        throw new Error("시뮬레이션 데이터를 가져오는데 실패했습니다.");
      }
      const result = await res.json();
      setData(result);
      setViewText(result.user_view || "");
      setOptimizer(result.optimizer || "markowitz");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "시뮬레이션 불러오기 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // Format Helper
  const formatPercent = (val: number) => `${(val * 100).toFixed(2)}%`;
  
  // Process data for charts
  const getWeightsData = () => {
    if (!data) return [];
    return Object.keys(data.market_weights).map(asset => ({
      name: ASSET_SHORT[asset] || asset,
      asset,
      "국민연금": Math.round(data.market_weights[asset] * 1000) / 10,
      "최적화": Math.round(data.optimized_weights[asset] * 1000) / 10,
      delta: Math.round((data.optimized_weights[asset] - data.market_weights[asset]) * 1000) / 10,
      color: ASSET_COLORS[asset] || "#ffffff",
    }));
  };

  const getGroupedWeightsData = () => {
    if (!data) return [];
    return Object.keys(data.market_weights).map(asset => ({
      name: ASSET_SHORT[asset] || asset,
      asset,
      benchmark: Math.round(data.market_weights[asset] * 1000) / 10,
      optimized: Math.round(data.optimized_weights[asset] * 1000) / 10,
      color: ASSET_COLORS[asset] || "#ffffff",
    }));
  };

  const getWeightsDeltaData = () => {
    if (!data) return [];
    return Object.keys(data.market_weights).map(asset => {
      const delta = Math.round((data.optimized_weights[asset] - data.market_weights[asset]) * 1000) / 10;
      return {
        name: ASSET_SHORT[asset] || asset,
        asset,
        delta,
        color: delta > 0 ? "#22C55E" : delta < 0 ? "#EF4444" : "#525252",
      };
    });
  };

  const getReturnsData = () => {
    if (!data) return [];
    return Object.keys(data.market_weights).map(asset => {
      const prior = Math.round((data.prior_returns?.[asset] || 0) * 1000) / 10;
      const post = Math.round(data.posterior_returns[asset] * 1000) / 10;
      return {
        name: ASSET_SHORT[asset] || asset,
        asset,
        "Prior": prior,
        "Posterior": post,
        delta: Math.round((post - prior) * 10) / 10,
        color: ASSET_COLORS[asset] || "#ffffff",
      };
    });
  };

  const getMonteCarloPaths = () => {
    if (!data) return [];
    const paths = data.risk_metrics.simulation_paths;
    const nDays = paths[0].length;
    
    const sampleSize = 15;
    const step = Math.floor(paths.length / sampleSize);
    const sampledPaths = Array.from({ length: sampleSize }, (_, i) => paths[i * step]);

    return Array.from({ length: nDays }, (_, day) => {
      const row: Record<string, any> = { day };
      sampledPaths.forEach((path, pIdx) => {
        row[`path_${pIdx}`] = Math.round(path[day] * 1000) / 10;
      });
      return row;
    });
  };

  const getDistributionData = () => {
    if (!data) return [];
    return data.risk_metrics.histogram_data.map(item => ({
      return: Math.round(item.x * 1000) / 10,
      density: item.y
    }));
  };

  const getFrontierData = () => {
    if (!data || !data.efficient_frontier) return [];
    return data.efficient_frontier.map(pt => ({
      volatility: Math.round(pt.volatility * 10000) / 100,
      return: Math.round(pt.return * 10000) / 100,
      sharpe: pt.sharpe
    }));
  };

  const getBenchmarkDot = () => {
    if (!data || !data.benchmark_portfolio) return null;
    return {
      name: "국민연금 Benchmark",
      volatility: Math.round(data.benchmark_portfolio.volatility * 10000) / 100,
      return: Math.round(data.benchmark_portfolio.return * 10000) / 100,
      sharpe: data.benchmark_portfolio.sharpe
    };
  };

  const getOptimizedDot = () => {
    if (!data || !data.optimized_portfolio) return null;
    return {
      name: "최적화 포트폴리오",
      volatility: Math.round(data.optimized_portfolio.volatility * 10000) / 100,
      return: Math.round(data.optimized_portfolio.return * 10000) / 100,
      sharpe: data.optimized_portfolio.sharpe
    };
  };

  // Derived metrics
  const getDerivedMetrics = () => {
    if (!data) return { sharpe: 0 };
    const rf = data.risk_free_rate;
    const expRet = data.risk_metrics.expected_return;
    const vol = data.risk_metrics.volatility;
    const sharpe = (expRet - rf) / (vol > 0 ? vol : 1e-4);
    return { sharpe };
  };

  const metrics = getDerivedMetrics();

  return (
    <>
      <div id="main-terminal-layout" className="min-h-screen bg-black text-white flex flex-col font-ui selection:bg-white selection:text-black print:hidden">
      {/* Top Navbar */}
      <nav className="border-b border-neutral-950 sticky top-0 bg-black/90 backdrop-blur z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-display text-lg tracking-[0.2em] text-white">{t.appTitle}</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab("SIMULATOR")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "SIMULATOR" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.tabSimulator}
            </button>
            <button
              onClick={() => setActiveTab("INTELLIGENCE")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "INTELLIGENCE" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.tabIntelligence}
            </button>
            <button
              onClick={() => setActiveTab("MACRO")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "MACRO" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.tabMacro}
            </button>
            <button
              onClick={() => setActiveTab("RESEARCH")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "RESEARCH" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.tabResearch}
            </button>
            <button
              onClick={() => setActiveTab("HELP")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "HELP" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {t.tabHelp}
            </button>
          </div>
          <div className="flex gap-4 items-center text-xs">
            {data && data.macro_context && data.macro_context.market_regime && (
              <div className="flex gap-2 items-center text-[10px] text-neutral-400 border border-neutral-900 px-3 py-1 bg-neutral-950/50">
                <span>{t.marketRegime}</span>
                <span className={`px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider ${
                  data.macro_context.market_regime === "CRISIS" ? "bg-red-950/80 text-red-400 border border-red-900/50" :
                  data.macro_context.market_regime === "ELEVATED_RISK" ? "bg-amber-950/80 text-amber-400 border border-amber-900/50" :
                  data.macro_context.market_regime === "LOW_VOL" ? "bg-emerald-950/80 text-emerald-400 border border-emerald-900/50" :
                  "bg-neutral-900/80 text-neutral-300 border border-neutral-800"
                }`}>
                  {data.macro_context.regime_kr || data.macro_context.market_regime}
                </span>
              </div>
            )}
            <span className="font-mono text-[9px] text-neutral-700 tracking-widest">{VERSION}</span>
            {/* Language toggle */}
            <button
              onClick={() => setLang(l => l === 'ko' ? 'en' : 'ko')}
              className="font-display text-[10px] tracking-widest border border-neutral-700 px-3 py-1 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
            >
              {lang === 'ko' ? 'KO' : 'EN'}
            </button>
            <div className="flex gap-2 items-center text-[10px] text-neutral-400 border border-neutral-900 px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              <span>{t.host}</span>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                className="bg-transparent text-white font-mono outline-none w-28 text-center"
              />
            </div>
          </div>
        </div>
      </nav>

      {/* Dynamic Main Container based on Active Tab */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-8">
        
        {/* SIMULATOR TAB */}
        {activeTab === "SIMULATOR" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side Control Panel */}
        <aside className="lg:col-span-1 flex flex-col gap-4">

          {/* Input Panel */}
          <div className="bg-[#0a0a0a] border border-neutral-900 p-5 flex flex-col gap-4">
            <h3 className="font-display text-[10px] tracking-widest text-neutral-400 flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-white" />
              {t.pipelineTitle}
            </h3>
            <textarea
              value={viewText}
              onChange={(e) => setViewText(e.target.value)}
              rows={5}
              placeholder="투자 의견을 자유롭게 입력하세요 (예: 해외주식이 국내주식보다 연 5% 우세할 것 같다)"
              className="w-full bg-black border border-neutral-900 focus:border-neutral-700 p-3 text-xs text-neutral-300 font-sans outline-none resize-none leading-relaxed placeholder:text-neutral-700"
            />
            <div className="flex flex-col gap-2">
              <select
                value={optimizer}
                onChange={(e) => setOptimizer(e.target.value)}
                className="w-full bg-black border border-neutral-900 p-2 text-xs text-neutral-300 outline-none focus:border-neutral-700 font-sans"
              >
                <option value="ensemble">{t.optEnsembleDesc}</option>
                <option value="risk_parity">{t.optRpDesc}</option>
                <option value="markowitz">{t.optMvoDesc}</option>
                <option value="hrp">{t.optHrpDesc}</option>
                <option value="resampled">{t.optResampledDesc}</option>
              </select>
              <div className="flex items-center justify-between text-[9px] font-mono text-neutral-500">
                <span>δ max {t.maxDeviation}</span>
                <span className="text-white">{(maxDeviation * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min="0.01" max="0.30" step="0.01"
                value={maxDeviation}
                onChange={(e) => setMaxDeviation(parseFloat(e.target.value))}
                className="w-full accent-white bg-neutral-900 h-0.5 cursor-pointer"
              />
            </div>
            <button
              onClick={() => handleRunSimulation()}
              disabled={isLoading || !viewText.trim()}
              className="w-full bg-white hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display font-bold text-[10px] tracking-widest py-2.5 border border-white transition-all uppercase flex items-center justify-center gap-2"
            >
              {isLoading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t.stepRunning}</>
                : <><Play className="w-3.5 h-3.5 fill-black" /> {t.executeSimulation}</>
              }
            </button>
          </div>

          {/* Compact Metrics — only shown after run */}
          {data && (
            <div className="bg-[#0a0a0a] border border-neutral-900 p-5 flex flex-col gap-2">
              <h3 className="font-display text-[10px] tracking-widest text-neutral-400 border-b border-neutral-900 pb-2 mb-1">{t.simulationResults}</h3>
              {[
                { label: t.expReturn,     value: formatPercent(data.risk_metrics.expected_return) },
                { label: t.portfolioVol,  value: formatPercent(data.risk_metrics.volatility) },
                { label: t.sharpeRatio,   value: metrics.sharpe.toFixed(2) },
                { label: t.var95,         value: formatPercent(data.risk_metrics.var_95) },
                { label: t.cvar95,        value: formatPercent(data.risk_metrics.cvar_95) },
                { label: t.maxDrawdown,   value: formatPercent(data.risk_metrics.max_drawdown_estimate) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-[10px]">
                  <span className="text-neutral-500 font-sans">{label}</span>
                  <span className="font-mono text-white font-bold">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent runs — compact */}
          {simulationsList.length > 0 && (
            <div className="bg-[#0a0a0a] border border-neutral-900 p-4 flex flex-col gap-2">
              <h3 className="font-display text-[9px] tracking-widest text-neutral-600 flex items-center gap-2">
                <History className="w-3 h-3" />
                {t.simulationHistory}
              </h3>
              <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                {simulationsList.map((sim) => (
                  <button
                    key={sim.id}
                    onClick={() => handleLoadSimulation(sim.id)}
                    className="w-full text-left px-2 py-1.5 hover:bg-neutral-900 transition flex justify-between items-center gap-2 rounded"
                  >
                    <span className="text-[9px] text-neutral-400 font-sans line-clamp-1 flex-1">{sim.title || sim.user_view}</span>
                    <span className="text-[8px] font-mono text-neutral-700 flex-shrink-0">#{sim.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right Main Panel */}
        <main className="lg:col-span-3 flex flex-col gap-8">
          
          {/* Error Alert */}
          {error && (
            <div className="border border-red-900 bg-red-950/20 text-red-400 p-4 flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <h4 className="font-display text-xs tracking-wider text-white">{t.systemAnomaly}</h4>
                <p className="text-xs text-neutral-400 mt-1 font-sans leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Empty state — no simulation run yet */}
          {!data && !error && !isLoading && (
            <div className="border border-neutral-900 bg-[#0a0a0a] p-12 flex flex-col items-center justify-center gap-4 min-h-[400px] text-center">
              <BarChart3 className="w-8 h-8 text-neutral-800" />
              <h3 className="font-display text-sm tracking-widest text-neutral-600">{t.simulationResults}</h3>
              <p className="text-[11px] text-neutral-700 font-sans max-w-sm leading-relaxed">
                좌측 패널에 투자 의견을 입력하고 시뮬레이션을 실행하거나, 마켓 인텔리전스 탭에서 소스를 선택하세요.
              </p>
            </div>
          )}

          {/* Loading Stepper */}
          {!data && !error && isLoading && (
            <div className="border border-neutral-900 bg-[#0a0a0a] p-8 flex flex-col gap-6 min-h-[500px] justify-center items-center">
              <div className="text-center flex flex-col items-center gap-2 max-w-md mb-4">
                <RefreshCw className="w-8 h-8 text-neutral-600 animate-spin mb-2" />
                <h3 className="font-display text-sm tracking-wider text-neutral-300">{t.pipelineTitle}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed font-sans">
                  {t.pipelineDesc}
                </p>
              </div>

              {/* Progress Stepper List */}
              <div className="w-full max-w-lg bg-[#050505] border border-neutral-900 p-6 flex flex-col gap-4">
                {t.steps.map((stepDef, idx) => {
                  const step = { id: idx + 1, label: stepDef.label, desc: stepDef.desc };
                  const isCompleted = loadingStep > step.id;
                  const isActive = loadingStep === step.id;

                  return (
                    <div key={step.id} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 mt-0.5 font-mono text-xs">
                        {isCompleted ? (
                          <span className="text-neutral-400">✓</span>
                        ) : isActive ? (
                          <span className="text-white animate-pulse">●</span>
                        ) : (
                          <span className="text-neutral-800">{step.id}</span>
                        )}
                      </div>
                      <div className="flex-grow flex flex-col gap-0.5 text-xs">
                        <div className="flex justify-between items-center font-display text-[10px]">
                          <span className={isCompleted ? "text-neutral-400" : isActive ? "text-white" : "text-neutral-700"}>
                            {step.label}
                          </span>
                          {isActive && (
                            <span className="text-neutral-500 font-mono text-[9px] animate-pulse">{t.stepRunning}</span>
                          )}
                        </div>
                        <span className={`text-[10px] font-sans ${isCompleted ? "text-neutral-500" : isActive ? "text-neutral-300" : "text-neutral-800"}`}>
                          {isActive ? loadingMessage : step.desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Nemotron 3 Ultra — Live Reasoning Trace */}
              {thinkingText && (
                <div className="w-full max-w-lg mt-2 border border-neutral-800/60 bg-[#050505] overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-900">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                      </span>
                      <span className="font-display text-[9px] tracking-[0.2em] text-neutral-500">NEMOTRON 3 ULTRA · 추론 중</span>
                    </div>
                    <button
                      onClick={() => setShowThinking(p => !p)}
                      className="text-[9px] font-mono text-neutral-700 hover:text-neutral-400 transition-colors px-1"
                    >
                      {showThinking ? "−" : "+"}
                    </button>
                  </div>
                  {/* Thinking body */}
                  {showThinking && (
                    <div className="relative">
                      {/* Fade at top */}
                      <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none" />
                      <div
                        ref={thinkingScrollRef}
                        className="px-4 py-3 font-mono text-[10px] text-neutral-600 leading-relaxed whitespace-pre-wrap h-40 overflow-y-auto"
                        style={{ scrollbarWidth: "none" }}
                      >
                        {thinkingText}
                        {loadingStep === 3 && (
                          <span className="inline-block w-1 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-middle opacity-80" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dashboard Visualizer */}
          {data && (
            <>
              {/* Simulation Header with PDF Export Button */}
              <div className="border border-neutral-900 bg-[#0a0a0a] p-5 flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[9px] font-mono text-neutral-600">
                    <span>RUN #{data.simulation_id}</span>
                    <span>·</span>
                    <span className="uppercase">{data.optimizer || "ensemble"}</span>
                  </div>
                  <h3 className="font-display text-base tracking-wide text-white leading-snug">
                    {data.title || `${t.simulationResults} #${data.simulation_id}`}
                  </h3>
                  <p className="text-[10px] text-neutral-500 font-sans">
                    {t.simulationSubtitle}
                  </p>
                </div>
                <button
                  onClick={handleExportPDF}
                  className="flex-shrink-0 bg-white hover:bg-neutral-200 text-black font-display font-bold text-[10px] tracking-widest px-4 py-2 border border-white transition-all uppercase flex items-center gap-1.5 rounded-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.exportPdf}
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                
                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.expReturn}</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.expected_return)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.portfolioVol}</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.volatility)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.sharpeRatio}</span>
                  <span className="text-xl font-display text-white">
                    {metrics.sharpe.toFixed(2)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.var95}</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.var_95)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.cvar95}</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.cvar_95)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">{t.maxDrawdown}</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.max_drawdown_estimate)}
                  </span>
                </div>

              </div>

              {/* Metrics Explanation Box */}
              <div className="border border-neutral-900 bg-[#050505] p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-neutral-900">
                  {[
                    { label: t.expReturn, value: formatPercent(data.risk_metrics.expected_return), desc: t.metricDescExpReturn },
                    { label: t.portfolioVol, value: formatPercent(data.risk_metrics.volatility), desc: t.metricDescVol },
                    { label: t.sharpeRatio, value: metrics.sharpe.toFixed(2), desc: t.metricDescSharpe },
                    { label: t.var95, value: formatPercent(data.risk_metrics.var_95), desc: t.metricDescVar },
                    { label: t.cvar95, value: formatPercent(data.risk_metrics.cvar_95), desc: t.metricDescCvar },
                    { label: t.maxDrawdown, value: formatPercent(data.risk_metrics.max_drawdown_estimate), desc: t.metricDescMaxDd },
                  ].map(({ label, value, desc }) => (
                    <div key={label} className="bg-[#050505] p-3 flex flex-col gap-1">
                      <span className="font-display text-[9px] tracking-wider text-neutral-500 uppercase">{label}</span>
                      <span className="font-mono text-sm text-white font-bold">{value}</span>
                      <span className="text-[9px] text-neutral-600 leading-tight">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BL View Attribution — compact table */}
              {data.view_attribution && data.view_attribution.length > 0 && (
                <div className="border border-neutral-900 bg-[#0a0a0a] p-5 flex flex-col gap-3">
                  <h3 className="font-display text-[10px] tracking-widest text-neutral-400 flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-white" />
                    {t.blAttributionTitle}
                  </h3>
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="border-b border-neutral-900 text-neutral-600">
                        <th className="text-left pb-2 font-display text-[9px] tracking-wider">자산</th>
                        <th className="text-right pb-2 font-display text-[9px] tracking-wider">Prior</th>
                        <th className="text-right pb-2 font-display text-[9px] tracking-wider">Post</th>
                        <th className="text-right pb-2 font-display text-[9px] tracking-wider">Δ</th>
                        <th className="text-left pb-2 font-display text-[9px] tracking-wider pl-3">뷰 근거</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-950">
                      {data.view_attribution.map((row) => (
                        <tr key={row.asset} className="hover:bg-neutral-950/40 transition-colors">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ASSET_COLORS[row.asset] || "#525252" }} />
                              <span className="text-neutral-300">{ASSET_SHORT[row.asset] || row.asset}</span>
                            </div>
                          </td>
                          <td className="py-2 text-right text-neutral-600">{row.prior_return.toFixed(1)}%</td>
                          <td className="py-2 text-right text-white font-bold">{row.posterior_return.toFixed(1)}%</td>
                          <td className={`py-2 text-right font-bold ${row.delta_pp > 0 ? "text-emerald-400" : row.delta_pp < 0 ? "text-red-400" : "text-neutral-600"}`}>
                            {row.delta_pp > 0 ? "+" : ""}{row.delta_pp.toFixed(1)}
                          </td>
                          <td className="py-2 pl-3">
                            {row.driving_views.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {row.driving_views.map((v, vi) => (
                                  <div key={vi} className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[8px] font-display border border-neutral-800 px-1 text-neutral-600">
                                      {v.view_type === "absolute" ? "ABS" : "REL"}
                                    </span>
                                    <span className="text-neutral-500">{(v.confidence * 100).toFixed(0)}%</span>
                                    {v.thesis && (
                                      <span className="text-neutral-500 text-[9px] font-sans line-clamp-1 max-w-[200px]">{v.thesis.slice(0, 60)}{v.thesis.length > 60 ? "…" : ""}</span>
                                    )}
                                    {v.sources && v.sources.slice(0, 2).map((src, si) => (
                                      <span key={si} className="text-[8px] bg-neutral-900 px-1 text-neutral-600">{src}</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-700 italic text-[9px] font-sans">균형 유지</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Grouped Allocation Chart */}
              <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                  <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-white" />
                    {t.chartGroupedAllocation}
                  </h3>
                  <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getGroupedWeightsData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="name" stroke="#525252" fontSize={9} tickLine={false} />
                      <YAxis stroke="#525252" fontSize={9} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                        itemStyle={{ fontSize: "10px", color: "#ffffff" }}
                        labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#ffffff" }}
                        formatter={(value) => { const v = Number(value); return [`${v.toFixed(1)}%`]; }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                      <Bar dataKey="benchmark" name={t.legendBenchmarkShort} fill="#404040" opacity={0.8} />
                      <Bar dataKey="optimized" name={t.legendOptimizedShort}>
                        {getGroupedWeightsData().map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Min Variance Fallback Warning */}
              {data.min_variance_fallback && (
                <div className="border border-amber-800 bg-amber-950/20 text-amber-400 p-3 flex items-start gap-2 text-[10px] font-sans">
                  <span className="font-display text-[9px] tracking-wider shrink-0 mt-0.5">{t.minVarianceFallback}</span>
                  <span className="text-amber-300/80 leading-relaxed">{t.minVarianceFallbackDesc}</span>
                </div>
              )}

              {/* AI Analysis Commentary & Macro Indicators */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* AI Commentary Card */}
                <div className="lg:col-span-2 border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-white" />
                      {t.aiCommentaryTitle}
                    </h3>
                  </div>
                  <div className="text-xs text-neutral-300 font-sans leading-relaxed whitespace-pre-line">
                    {data.ai_commentary ? (
                      data.ai_commentary
                    ) : (
                      <p className="text-neutral-500 italic">{t.noAiCommentary}</p>
                    )}
                  </div>
                </div>

                {/* Macro Context Card */}
                <div className="lg:col-span-1 border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      {t.macroIndicatorsTitle}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2 font-mono text-[10px] text-neutral-400">
                    {data.macro_context ? (
                      (() => {
                        const mc = data.macro_context;
                        const rows: { label: string; value: string; show: boolean }[] = [
                          { label: "CBOE VIX", value: mc.vix != null ? `${mc.vix}${mc.vix_5d_change != null ? ` (${mc.vix_5d_change > 0 ? "+" : ""}${Number(mc.vix_5d_change).toFixed(1)}%)` : ""}` : "", show: mc.vix != null },
                          { label: "US 10Y Yield", value: mc.us_10y_yield != null ? `${mc.us_10y_yield}%` : "", show: mc.us_10y_yield != null },
                          { label: "S&P 500 (1M/6M)", value: `${Number(mc.sp500_1m_return ?? 0).toFixed(1)}% / ${Number(mc.sp500_6m_return ?? 0).toFixed(1)}%`, show: mc.sp500_1m_return != null },
                          { label: "KOSPI", value: mc.kospi_level != null ? `${mc.kospi_level} (${Number(mc.kospi_1m_return ?? 0).toFixed(1)}%)` : "", show: mc.kospi_level != null },
                          { label: "DXY", value: mc.dxy_index != null ? String(mc.dxy_index) : "", show: mc.dxy_index != null },
                          { label: "USD/KRW", value: mc.usd_krw != null ? `${mc.usd_krw}원` : "", show: mc.usd_krw != null },
                        ];
                        const visible = rows.filter(r => r.show);
                        return visible.length > 0 ? (
                          <>
                            {visible.map(r => (
                              <div key={r.label} className="flex justify-between border-b border-neutral-950 pb-1 last:border-0">
                                <span>{r.label}</span>
                                <span className="text-white font-bold">{r.value}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="text-neutral-600 italic text-[9px]">{t.noMacroData}</p>
                        );
                      })()
                    ) : (
                      <p className="text-neutral-500 italic">{t.noMacroData}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* PM Memo Card */}
              {data.pm_memo && (
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-3">
                  <h3 className="font-display text-xs tracking-wider text-neutral-400 border-b border-neutral-900 pb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-white" />
                    {t.pmMemoTitle}
                    <span className="ml-auto text-[9px] font-mono text-neutral-600">{t.pmMemoConfidential}</span>
                  </h3>
                  <div className="text-xs text-neutral-300 font-sans leading-relaxed whitespace-pre-line">
                    {typeof data.pm_memo === "object" ? (
                      <div className="flex flex-col gap-4 font-sans text-xs">
                        {data.pm_memo.macro_regime_sentiment && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-display text-neutral-500 uppercase tracking-wider font-bold">{t.pmRegimeBias}</span>
                            <span className={`px-2 py-0.5 text-[9px] font-mono font-bold border ${
                              data.pm_memo.macro_regime_sentiment === "RISK-OFF" ? "border-red-900 bg-red-950/20 text-red-400" :
                              data.pm_memo.macro_regime_sentiment === "RISK-ON" ? "border-emerald-900 bg-emerald-950/20 text-emerald-400" :
                              "border-neutral-800 bg-neutral-900/20 text-neutral-400"
                            }`}>
                              {data.pm_memo.macro_regime_sentiment}
                            </span>
                          </div>
                        )}
                        {data.pm_memo.investment_thesis_summary && (
                          <div>
                            <span className="text-[10px] font-display text-neutral-500 uppercase tracking-wider font-bold block mb-1">{t.pmThesisSummary}</span>
                            <p className="text-white leading-relaxed">{data.pm_memo.investment_thesis_summary}</p>
                          </div>
                        )}
                        {data.pm_memo.strategic_positioning_advice && (
                          <div>
                            <span className="text-[10px] font-display text-neutral-500 uppercase tracking-wider font-bold block mb-1">{t.pmPositioningAdvice}</span>
                            <p className="text-neutral-200 leading-relaxed">{data.pm_memo.strategic_positioning_advice}</p>
                          </div>
                        )}
                        {data.pm_memo.adjusted_views_rationale && (
                          <div>
                            <span className="text-[10px] font-display text-neutral-500 uppercase tracking-wider font-bold block mb-1">{t.pmCalibrationRationale}</span>
                            <p className="text-neutral-300 leading-relaxed">{data.pm_memo.adjusted_views_rationale}</p>
                          </div>
                        )}
                        {Array.isArray(data.pm_memo.key_risks_considered) && data.pm_memo.key_risks_considered.length > 0 && (
                          <div>
                            <span className="text-[10px] font-display text-neutral-500 uppercase tracking-wider font-bold block mb-1">{t.pmKeyRisks}</span>
                            <ul className="list-disc pl-4 flex flex-col gap-1 text-neutral-400">
                              {data.pm_memo.key_risks_considered.map((risk: string, rIdx: number) => (
                                <li key={rIdx}>{risk}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      data.pm_memo
                    )}
                  </div>
                </div>
              )}

              {/* Chart Section 1: Weights & Expected Returns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Weight Comparison Chart */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-white" />
                      {t.chartWeightDeviation}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getWeightsDeltaData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="name" stroke="#525252" fontSize={9} tickLine={false} />
                        <YAxis stroke="#525252" fontSize={9} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} />
                        <ReferenceLine y={0} stroke="#525252" strokeWidth={1} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                          itemStyle={{ fontSize: "10px", color: "#ffffff" }}
                          labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#ffffff" }}
                          formatter={(value) => { const v = Number(value); return [`${v > 0 ? "+" : ""}${v}%`, t.legendBLDelta]; }}
                        />
                        <Bar dataKey="delta" name={t.legendBLDelta}>
                          {getWeightsDeltaData().map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Black Litterman Expected Returns */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      {t.chartExpReturns}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getReturnsData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="name" stroke="#525252" fontSize={9} tickLine={false} />
                        <YAxis stroke="#525252" fontSize={9} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                          itemStyle={{ fontSize: "10px", color: "#ffffff" }}
                          labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#ffffff" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                        <Bar dataKey="Prior" name={t.legendPrior} fill="#262626" opacity={0.7} />
                        <Bar dataKey="Posterior" name={t.legendPosterior}>
                          {getReturnsData().map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* Chart Section 2: Efficient Frontier & Monte Carlo Paths */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Efficient Frontier Chart (Scatter + Line) */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      {t.chartEfficientFrontier}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis type="number" dataKey="volatility" name="위험 (Volatility)" unit="%" stroke="#525252" fontSize={9} />
                        <YAxis type="number" dataKey="return" name="수익 (Expected Return)" unit="%" stroke="#525252" fontSize={9} />
                        
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const pt = payload[0].payload;
                              return (
                                <div className="bg-black border border-neutral-800 p-3 text-[10px] text-white">
                                  <p className="font-display text-[9px] tracking-wider text-neutral-400 border-b border-neutral-800 pb-1 mb-1">
                                    {pt.name || "PORTFOLIO POINT"}
                                  </p>
                                  <p>{t.efExpReturn}: {pt.return.toFixed(2)}%</p>
                                  <p>{t.efVolatility}: {pt.volatility.toFixed(2)}%</p>
                                  <p>Sharpe Ratio: {pt.sharpe.toFixed(2)}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        
                        {/* Efficient Frontier Curve Line */}
                        <Scatter 
                          name="Efficient Frontier" 
                          data={getFrontierData()} 
                          line={{ stroke: '#525252', strokeWidth: 1.5 }} 
                          shape={() => null} 
                          fill="#ffffff" 
                        />
                        
                        {/* Benchmark Dot */}
                        {getBenchmarkDot() && (
                          <Scatter
                            name={t.legendBenchmark}
                            data={[getBenchmarkDot()]}
                            fill="#8a8a8f"
                            shape="circle"
                          />
                        )}
                        
                        {/* Optimal Portfolio Dot */}
                        {getOptimizedDot() && (
                          <Scatter
                            name={t.legendOptimized}
                            data={[getOptimizedDot()]}
                            fill="#ffffff"
                            shape="triangle"
                          />
                        )}
                        <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monte Carlo Simulated Paths */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <LineIcon className="w-4 h-4 text-white" />
                      {t.chartMonteCarlo}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMonteCarloPaths()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="day" stroke="#525252" fontSize={8} />
                        <YAxis stroke="#525252" fontSize={8} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                          itemStyle={{ fontSize: "9px", color: "#ffffff" }}
                          labelStyle={{ fontSize: "10px", fontWeight: "bold", color: "#ffffff" }}
                        />
                        {Array.from({ length: 15 }).map((_, idx) => (
                          <Line 
                            key={idx}
                            type="monotone" 
                            dataKey={`path_${idx}`} 
                            stroke={idx === 0 ? "#ffffff" : `rgba(255,255,255,${0.1 + (idx * 0.05)})`} 
                            dot={false}
                            strokeWidth={1.0}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* Return Distribution & Historical Stress Tests */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Return Distribution Chart */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-white" />
                      {t.chartReturnDist}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartUnitPct}</span>
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getDistributionData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="return" stroke="#525252" fontSize={9} />
                        <YAxis stroke="#525252" fontSize={9} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                          itemStyle={{ fontSize: "10px", color: "#ffffff" }}
                          labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#ffffff" }}
                        />
                        <Area type="monotone" dataKey="density" stroke="#ffffff" fill="rgba(255, 255, 255, 0.05)" />
                        <ReferenceLine 
                          x={Math.round(data.risk_metrics.var_95 * 1000) / 10} 
                          stroke="#ff3b30" 
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{ value: "95% VaR", fill: "#ff3b30", fontSize: 9, position: "top" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Historical Stress Tests Table */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <History className="w-4 h-4 text-white" />
                      {t.chartStressTest}
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">{t.chartImpact}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[9px] text-neutral-400">
                      <thead>
                        <tr className="border-b border-neutral-900 text-neutral-500">
                          <th className="pb-2 font-display text-[9px] tracking-wider">{t.stressCrisisScenario}</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">{t.stressImpact}</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">{t.stressKrStock}</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">{t.stressGlobalStock}</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">{t.stressAlt}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-950">
                        {data.historical_stress_tests ? (
                          data.historical_stress_tests.map((sc, idx) => (
                            <tr key={idx} className="hover:bg-neutral-950/50 transition-colors">
                              <td className="py-2.5 font-sans font-medium text-neutral-300">
                                {sc.name_kr}
                              </td>
                              <td className={`py-2.5 text-right font-bold font-mono ${sc.portfolio_return < 0 ? "text-red-500" : "text-emerald-500"}`}>
                                {(sc.portfolio_return * 100).toFixed(2)}%
                              </td>
                              <td className="py-2.5 text-right text-neutral-600">
                                {sc.asset_impacts.KR_STOCK < 0 ? "" : "+"}{(sc.asset_impacts.KR_STOCK * 100).toFixed(0)}%
                              </td>
                              <td className="py-2.5 text-right text-neutral-600">
                                {sc.asset_impacts.GLOBAL_STOCK < 0 ? "" : "+"}{(sc.asset_impacts.GLOBAL_STOCK * 100).toFixed(0)}%
                              </td>
                              <td className="py-2.5 text-right text-neutral-600">
                                {sc.asset_impacts.ALTERNATIVE < 0 ? "" : "+"}{(sc.asset_impacts.ALTERNATIVE * 100).toFixed(0)}%
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-4 text-center italic text-neutral-600">
                              {t.stressNoData}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
              
              {/* Asset Mapping Info Panel */}
              <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col md:flex-row gap-4 items-center justify-between text-[10px] text-neutral-500 font-mono">
                <div className="flex gap-2 items-center">
                  <Info className="text-white flex-shrink-0 w-3.5 h-3.5" />
                  <p>{t.assetMappingLabel}
                    <span className="text-neutral-300 ml-1">{t.assetMappingValues}</span>.
                  </p>
                </div>
                <div>
                  <p>
                    {t.lambdaLabel} <span className="text-white">{(data.risk_aversion ?? 2.5).toFixed(4)}</span>
                    {data.risk_aversion === undefined || data.risk_aversion === null ? ` ${t.lambdaDefault}` : ` ${t.lambdaDynamic}`} |
                    {t.tauLabel} <span className="text-white">{(data.tau ?? 0.05).toFixed(6)}</span>
                    {data.tau === undefined || data.tau === null ? ` ${t.tauDefault}` : ` ${t.tauBayesian}`} |
                    {t.rfLabel} <span className="text-white">{(data.risk_free_rate * 100).toFixed(2)}%</span> (^TNX 10Y Treasury)
                  </p>
                </div>
              </div>
            </>
          )}

        </main>
          </div>
        )}

        {/* MARKET INTELLIGENCE TAB */}
        {activeTab === "INTELLIGENCE" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <div>
                <h2 className="font-display text-xl tracking-widest text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-neutral-400" />
                  {t.intelTitle}
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-1">
                  {t.intelSubtitle}
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleRefreshIntelligence}
                  disabled={isRefreshingIntel}
                  className="button-ghost-dark flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingIntel ? "animate-spin" : ""}`} />
                  {t.refreshFeed}
                </button>
                <button
                  onClick={() => setShowRunConfirmModal(true)}
                  disabled={selectedTheses.length === 0}
                  className="button-ghost-dark flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-white text-white"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t.applyToSimulator} ({selectedTheses.length})
                </button>
              </div>
            </div>

            {/* Refresh Feed Progress Panel */}
            {refreshProgress && (
              <div className="border border-neutral-800 bg-[#050505] p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-display text-[9px] tracking-widest text-amber-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {refreshProgress.phase}
                </div>
                {refreshProgress.items.length > 0 && (
                  <div className="font-mono text-[9px] text-neutral-500 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                    {refreshProgress.items.map((item, i) => (
                      <span key={i} className="leading-relaxed">{item}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3-Tier Source Tabs: News → Research → Asset */}
            <div className="flex gap-2 border-b border-neutral-900 pb-1">
              {(["NEWS", "RESEARCH", "USER_ASSET"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => {
                    setSourceFilter(src);
                    setSelectedThesisId(null);
                  }}
                  className={`px-4 py-2 font-display text-[10px] tracking-widest border transition-all ${
                    sourceFilter === src
                      ? "bg-white text-black border-white font-bold"
                      : "bg-transparent text-neutral-500 border-neutral-950 hover:border-neutral-800"
                  }`}
                >
                  {src === "NEWS" ? t.srcNews : src === "RESEARCH" ? t.srcResearch : t.srcUserAsset}
                </button>
              ))}
            </div>

            {/* Ingest user URL/PDF assets panel - Only shown under USER_ASSET source tab */}
            {sourceFilter === "USER_ASSET" && (
              <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-3">
                <label className="text-[10px] font-display tracking-widest text-neutral-400 flex items-center gap-2 font-bold">
                  <Newspaper className="w-3.5 h-3.5 text-white" />
                  {t.addUserAssets}
                  <span className="text-neutral-600 normal-case font-sans tracking-normal">
                    {t.addUserAssetsHint}
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder={t.urlPlaceholder}
                    value={articleUrl}
                    onChange={(e) => setArticleUrl(e.target.value)}
                    disabled={isIngesting}
                    onKeyDown={(e) => { if (e.key === "Enter" && !isIngesting) handleIngestArticle(); }}
                    className="flex-grow bg-[#050505] border border-neutral-900 text-xs text-white px-3 py-2 outline-none focus:border-neutral-700 font-mono tracking-wider placeholder-neutral-700"
                  />
                  <button
                    onClick={handleIngestArticle}
                    disabled={isIngesting || (!articleUrl.trim() && !pastedContent.trim())}
                    className="button-ghost-dark flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isIngesting
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> {t.analyzing}</>
                      : <><Play className="w-4 h-4" /> {t.analyzeLink}</>}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <label className={`button-ghost-dark flex items-center gap-2 cursor-pointer whitespace-nowrap ${isIngesting ? "opacity-50 pointer-events-none" : ""}`}>
                    <Newspaper className="w-3.5 h-3.5" /> {t.uploadPdf}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={isIngesting}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIngestPdf(f); e.currentTarget.value = ""; }}
                    />
                  </label>
                  <span className="text-[9px] text-neutral-600 font-sans">{t.pdfHint}</span>
                </div>

                {ingestNeedsContent && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      placeholder={t.pasteContentPlaceholder}
                      rows={5}
                      value={pastedContent}
                      onChange={(e) => setPastedContent(e.target.value)}
                      disabled={isIngesting}
                      className="w-full bg-[#050505] border border-amber-900/60 text-xs text-white px-3 py-2 outline-none focus:border-amber-700 font-sans resize-none placeholder-neutral-700"
                    />
                  </div>
                )}

                {isIngesting && (
                  <p className="text-[10px] text-neutral-500 font-sans flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {t.ingestingMsg}
                  </p>
                )}
                {ingestNotice && !isIngesting && (
                  <p className="text-[10px] text-amber-400/90 font-sans flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {ingestNotice}
                  </p>
                )}
                {ingestError && !isIngesting && (
                  <p className="text-[10px] text-red-400 font-sans flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {ingestError}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-8">
              {/* Left Side List (40% width) */}
              <div className="w-[40%] flex flex-col gap-4 overflow-y-auto h-[calc(100vh-16rem)] pr-2 border-r border-neutral-900">
                {/* Search & Filter Controls */}
                <div className="flex flex-col gap-3 pb-3 border-b border-neutral-900 sticky top-0 bg-[#000000] z-10">
                  {/* Search Input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={t.searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#050505] border border-neutral-900 text-xs text-white px-3 py-2 outline-none focus:border-neutral-700 font-mono tracking-wider placeholder-neutral-700"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2.5 text-[9px] text-neutral-500 hover:text-white font-mono"
                      >
                        {t.clear}
                      </button>
                    )}
                  </div>

                  {/* Category Selection Tabs (Subcategories) */}
                  <div className="flex gap-1 border-b border-neutral-950 pb-2">
                    {(["ALL", "EQUITY", "BOND", "ALTERNATIVE", "MACRO"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`flex-1 py-1 text-[8px] font-display tracking-widest border transition-all ${
                          categoryFilter === cat
                            ? "bg-white text-black border-white font-bold"
                            : "bg-[#050505] text-neutral-400 border-neutral-950 hover:border-neutral-800"
                        }`}
                      >
                        {cat === "ALL" ? t.catAll : cat === "EQUITY" ? t.catEquity : cat === "BOND" ? t.catBond : cat === "ALTERNATIVE" ? t.catAlt : t.catMacro}
                      </button>
                    ))}
                  </div>

                  {/* Sorting Toggles */}
                  <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                    <span>{t.sortOrder}</span>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => setSortMode("CHRONOLOGICAL")}
                        className={`hover:text-white transition-all ${sortMode === "CHRONOLOGICAL" ? "text-white font-bold" : "text-neutral-500"}`}
                      >
                        {t.sortNewest}
                      </button>
                      <span>|</span>
                      <button
                        onClick={() => setSortMode("RANKED")}
                        className={`hover:text-white transition-all ${sortMode === "RANKED" ? "text-white font-bold" : "text-neutral-500"}`}
                      >
                        {t.sortRanked}
                      </button>
                    </div>
                  </div>
                </div>

                {filteredAndSortedFeed.length > 0 ? (
                  filteredAndSortedFeed.map(thesis => {
                    const isSelected = selectedThesisId === thesis.id;
                    const rank = globalRankMap[thesis.id];
                    const inBasket = selectedTheses.includes(thesis.id);
                    return (
                      <div
                        key={thesis.id}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("thesis_id", thesis.id);
                          e.dataTransfer.setData("text/plain", thesis.id);
                        }}
                        onClick={() => setSelectedThesisId(thesis.id)}
                        className={`border p-3 cursor-grab active:cursor-grabbing transition-all select-none relative group ${
                          isSelected ? 'border-white bg-neutral-950' : 'border-neutral-900 hover:border-neutral-700 bg-[#050505]'
                        } ${
                          thesis.category === 'RESEARCH' ? 'border-l-2 border-l-amber-600' :
                          thesis.category === 'NEWS' ? 'border-l-2 border-l-blue-600' :
                          'border-l-2 border-l-purple-600'
                        } ${inBasket ? 'ring-1 ring-emerald-700' : ''}`}
                      >
                        {/* Top row: source pill + date */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase ${
                              thesis.category === 'RESEARCH'
                                ? 'bg-amber-950/40 text-amber-300 border border-amber-800/50'
                                : thesis.category === 'NEWS'
                                ? 'bg-blue-950/40 text-blue-300 border border-blue-800/50'
                                : 'bg-purple-950/40 text-purple-300 border border-purple-800/50'
                            }`}>
                              {thesis.source || (thesis.category === 'RESEARCH' ? 'NPS Research' : 'News')}
                            </span>
                            {inBasket && (
                              <span className="text-[9px] font-display text-emerald-400 border border-emerald-900/60 bg-emerald-950/20 px-1.5 rounded-full tracking-wider">{t.active}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono tabular-nums">
                            {(() => {
                              try {
                                const d = new Date(thesis.date);
                                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                              } catch { return thesis.date; }
                            })()}
                          </span>
                        </div>

                        {/* Headline + summary */}
                        <div className="flex flex-col gap-1 mb-3">
                          <h3 className="text-[14px] font-bold text-white leading-snug tracking-tight font-sans">
                            {thesis.title}
                          </h3>
                          <p className="text-[11px] text-neutral-400 font-sans line-clamp-2 leading-relaxed">
                            {thesis.ai_interpretation?.summary || thesis.content}
                          </p>
                        </div>

                        {/* Bottom row: asset tags + confidence bar */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex gap-1 flex-wrap">
                            {(thesis.ai_interpretation?.impacted_assets || []).slice(0, 3).map((asset: string) => (
                              <span key={asset} className="text-[9px] font-display bg-neutral-900 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-800">
                                {asset.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                          {/* Mini confidence progress bar */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="w-16 h-1 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-neutral-400 to-white rounded-full transition-all"
                                style={{ width: `${((thesis.ai_interpretation?.confidence ?? 0) * 100).toFixed(0)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-neutral-300 tabular-nums">
                              {((thesis.ai_interpretation?.confidence ?? 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-16 text-center text-neutral-600 font-display text-[10px] tracking-widest border border-neutral-900 bg-[#050505]">
                    {t.noIntelFound}
                  </div>
                )}
              </div>

              {/* Right Side Detail Viewer (60% width) */}
              <div className="w-[60%] flex flex-col gap-6 overflow-y-auto h-[calc(100vh-16rem)] pr-2 pb-36">
                {selectedThesisId ? (() => {
                  const thesis = intelligenceFeed.find(t => t.id === selectedThesisId);
                  if (!thesis) return null;
                  const inBasket = selectedTheses.includes(thesis.id);
                  return (
                    <div className="bg-[#050505] border border-neutral-900 p-6 flex flex-col gap-6">
                      {/* Header banner with image */}
                      <div className="h-56 w-full relative overflow-hidden border-b border-neutral-900">
                        <img src={thesis.image_url || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab"} alt="Cover" className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <span className="font-display text-[10px] bg-white text-black px-2 py-0.5 font-bold tracking-widest uppercase">{thesis.source}</span>
                          <h2 className="text-xl md:text-2xl font-bold text-white mt-2 leading-snug">{thesis.title}</h2>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1 font-mono">
                            <span>BY: {thesis.author} ({thesis.author_title})</span>
                            <span>•</span>
                            <span>{new Date(thesis.date).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* SOURCE ATTRIBUTION — top of report */}
                      <div className="border border-neutral-800/60 bg-neutral-950/40 px-4 py-3 flex flex-col gap-2 rounded-sm">
                        <span className="font-display text-[9px] tracking-widest text-neutral-500 uppercase font-bold">{t.sourceAttribution}</span>
                        <div className="flex flex-wrap gap-3 items-center">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              thesis.category === 'RESEARCH' ? 'bg-amber-950/40 text-amber-300 border border-amber-800/40' :
                              thesis.category === 'USER_ASSET' ? 'bg-purple-950/40 text-purple-300 border border-purple-800/40' :
                              'bg-blue-950/40 text-blue-300 border border-blue-800/40'
                            }`}>
                              {thesis.category === 'RESEARCH' ? t.npsHouseView : thesis.category === 'USER_ASSET' ? t.userAssetLabel : t.marketNews}
                            </span>
                            <span className="text-[11px] font-semibold text-neutral-200">{thesis.source}</span>
                          </div>
                          <span className="text-neutral-700">·</span>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {(() => { try { return new Date(thesis.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }); } catch { return thesis.date; } })()}
                          </span>
                          {thesis.full_report?.source_url && (
                            <>
                              <span className="text-neutral-700">·</span>
                              <a href={thesis.full_report.source_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2 font-mono transition-colors">
                                {t.viewOriginalArticle}
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      {/* AI interpretation banner */}
                      <div className="border border-neutral-800 bg-neutral-950/50 p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-neutral-400 animate-pulse" />
                            <span className="font-display text-[9px] tracking-widest text-neutral-400">{t.aiInterpretationLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-[9px] text-neutral-500">{t.confidenceLabel}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-20 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-neutral-400 to-white rounded-full"
                                  style={{ width: `${(thesis.ai_interpretation.confidence * 100).toFixed(0)}%` }} />
                              </div>
                              <span className="font-mono text-sm font-bold text-white">{(thesis.ai_interpretation.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-neutral-300 font-sans leading-relaxed italic">
                          "{thesis.ai_interpretation.summary}"
                        </p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {thesis.ai_interpretation.impacted_assets.map(asset => (
                            <span key={asset} className="text-[10px] font-display bg-neutral-900 text-neutral-300 px-2 py-0.5 border border-neutral-800 rounded">
                              {asset.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Main Thesis text */}
                      <div className="flex flex-col gap-2">
                        <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.execAbstract}</h4>
                        <p className="text-base text-neutral-100 font-sans leading-relaxed">
                          "{thesis.content}"
                        </p>
                      </div>

                      {/* Bloomberg Analyst Report sections */}
                      {thesis.full_report && (
                        <div className="flex flex-col gap-5 border-t border-neutral-900 pt-5">
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.reportSection1}</h4>
                            <div className="text-xs md:text-sm text-neutral-300 font-sans leading-relaxed">{renderReportField(thesis.full_report.executive_summary)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.reportSection2}</h4>
                            <div className="text-xs md:text-sm text-neutral-300 font-sans leading-relaxed">{renderReportField(thesis.full_report.rationale)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.reportSection3}</h4>
                            <div className="text-xs md:text-sm text-neutral-300 font-sans leading-relaxed">{renderReportField(thesis.full_report.target_assets)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.reportSection4}</h4>
                            <div className="text-xs md:text-sm text-emerald-400 font-sans leading-relaxed font-semibold">{renderReportField(thesis.full_report.recommendation)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">{t.reportSection5}</h4>
                            <div className="text-xs md:text-sm text-red-400/90 font-sans leading-relaxed">{renderReportField(thesis.full_report.risk_factors)}</div>
                          </div>

                          {/* SOURCES USED — bottom of report */}
                          <div className="border-t border-neutral-900/60 pt-4 flex flex-col gap-2 mt-1">
                            <span className="font-display text-[9px] tracking-widest text-neutral-600 uppercase font-bold">{t.sourcesUsed}</span>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[10px] text-neutral-500 font-mono">{t.primarySource}</span>
                                <span className="text-[11px] text-neutral-200 font-semibold">{thesis.source}</span>
                                <span className="text-neutral-700">·</span>
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  {(() => { try { return new Date(thesis.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return thesis.date; } })()}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[10px] text-neutral-500 font-mono">{t.authorLabel}</span>
                                <span className="text-[11px] text-neutral-200">{thesis.author}</span>
                                <span className="text-neutral-700">·</span>
                                <span className="text-[10px] text-neutral-400 italic">{thesis.author_title}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* User comment input */}
                      <div className="border-t border-neutral-900 pt-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="font-display text-[9px] tracking-widest text-neutral-500 uppercase font-bold">{t.includedInSimulation}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleThesisSelection(thesis.id)}
                              className={`px-3 py-1 font-display text-[9px] tracking-widest border transition-all ${
                                inBasket
                                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                  : 'bg-white text-black border-white hover:bg-neutral-200'
                              }`}
                            >
                              {inBasket ? t.removeFromDock : t.addToDock}
                            </button>
                          </div>
                        </div>
                        
                        {selectedTheses.includes(thesis.id) && (
                          <div className="flex flex-col gap-2">
                            <textarea 
                              value={userComments[thesis.id] || ""}
                              onChange={(e) => updateComment(thesis.id, e.target.value)}
                              placeholder={t.feedbackPlaceholder}
                              className="w-full bg-black border border-neutral-800 text-xs text-white p-3 outline-none focus:border-neutral-600 resize-none font-sans"
                              rows={3}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="border border-neutral-900 bg-[#050505] p-12 flex flex-col items-center justify-center text-neutral-500 h-full">
                    <Newspaper className="w-8 h-8 mb-4 opacity-50" />
                    <p className="font-display text-xs tracking-widest">{t.selectThesisPrompt}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MACRO DASHBOARD TAB */}
        {activeTab === "MACRO" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <div>
                <h2 className="font-display text-xl tracking-widest text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-neutral-400" />
                  {t.macroTitle}
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-1">
                  {t.macroSubtitle}
                </p>
              </div>
              <button 
                onClick={() => fetchMacroData(true)}
                disabled={isFetchingMacro}
                className="button-ghost-dark flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingMacro ? "animate-spin" : ""}`} />
                {t.refreshData}
              </button>
            </div>

            {macroData ? (() => {
              const categories = {
                "VOLATILITY & RISK": ["VIX", "MOVE"],
                "YIELD CURVE & RATIO": ["US3M", "US5Y", "US10Y", "US30Y", "YIELD_SPREAD"],
                "CREDIT & FIXED INCOME": ["HYG", "LQD", "IEF", "TLT"],
                "GLOBAL EQUITY INDICES": ["SPY", "QQQ", "EFA", "EEM", "KOSPI"],
                "COMMODITIES, CRYTPO & ALTS": ["GOLD", "WTI", "BTC", "VNQ"],
                "FOREIGN EXCHANGE (FX)": ["USD_KRW", "DXY"]
              };
              
              const correlationKeys = ["SPY", "QQQ", "KOSPI", "VIX", "US10Y", "YIELD_SPREAD", "HYG", "GOLD", "BTC", "USD_KRW"];
              
              const filterCategoriesList = ["ALL", "VOLATILITY", "YIELD CURVE", "CREDIT", "EQUITY", "COMMODITIES", "FX"];
              
              const getFilteredHistory = (history: any[]) => {
                if (!history) return [];
                const now = new Date();
                let cutoff = new Date();
                if (selectedTimeframe === "1M") cutoff.setMonth(now.getMonth() - 1);
                else if (selectedTimeframe === "3M") cutoff.setMonth(now.getMonth() - 3);
                else if (selectedTimeframe === "6M") cutoff.setMonth(now.getMonth() - 6);
                else cutoff.setFullYear(now.getFullYear() - 1);
                
                return history.filter(pt => new Date(pt.date) >= cutoff);
              };
              
              const getCombinedHistory = (primaryKey: string, compareKey: string) => {
                const primaryHist = macroData[primaryKey]?.history || [];
                if (!compareKey || !macroData[compareKey]) {
                  return getFilteredHistory(primaryHist).map(pt => ({
                    date: pt.date,
                    value: pt.value,
                  }));
                }
                
                const compareHist = macroData[compareKey]?.history || [];
                const compareMap = new Map(compareHist.map((pt: any) => [pt.date, pt.value]));
                
                const filteredPrimary = getFilteredHistory(primaryHist);
                return filteredPrimary.map((pt: any) => ({
                  date: pt.date,
                  value: pt.value,
                  compareValue: compareMap.get(pt.date) ?? null,
                }));
              };
              
              const getAlertBadge = (key: string, item: any) => {
                if (key === "VIX" && item.current > 20 && item.current <= 30) {
                  return (
                    <span className="px-1.5 py-0.5 text-[7px] font-mono font-bold bg-amber-950/60 text-amber-400 border border-amber-800 rounded-sm animate-pulse ml-2 uppercase">
                      SPIKE
                    </span>
                  );
                }
                if (key === "VIX" && item.current > 30) {
                  return (
                    <span className="px-1.5 py-0.5 text-[7px] font-mono font-bold bg-red-950/60 text-red-400 border border-red-800 rounded-sm animate-pulse ml-2 uppercase">
                      CRISIS
                    </span>
                  );
                }
                if (key === "YIELD_SPREAD" && item.current < 0) {
                  return (
                    <span className="px-1.5 py-0.5 text-[7px] font-mono font-bold bg-red-950/60 text-red-400 border border-red-850 rounded-sm animate-pulse ml-2 uppercase">
                      INVERTED
                    </span>
                  );
                }
                return null;
              };

              const filteredCategories = Object.entries(categories).filter(([catName]) => {
                if (selectedCategory === "ALL") return true;
                if (selectedCategory === "FX") return catName.includes("FX") || catName.includes("FOREIGN EXCHANGE");
                return catName.includes(selectedCategory);
              });
              
              return (
                <div className="flex flex-col gap-8">
                  {/* Current Regime Header & Impact Scale */}
                  <div className="border border-neutral-900 bg-neutral-950 p-6 flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <ShieldAlert className={`w-8 h-8 ${macroData.market_regime === "CRISIS" ? "text-red-500 animate-pulse" : macroData.market_regime === "ELEVATED_RISK" ? "text-amber-500 animate-bounce" : "text-emerald-500"}`} />
                        <div>
                          <span className="text-[10px] font-display tracking-widest text-neutral-500 block uppercase font-bold">{t.detectedRegime}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-display text-white font-bold">{macroData.market_regime.replace("_", " ")}</span>
                            <span className="text-xs text-neutral-400">({macroData.regime_kr})</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Gauge Scale */}
                      <div className="flex gap-1.5 items-center w-full md:w-auto max-w-md">
                        {["LOW_VOL", "NORMAL", "ELEVATED_RISK", "CRISIS"].map(r => {
                          const isActive = macroData.market_regime === r;
                          const colorClass = 
                            r === "CRISIS" ? (isActive ? "bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]" : "bg-red-950/40 text-red-800") :
                            r === "ELEVATED_RISK" ? (isActive ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-amber-950/40 text-amber-800") :
                            r === "NORMAL" ? (isActive ? "bg-neutral-200" : "bg-neutral-900 text-neutral-700") :
                            (isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-emerald-950/40 text-emerald-800");
                            
                          return (
                            <div 
                              key={r} 
                              className={`px-3 py-1.5 text-[8px] font-mono font-bold tracking-wider rounded-sm transition-all text-center flex-1 md:flex-initial ${colorClass} ${
                                isActive ? "text-black scale-105" : ""
                              }`}
                            >
                              {r.replace("_", " ")}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Regime Details Explainer */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-neutral-900 pt-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">{t.vixLabel}</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-display font-bold text-white">{macroData.VIX?.current ?? "N/A"}</span>
                          <span className="text-xs text-neutral-400 font-sans">Index Points</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-normal font-sans">
                          시장 심리를 반영하는 변동성 지수입니다. 20 이상은 리스크 상승, 30 이상은 역사적 패닉 국면으로 해석됩니다.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">{t.lambdaMultiplierLabel}</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-display font-bold text-white">
                            {macroData.market_regime === "CRISIS" ? "1.60x" :
                             macroData.market_regime === "ELEVATED_RISK" ? "1.25x" :
                             macroData.market_regime === "LOW_VOL" ? "0.90x" : "1.00x"}
                          </span>
                          <span className="text-xs text-neutral-400 font-sans">Multiplier</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-normal font-sans">
                          블랙-리터만 최적화 시 변동성에 가중되는 위험회피 계수입니다. 위기 상황 시 계수가 상향되어 포트폴리오 변동성을 적극 억제합니다.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">{t.allocationStrategyLabel}</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xs font-display font-bold uppercase ${
                            macroData.market_regime === "CRISIS" ? "text-red-400" :
                            macroData.market_regime === "ELEVATED_RISK" ? "text-amber-400" :
                            macroData.market_regime === "LOW_VOL" ? "text-emerald-400" : "text-white"
                          }`}>
                            {macroData.market_regime === "CRISIS" ? "Defensive Capital Preservation" :
                             macroData.market_regime === "ELEVATED_RISK" ? "Tactical De-risking" :
                             macroData.market_regime === "LOW_VOL" ? "Risk-on Expansion" : "Neutral Asset Rotation"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-normal font-sans">
                          {macroData.market_regime === "CRISIS" ? "주식 비중을 최소화하고 해외 채권 및 대체투자, 안전자산으로 자금을 도피시킵니다." :
                           macroData.market_regime === "ELEVATED_RISK" ? "국내외 주식의 비중 상한을 제한하고 채권 편입 비중을 높여 변동성 상승에 대응합니다." :
                           macroData.market_regime === "LOW_VOL" ? "안정적인 상승 흐름으로 판단, 기대수익률이 높은 위험자산(주식 등) 편입 한도를 넓힙니다." :
                           "기본 벤치마크 가중치 대비 인텔리전스 뷰에 따른 표준 최적화를 유지하며 자산을 회전시킵니다."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Main Historical Chart */}
                  {selectedMacroKey && macroData[selectedMacroKey] && (() => {
                    const selectedItem = macroData[selectedMacroKey];
                    const isSelectedUp = selectedItem.change_5d >= 0;
                    
                    const combinedHist = getCombinedHistory(selectedMacroKey, compareMacroKey);
                    const isCompareUp = compareMacroKey ? (macroData[compareMacroKey]?.change_5d >= 0) : false;
                    
                    return (
                      <div className="border border-neutral-900 bg-[#020202] p-5 flex flex-col gap-4">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-neutral-900 pb-4">
                          <div>
                            <span className="text-[9px] font-mono text-neutral-500 block">SELECTED INDICATOR: {selectedMacroKey}</span>
                            <h3 className="text-sm font-bold text-white font-sans">{selectedItem.name}</h3>
                          </div>
                          
                          {/* Chart Controls */}
                          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                            {/* Timeframe selector */}
                            <div className="flex items-center border border-neutral-900 p-0.5 rounded bg-black">
                              {["1M", "3M", "6M", "1Y"].map((tf) => (
                                <button
                                  key={tf}
                                  onClick={() => setSelectedTimeframe(tf as any)}
                                  className={`px-3 py-1 text-[9px] font-display font-bold tracking-wider rounded transition-all ${
                                    selectedTimeframe === tf 
                                      ? "bg-neutral-800 text-white" 
                                      : "text-neutral-500 hover:text-neutral-300"
                                  }`}
                                >
                                  {tf}
                                </button>
                              ))}
                            </div>
                            
                            {/* Compare Select Dropdown */}
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-mono text-neutral-500 uppercase">{t.overlayLabel}</span>
                              <select
                                value={compareMacroKey}
                                onChange={(e) => setCompareMacroKey(e.target.value)}
                                className="bg-black border border-neutral-900 text-white px-2 py-1 text-[9px] font-mono focus:outline-none focus:border-neutral-700"
                              >
                                <option value="">(NONE)</option>
                                {Object.keys(macroData).filter(k => k !== selectedMacroKey && k !== "market_regime" && k !== "regime_kr" && k !== "correlation_matrix").map(key => (
                                  <option key={key} value={key}>{key} - {macroData[key].name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Value Display */}
                            <div className="text-right ml-auto lg:ml-0">
                              <div className="flex items-center gap-4 justify-end">
                                <div>
                                  <span className="text-sm font-display font-bold text-white block">{selectedItem.current}</span>
                                  <span className={`text-[10px] font-mono font-bold ${isSelectedUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isSelectedUp ? '+' : ''}{selectedItem.change_5d}% (1Y)
                                  </span>
                                </div>
                                {compareMacroKey && macroData[compareMacroKey] && (
                                  <div className="border-l border-neutral-850 pl-4 text-right">
                                    <span className="text-[8px] font-mono text-neutral-500 block">OVERLAY ({compareMacroKey})</span>
                                    <span className="text-sm font-display font-bold text-white block">{macroData[compareMacroKey].current}</span>
                                    <span className={`text-[10px] font-mono font-bold ${isCompareUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {isCompareUp ? '+' : ''}{macroData[compareMacroKey].change_5d}% (1Y)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {combinedHist && combinedHist.length > 0 ? (
                          <div className="h-64 w-full mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={combinedHist} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                <defs>
                                  <linearGradient id={`grad-main-${selectedMacroKey}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={isSelectedUp ? "#10b981" : "#ef4444"} stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor={isSelectedUp ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                  </linearGradient>
                                  {compareMacroKey && (
                                    <linearGradient id={`grad-compare-${compareMacroKey}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor={isCompareUp ? "#10b981" : "#ef4444"} stopOpacity={0.08}/>
                                      <stop offset="95%" stopColor={isCompareUp ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                    </linearGradient>
                                  )}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
                                <XAxis 
                                  dataKey="date" 
                                  stroke="#444" 
                                  fontSize={8} 
                                  tickLine={false} 
                                  dy={8}
                                  tickFormatter={(str) => {
                                    if (!str) return "";
                                    const parts = str.split("-");
                                    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : str;
                                  }}
                                />
                                <YAxis 
                                  yAxisId="left"
                                  domain={["auto", "auto"]} 
                                  stroke="#444" 
                                  fontSize={8} 
                                  tickLine={false} 
                                  width={40}
                                  dx={-8}
                                />
                                {compareMacroKey && (
                                  <YAxis 
                                    yAxisId="right"
                                    orientation="right"
                                    domain={["auto", "auto"]} 
                                    stroke="#666" 
                                    fontSize={8} 
                                    tickLine={false} 
                                    width={40}
                                    dx={8}
                                  />
                                )}
                                <Tooltip 
                                  contentStyle={{ backgroundColor: "#070707", borderColor: "#222", borderRadius: 4 }} 
                                  labelStyle={{ color: "#888", fontSize: 9, fontFamily: "monospace" }} 
                                  itemStyle={{ color: "#fff", fontSize: 10, padding: 0 }} 
                                />
                                <Area 
                                  yAxisId="left"
                                  type="monotone" 
                                  dataKey="value" 
                                  name={selectedItem.name}
                                  stroke={isSelectedUp ? "#10b981" : "#ef4444"} 
                                  strokeWidth={1.5} 
                                  fillOpacity={1} 
                                  fill={`url(#grad-main-${selectedMacroKey})`} 
                                  dot={false}
                                />
                                {compareMacroKey && (
                                  <Area 
                                    yAxisId="right"
                                    type="monotone" 
                                    dataKey="compareValue" 
                                    name={macroData[compareMacroKey]?.name}
                                    stroke={isCompareUp ? "#34d399" : "#f87171"} 
                                    strokeWidth={1.2} 
                                    strokeDasharray="4 4"
                                    fillOpacity={1} 
                                    fill={`url(#grad-compare-${compareMacroKey})`} 
                                    dot={false}
                                  />
                                )}
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="py-16 text-center text-neutral-600 font-display text-[10px] tracking-widest border border-neutral-900 bg-[#050505] rounded-sm">
                            {t.noHistoricalData}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Macro Correlation Heatmap Panel */}
                  <div className="border border-neutral-900 bg-[#020202] p-5 flex flex-col gap-4">
                    <h3 className="font-display text-[10px] tracking-wider text-neutral-400 border-b border-neutral-900 pb-2 uppercase font-bold">
                      {t.correlationHeatmap}
                    </h3>
                    <div className="flex flex-col xl:flex-row gap-6">
                      {/* The Heatmap Grid */}
                      <div className="overflow-x-auto p-1 flex-1">
                        <table className="min-w-full table-fixed border-collapse">
                          <thead>
                            <tr>
                              <th className="w-16 p-1 text-[8px] font-mono text-neutral-500 uppercase text-left"></th>
                              {correlationKeys.map(k => (
                                <th key={k} className="p-1 text-[8px] font-mono text-neutral-500 uppercase text-center font-bold">
                                  {k}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {correlationKeys.map(rowKey => (
                              <tr key={rowKey}>
                                <td className="p-1 text-[8px] font-mono text-neutral-400 uppercase text-left font-bold border-r border-neutral-900 pr-2">
                                  {rowKey}
                                </td>
                                {correlationKeys.map(colKey => {
                                  const matrix = macroData.correlation_matrix || {};
                                  const val = matrix[rowKey]?.[colKey] ?? 0;
                                  const isDiagonal = rowKey === colKey;
                                  
                                  let bgStyle = { backgroundColor: "rgba(38, 38, 38, 0.4)", color: "#888" };
                                  if (!isDiagonal) {
                                    if (val > 0.1) {
                                      bgStyle = { backgroundColor: `rgba(16, 185, 129, ${val * 0.7})`, color: val > 0.5 ? "#ffffff" : "#a7f3d0" };
                                    } else if (val < -0.1) {
                                      bgStyle = { backgroundColor: `rgba(239, 68, 68, ${Math.abs(val) * 0.7})`, color: val < -0.5 ? "#ffffff" : "#fca5a5" };
                                    }
                                  } else {
                                    bgStyle = { backgroundColor: "#171717", color: "#ffffff" };
                                  }
                                  
                                  const isSelected = selectedCell?.x === colKey && selectedCell?.y === rowKey;
                                  
                                  return (
                                    <td
                                      key={colKey}
                                      onClick={() => setSelectedCell({ x: colKey, y: rowKey })}
                                      style={bgStyle}
                                      className={`p-2 text-center text-[10px] font-mono font-bold cursor-pointer transition-all hover:scale-105 hover:ring-1 hover:ring-white/30 border border-neutral-950 ${
                                        isSelected ? "ring-2 ring-white hover:ring-2" : ""
                                      }`}
                                      title={`${rowKey} & ${colKey}: ${val.toFixed(2)}`}
                                    >
                                      {val.toFixed(2)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Cell Detail Explainer */}
                      <div className="w-full xl:w-80 border border-neutral-900 bg-neutral-950 p-5 flex flex-col justify-between font-sans">
                        {selectedCell ? (() => {
                          const matrix = macroData.correlation_matrix || {};
                          const val = matrix[selectedCell.y]?.[selectedCell.x] ?? 0;
                          const xName = macroData[selectedCell.x]?.name || selectedCell.x;
                          const yName = macroData[selectedCell.y]?.name || selectedCell.y;
                          
                          let relationship = "중립적 상관관계";
                          let explanation = "두 지표는 뚜렷한 선형적 상관관계를 보이지 않습니다. 자산 다변화 효과가 극대화되는 구간입니다.";
                          
                          if (selectedCell.x === selectedCell.y) {
                            relationship = "동일 지표";
                            explanation = "자기 자신과의 상관관계는 항상 1.00입니다.";
                          } else if (val > 0.6) {
                            relationship = "강한 양의 상관관계";
                            explanation = `${xName}와 ${yName}는 매우 유사한 방향으로 움직입니다. 포트폴리오 내 동시 편입 시 위험 분산 효과가 감소할 수 있으므로 주의가 필요합니다.`;
                          } else if (val > 0.2) {
                            relationship = "약한 양의 상관관계";
                            explanation = `두 지표는 완만하게 같은 방향으로 움직이는 경향이 있습니다. 경기 확장 국면에서 동반 상승할 수 있습니다.`;
                          } else if (val < -0.6) {
                            relationship = "강한 음의 상관관계";
                            explanation = `${xName}와 ${yName}는 반대 방향으로 움직이는 경향이 뚜렷합니다. 한 쪽의 하락 위험을 다른 쪽이 방어할 수 있는 강력한 헤지 자산 조합입니다. (예: 주식과 VIX)`;
                          } else if (val < -0.2) {
                            relationship = "약한 음의 상관관계";
                            explanation = `두 지표는 서로 완만하게 반대 방향으로 움직입니다. 포트폴리오 위험 배분에 긍정적인 요소입니다.`;
                          }
                          
                          return (
                            <div className="flex flex-col gap-4 h-full justify-between">
                              <div className="flex flex-col gap-2">
                                <span className="text-[9px] font-mono text-neutral-500 uppercase">{t.correlationAnalysis}</span>
                                <div className="border-b border-neutral-900 pb-2">
                                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">{selectedCell.y} × {selectedCell.x}</h4>
                                  <span className="text-lg font-display font-bold text-white">{val.toFixed(4)}</span>
                                </div>
                                <div className="mt-2">
                                  <span className={`text-[10px] font-mono font-bold uppercase ${val > 0.2 ? 'text-emerald-400' : val < -0.2 ? 'text-red-400' : 'text-neutral-400'}`}>
                                    {relationship}
                                  </span>
                                  <p className="text-xs text-neutral-400 leading-relaxed mt-1.5">
                                    {explanation}
                                  </p>
                                </div>
                              </div>
                              <div className="text-[8px] font-mono text-neutral-600 mt-4">
                                * 1년 시계열 일단위 종가 기준 피어슨 상관계수
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="flex flex-col items-center justify-center text-center py-12 text-neutral-600 h-full">
                            <Info className="w-6 h-6 mb-2 text-neutral-700" />
                            <span className="text-[10px] font-display tracking-widest uppercase">{t.selectCellForAnalysis}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Categories Grid Filters & Cards */}
                  <div className="flex flex-col gap-4">
                    {/* Category Tabs */}
                    <div className="flex flex-wrap gap-2 border-b border-neutral-900 pb-2">
                      {filterCategoriesList.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1.5 text-[9px] font-display font-bold tracking-widest border transition-all ${
                            selectedCategory === cat
                              ? "bg-white text-black border-white"
                              : "bg-black text-neutral-400 border-neutral-900 hover:text-white hover:border-neutral-800"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredCategories.map(([catName, keys]) => (
                        <div key={catName} className="border border-neutral-900 bg-[#020202] p-5 flex flex-col gap-4">
                          <h3 className="font-display text-[10px] tracking-wider text-neutral-400 border-b border-neutral-900 pb-2 uppercase font-bold">
                            {catName}
                          </h3>
                          <div className="flex flex-col gap-3">
                            {keys.map(key => {
                              const item = macroData[key];
                              if (!item) return null;
                              const isUp = item.change_5d >= 0;
                              const isSelected = selectedMacroKey === key;
                              const filteredHist = getFilteredHistory(item.history);
                              return (
                                <div 
                                  key={key} 
                                  onClick={() => setSelectedMacroKey(key)}
                                  className={`bg-[#070707] border p-4 flex flex-col justify-between hover:border-neutral-850 hover:bg-[#090909] transition-all min-w-0 cursor-pointer ${
                                    isSelected ? 'border-white ring-1 ring-white/10' : 'border-neutral-900'
                                  }`}
                                >
                                  <div className="flex items-start justify-between pointer-events-none">
                                    <div>
                                      <div className="flex items-center">
                                        <span className="text-[9px] font-mono text-neutral-500 block">{key}</span>
                                        {getAlertBadge(key, item)}
                                      </div>
                                      <span className="text-xs font-bold text-white leading-tight block">{item.name}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-sm font-display font-bold text-white block">{item.current}</span>
                                      <span className={`text-[10px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isUp ? '+' : ''}{item.change_5d}% (1Y)
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Sparkline */}
                                  {filteredHist && filteredHist.length > 0 && (
                                    <div className="h-10 w-full mt-3 min-w-0 opacity-80 hover:opacity-100 transition-opacity pointer-events-none">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={filteredHist} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                          <defs>
                                            <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.15}/>
                                              <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                            </linearGradient>
                                          </defs>
                                          <YAxis domain={["dataMin", "dataMax"]} hide={true} />
                                          <Area 
                                            type="monotone" 
                                            dataKey="value" 
                                            stroke={isUp ? "#10b981" : "#ef4444"} 
                                            strokeWidth={1.2} 
                                            fillOpacity={1} 
                                            fill={`url(#grad-${key})`} 
                                            dot={false}
                                          />
                                        </AreaChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="border border-neutral-900 bg-[#0a0a0a] p-12 flex flex-col items-center justify-center text-neutral-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                <p className="font-display text-xs tracking-widest">{t.fetchingMarketData}</p>
              </div>
            )}
          </div>
        )}

        {/* RESEARCH PIPELINE TAB */}
        {activeTab === "RESEARCH" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <div>
                <h2 className="font-display text-xl tracking-widest text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-neutral-400" />
                  {t.researchTitle}
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-1">
                  {t.researchSubtitle}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCollect} disabled={isCollecting}
                  className="button-ghost-dark flex items-center gap-2 disabled:opacity-50">
                  {isCollecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  {t.btnCollect}
                </button>
                <button onClick={handleBuildTheses} disabled={isBuildingTheses}
                  className="button-ghost-dark flex items-center gap-2 disabled:opacity-50">
                  {isBuildingTheses ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                  {t.btnBuildTheses}
                </button>
              </div>
            </div>

            {researchMsg && (
              <p className="text-[11px] text-amber-400/90 font-sans flex items-center gap-1.5">
                <Info className="w-3 h-3 flex-shrink-0" />{researchMsg}
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Stage 1 — Research Queue */}
              <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-3">
                <h3 className="font-display text-xs tracking-widest text-neutral-400 border-b border-neutral-900 pb-2 flex items-center gap-2">
                  <Newspaper className="w-3.5 h-3.5 text-white" /> {t.researchQueueLabel} ({researchQueue.length})
                </h3>
                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                  {researchQueue.length === 0 && <p className="text-[10px] text-neutral-600 italic">{t.queueEmpty}</p>}
                  {researchQueue.map((d) => {
                    const rel = d.relevance || {};
                    const top = Object.entries(rel).sort((a: any, b: any) => b[1] - a[1])[0];
                    return (
                      <div key={d.id} className="bg-[#050505] border border-neutral-900 p-2.5 flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-mono text-neutral-500 uppercase">{d.source_type} · {d.source}</span>
                          <span className="text-[9px] font-mono text-emerald-400">{(d.composite_score ?? 0).toFixed(2)}</span>
                        </div>
                        <span className="text-[11px] text-neutral-300 leading-snug">{d.title}</span>
                        {top && (top as any)[1] > 0 && (
                          <span className="text-[9px] font-mono text-neutral-500">→ {(top as any)[0]} ({((top as any)[1]).toFixed(2)})</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stage 2 — Theses */}
              <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-3">
                <h3 className="font-display text-xs tracking-widest text-neutral-400 border-b border-neutral-900 pb-2 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-white" /> {t.houseThesesLabel} ({theses.length})
                </h3>
                <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                  {theses.length === 0 && <p className="text-[10px] text-neutral-600 italic">{t.noTheses}</p>}
                  {theses.map((th) => (
                    <div
                      key={th.id}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", th.id);
                      }}
                      className="bg-[#050505] border border-neutral-900 p-2.5 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing hover:border-neutral-700 transition-all select-none"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[11px] text-white font-bold leading-snug">{th.title || `${th.asset || th.asset1}`}</span>
                        <span className="text-[9px] font-mono text-emerald-400 whitespace-nowrap">conf {(th.confidence ?? 0).toFixed(2)}</span>
                      </div>
                      <span className="text-[9px] font-mono text-neutral-500 uppercase">
                        {th.view_type === "relative" ? `${th.asset1} > ${th.asset2}` : `${th.asset} ${th.direction || ""}`} · {th.horizon || "12M"}
                      </span>
                      <span className="text-[10px] text-neutral-400 leading-snug">{th.rationale}</span>

                      {/* Bull / Bear debate transcript */}
                      {th.evidence?.debate_log?.length > 0 && (
                        <div className="mt-1.5 border-t border-neutral-900 pt-1.5 flex flex-col gap-1">
                          <span className="font-display text-[8px] text-neutral-600 tracking-widest">{t.debateLog}</span>
                          {th.evidence.debate_log.map((entry: any, di: number) => (
                            <div key={di} className="flex gap-1.5 items-start">
                              <span className={`font-display text-[8px] tracking-wider shrink-0 mt-0.5 ${
                                entry.speaker === "Bull" ? "text-emerald-500" :
                                entry.speaker === "Bear" ? "text-red-500" :
                                "text-amber-400"
                              }`}>{entry.speaker.toUpperCase()}</span>
                              <span className="text-[9px] text-neutral-500 leading-snug">{entry.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end mt-1">
                        <span className="text-[9px] font-mono text-neutral-600">{(th.provenance || []).length} {t.dragToPromote}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
 
              {/* Stage 3 — Analysis & Promotion Queue */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragOverBox3(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverBox3(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOverBox3(false);
                  const thesisId = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("thesis_id");
                  if (thesisId && !promotionQueue.includes(thesisId)) {
                    setPromotionQueue(prev => [...prev, thesisId]);
                  }
                }}
                className={`border p-4 flex flex-col gap-3 transition-all min-h-[300px] ${
                  isPromoting
                    ? "border-amber-500 bg-amber-950/10"
                    : isDragOverBox3
                      ? "border-white bg-neutral-900 scale-[1.01]"
                      : "border-dashed border-neutral-800 bg-[#0a0a0a] hover:border-neutral-700"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                  <h3 className="font-display text-xs tracking-widest text-neutral-400 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-white" /> {t.analysisPromotion}
                    {promotionQueue.length > 0 && (
                      <span className="text-[9px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded-full ml-1">
                        {promotionQueue.length} {t.queued}
                      </span>
                    )}
                  </h3>
                  {/* ▶ Promote All button */}
                  {promotionQueue.length > 0 && !isPromoting && (
                    <button
                      onClick={handleBatchPromote}
                      title="Promote all queued theses to Market Intelligence"
                      className="w-7 h-7 flex items-center justify-center bg-white hover:bg-neutral-200 transition-colors rounded-sm"
                    >
                      <svg viewBox="0 0 16 16" fill="black" className="w-3.5 h-3.5">
                        <polygon points="3,2 13,8 3,14" />
                      </svg>
                    </button>
                  )}
                  {isPromoting && (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                  )}
                </div>

                {/* Loading state */}
                {isPromoting && batchPromoteProgress && (
                  <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
                    <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                    <p className="font-display text-[10px] tracking-widest text-amber-300 uppercase">{batchPromoteProgress}</p>
                    <p className="text-[9px] text-neutral-500 max-w-[200px] leading-relaxed">
                      Running {promotionQueue.length} {t.parallelAnalyses}{promotionQueue.length > 1 ? '' : ''}…
                    </p>
                  </div>
                )}

                {/* Queued thesis cards */}
                {!isPromoting && promotionQueue.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {promotionQueue.map(tid => {
                      const t = theses.find((x: any) => x.id === tid);
                      if (!t) return null;
                      return (
                        <div key={tid} className="bg-neutral-950 border border-neutral-800 p-3 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-white leading-snug truncate">{t.title || `${t.asset || t.asset1}`}</p>
                            <p className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate">
                              {t.view_type === "relative" ? `${t.asset1} vs ${t.asset2}` : t.asset} · conf {(t.confidence_calibrated ?? t.confidence ?? 0).toFixed(2)}
                            </p>
                          </div>
                          <button
                            onClick={() => setPromotionQueue(prev => prev.filter(id => id !== tid))}
                            className="text-neutral-600 hover:text-white transition-colors text-[14px] leading-none shrink-0 mt-0.5"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Empty state drop zone */}
                {!isPromoting && promotionQueue.length === 0 && (
                  <div className="flex flex-col items-center justify-center flex-grow py-8 text-center border-2 border-dashed border-neutral-900/50 rounded-sm pointer-events-none">
                    <ArrowUpCircle className="w-10 h-10 mb-3 text-neutral-500 animate-pulse" />
                    <p className="font-display text-[10px] tracking-widest text-neutral-400 font-bold uppercase mb-1">
                      {t.dragThesesHere}
                    </p>
                    <p className="text-[9px] text-neutral-600 font-sans max-w-[200px] leading-relaxed">
                      {t.dragThesesHint}
                    </p>
                  </div>
                )}

                {/* Status message */}
                {researchMsg && !isPromoting && (
                  <div className={`p-3 text-[10px] font-sans border ${
                    researchMsg.includes("✓") || researchMsg.includes("성공") || researchMsg.includes("promoted")
                      ? "border-emerald-950 bg-emerald-950/20 text-emerald-400"
                      : "border-red-950 bg-red-950/20 text-red-400"
                  }`}>
                    {researchMsg}
                  </div>
                )}

                {/* Allocation result */}
                {allocation && allocation.status === "ok" && (
                  <div className="border border-neutral-800 bg-[#050505] p-3 flex flex-col gap-2 mt-1">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5">
                      <span className="font-display text-[9px] tracking-widest text-neutral-300">{t.allocationResult}</span>
                      <div className="flex gap-2 font-mono text-[8px]">
                        <span className={`px-1.5 py-0.5 border ${
                          allocation.regime === "CRISIS" ? "border-red-800 text-red-400" :
                          allocation.regime === "ELEVATED_RISK" ? "border-amber-800 text-amber-400" :
                          allocation.regime === "LOW_VOL" ? "border-emerald-800 text-emerald-400" :
                          "border-neutral-700 text-neutral-400"
                        }`}>{allocation.regime}</span>
                        <span className="text-neutral-600">{allocation.n_views} views</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(allocation.optimized_weights || {}).map(([asset, w]: [string, any]) => {
                        const bench = (allocation.market_weights || {})[asset] || 0;
                        const diff = (w as number) - bench;
                        return (
                          <div key={asset} className="flex justify-between items-center font-mono text-[9px]">
                            <span className="text-neutral-500 truncate">{asset.replace("_", " ")}</span>
                            <span className="flex items-center gap-1">
                              <span className="text-white">{((w as number) * 100).toFixed(1)}%</span>
                              <span className={diff > 0.005 ? "text-emerald-500" : diff < -0.005 ? "text-red-500" : "text-neutral-600"}>
                                {diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {allocation.risk_metrics && (
                      <div className="flex gap-3 border-t border-neutral-900 pt-1.5 font-mono text-[8px] text-neutral-500">
                        <span>Ret: <span className="text-white">{((allocation.risk_metrics.expected_return || 0) * 100).toFixed(1)}%</span></span>
                        <span>Vol: <span className="text-white">{((allocation.risk_metrics.volatility || 0) * 100).toFixed(1)}%</span></span>
                        <span>VaR95: <span className="text-white">{((allocation.risk_metrics.var_95 || 0) * 100).toFixed(1)}%</span></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HELP TAB */}
        {activeTab === "HELP" && (() => {
          const HELP_STEP_ICONS = [Newspaper, MessageSquare, TrendingUp, Upload, Play, Info];
          const HELP_STEPS = t.helpSteps.map((s, idx) => ({
            id: idx + 1,
            title: s.title,
            subtitle: s.subtitle,
            icon: HELP_STEP_ICONS[idx],
            description: s.description,
            howItWorks: s.howItWorks,
            tip: s.tip,
          }));
          const step = HELP_STEPS.find(s => s.id === activeHelpStep)!;
          const StepIcon = step.icon;
          return (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
                <div>
                  <h2 className="font-display text-xl tracking-widest text-white flex items-center gap-2">
                    <Info className="w-5 h-5 text-neutral-400" />
                    {t.helpTitle}
                  </h2>
                  <p className="text-xs text-neutral-500 font-sans mt-1">
                    {t.helpSubtitle}
                  </p>
                </div>
              </div>

              {/* Step Timeline Flow Progress */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 border-b border-neutral-900 pb-6">
                {HELP_STEPS.map((s) => {
                  const SIcon = s.icon;
                  const isActive = activeHelpStep === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveHelpStep(s.id)}
                      className={`flex flex-col gap-2 p-4 border transition-all text-left relative cursor-pointer ${
                        isActive 
                          ? "bg-[#0c0c0c] border-white ring-1 ring-white/10" 
                          : "bg-[#050505] border-neutral-900 hover:border-neutral-850 hover:bg-[#070707]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-neutral-500 font-bold">STEP 0{s.id}</span>
                        <SIcon className={`w-4 h-4 ${isActive ? "text-white" : "text-neutral-600"}`} />
                      </div>
                      <div>
                        <h4 className="font-display text-[10px] tracking-wider font-bold text-white uppercase">{s.title}</h4>
                        <p className="text-[9px] text-neutral-500 font-sans mt-0.5">{s.subtitle}</p>
                      </div>
                      {s.id < 6 && (
                        <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 -right-1.5 z-10 bg-black rounded-full border border-neutral-900 p-0.5">
                          <ChevronRight className="w-2.5 h-2.5 text-neutral-600" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Step Details Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 border border-neutral-900 bg-[#050505] p-6">
                <div className="lg:col-span-3 flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-neutral-900 border border-neutral-850 p-3 rounded-sm">
                      <StepIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <span className="font-mono text-[9px] text-neutral-500 font-bold uppercase tracking-wider">{t.helpOpPhase} 0{step.id}</span>
                      <h3 className="font-display text-base tracking-widest text-white font-bold">{step.title}: {step.subtitle.toUpperCase()}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    {step.description}
                  </p>

                  <div className="flex flex-col gap-2">
                    <h4 className="font-display text-[9px] tracking-wider text-neutral-500 uppercase font-bold">{t.helpSOP}</h4>
                    <ol className="list-decimal list-inside pl-1 flex flex-col gap-2 text-xs text-neutral-400 font-sans">
                      {step.howItWorks.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          <span className="text-neutral-300">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="border-t border-neutral-950 pt-4 flex gap-3 items-start">
                    <Info className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-neutral-500 font-sans leading-relaxed">
                      <strong className="text-neutral-400 font-display">{t.helpProTip}</strong> {step.tip}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 border border-neutral-900 bg-black p-5 flex flex-col justify-between min-h-[250px] relative overflow-hidden">
                   {activeHelpStep === 1 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK FEED_CRAWLER</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                       </div>
                       <div className="flex flex-col gap-2 flex-grow justify-center">
                         <div className="bg-[#050505] border border-neutral-900 p-2 text-[9px] font-mono text-neutral-400 flex justify-between">
                           <span>US 10Y Yield RSS Feed</span>
                           <span className="text-emerald-400">SUCCESS</span>
                         </div>
                         <div className="bg-[#050505] border border-neutral-900 p-2 text-[9px] font-mono text-neutral-400 flex justify-between">
                           <span>Bloomberg Macro RSS Feed</span>
                           <span className="text-emerald-400">SUCCESS</span>
                         </div>
                         <div className="bg-[#050505] border border-neutral-900 p-2 text-[9px] font-mono text-neutral-400 flex justify-between">
                           <span>Yahoo Finance Stock API</span>
                           <span className="text-emerald-400">SUCCESS</span>
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         FEED SYNCHRONIZATION DIAGRAM
                       </div>
                     </div>
                   )}
                   {activeHelpStep === 2 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK NEMOTRON_LLM</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                       </div>
                       <div className="flex flex-col gap-2 flex-grow justify-center">
                         <div className="border border-amber-900/30 bg-amber-950/5 p-2 rounded-sm text-[9px] font-sans text-neutral-300">
                           <div className="font-bold text-white mb-0.5">AI DRAFT THESIS: GLOBAL_STOCK BULLISH</div>
                           "Expected return +12% based on AI analysis of inflation easing."
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         PROBABILITY ENCODING SCHEMATIC
                       </div>
                     </div>
                   )}
                   {activeHelpStep === 3 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK DRAG_DROP</span>
                         <span className="text-neutral-500 font-mono text-[8px]">DRAG: COL 2 → COL 3</span>
                       </div>
                       <div className="flex-grow flex items-center justify-center gap-2">
                         <div className="border border-neutral-900 bg-[#050505] p-3 text-[9px] text-neutral-400 opacity-60">
                           Thesis Card
                         </div>
                         <span className="text-neutral-700">→</span>
                         <div className="border border-dashed border-neutral-700 bg-neutral-900/20 p-3 text-[9px] text-white flex flex-col items-center">
                           <span>Drop Zone</span>
                           <span className="text-[7px] text-neutral-500">(Promotion)</span>
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         PROMOTION PIPELINE SCHEMATIC
                       </div>
                     </div>
                   )}
                   {activeHelpStep === 4 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK SIMULATION_DOCK</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                       </div>
                       <div className="flex-grow flex flex-col justify-end gap-1.5">
                         <div className="backdrop-blur-md bg-neutral-900/50 border border-neutral-800 rounded-full px-3 py-1 flex items-center justify-between text-[8px]">
                           <span className="text-neutral-400 font-display">Simulation Basket (2 Active)</span>
                           <span className="w-4 h-4 bg-white text-black rounded-full flex items-center justify-center font-mono font-bold">▶</span>
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         LIQUID GLASS FLOATING DOCK MOCKUP
                       </div>
                     </div>
                   )}
                   {activeHelpStep === 5 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK BL_ENGINE</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                       </div>
                       <div className="flex-grow flex flex-col justify-center gap-1">
                         <div className="text-[9px] font-mono text-neutral-500">Bayesian Posterior Formula:</div>
                         <div className="bg-neutral-950 p-2 border border-neutral-900 text-center font-serif text-[10px] text-white my-1">
                           E(R) = [ (τΣ)⁻¹ + PᵀΩ⁻¹P ]⁻¹ [ (τΣ)⁻¹Π + PᵀΩ⁻¹Q ]
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         BLACK-LITTERMAN BAYESIAN EQUATION
                       </div>
                     </div>
                   )}
                   {activeHelpStep === 6 && (
                     <div className="flex flex-col gap-3 h-full justify-between">
                       <div className="flex justify-between items-center border-b border-neutral-950 pb-2">
                         <span className="font-mono text-[8px] text-neutral-500">MOCK PDF_REPORTER</span>
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                       </div>
                       <div className="flex-grow flex items-center justify-center">
                         <div className="border border-neutral-800 bg-neutral-900/10 p-3 rounded-sm shadow-sm flex flex-col gap-1 text-[8px] font-mono">
                           <div className="font-bold border-b border-neutral-850 pb-1 text-white">NPS ALLOCATION REPORT</div>
                           <div>Exp Ret: 8.42%</div>
                           <div>Vol: 9.15%</div>
                           <div>Sharpe: 0.92</div>
                         </div>
                       </div>
                       <div className="text-center font-display text-[9px] tracking-widest text-neutral-600">
                         ONE-PAGE REPORT PREVIEW
                       </div>
                     </div>
                   )}
                </div>
              </div>
            </div>
          );
        })()}

      </div>

      {/* Hovering Active Simulation Dock */}
      {(selectedTheses.length > 0 || activeTab === "INTELLIGENCE") && (
        <div 
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverDock(true);
          }}
          onDragLeave={() => setIsDragOverDock(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverDock(false);
            const id = e.dataTransfer.getData("thesis_id") || e.dataTransfer.getData("text/plain");
            if (id) {
              setSelectedTheses(prev => prev.includes(id) ? prev : [...prev, id]);
            }
          }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-6 transition-all duration-500 cubic-bezier(0.175, 0.885, 0.32, 1.275) ${
            selectedTheses.length > 0 ? "translate-y-0 opacity-100" : "translate-y-4 opacity-90"
          }`}
        >
          <div className={`backdrop-blur-lg bg-neutral-950/80 border rounded-full px-6 py-3 shadow-[0_24px_50px_rgba(0,0,0,0.7)] flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-500 cubic-bezier(0.175, 0.885, 0.32, 1.275) ${
            isDragOverDock ? "border-white ring-4 ring-white/10 scale-105" : "border-neutral-800"
          }`}>
            <div className="flex flex-col gap-1 flex-grow w-full md:w-auto pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-display text-[9px] tracking-widest text-neutral-400 font-bold uppercase">
                  {t.activeBasket}
                </span>
                <span className="text-[9px] font-mono bg-neutral-900 text-neutral-400 px-1.5 py-0.2 border border-neutral-850 rounded-full">
                  {selectedTheses.length} {t.sourcesActive}
                </span>
              </div>
              
              {selectedTheses.length === 0 ? (
                <div className="text-neutral-500 font-sans text-[10px] pl-4">
                  {t.dragDropHint}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1 pointer-events-auto">
                  {selectedTheses.map(id => {
                    const thesis = intelligenceFeed.find(t => t.id === id);
                    if (!thesis) return null;
                    const cat = thesis.category || "NEWS";
                    return (
                      <div key={id} className="flex items-center gap-2 bg-neutral-900 border border-neutral-855 hover:border-neutral-700 px-3.5 py-1 rounded-full text-[11px] text-neutral-300 transition-all font-sans shadow-sm">
                        <span className={`text-[8px] font-display font-bold uppercase tracking-wider ${
                          cat === "RESEARCH" ? "text-amber-400" : cat === "NEWS" ? "text-blue-400" : "text-purple-400"
                        }`}>
                          {cat === "RESEARCH" ? "RESEARCH" : cat === "NEWS" ? "NEWS" : "ASSET"}
                        </span>
                        <span className="truncate max-w-[140px] font-medium">{thesis.title}</span>
                        <button 
                          onClick={() => setSelectedTheses(prev => prev.filter(t => t !== id))}
                          className="text-neutral-500 hover:text-white ml-1 font-mono hover:bg-neutral-950 rounded-full w-4 h-4 flex items-center justify-center text-[9px] transition-all"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="flex gap-3 w-full md:w-auto flex-shrink-0 items-center justify-end">
              <button 
                onClick={() => setSelectedTheses([])}
                disabled={selectedTheses.length === 0}
                className="button-ghost-dark text-[9px] px-3 py-1.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed uppercase font-mono tracking-wider"
              >
                {t.clear}
              </button>
              <button 
                onClick={() => setShowRunConfirmModal(true)}
                disabled={selectedTheses.length === 0}
                className="bg-white hover:bg-neutral-200 text-black p-3.5 rounded-full shadow-lg shadow-white/5 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 flex items-center justify-center border border-white w-10 h-10 flex-shrink-0"
                title="Apply active basket to Simulator"
              >
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Popup */}
      {showRunConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <h3 className="font-display text-xs tracking-wider text-neutral-300 font-bold uppercase flex items-center gap-2">
                <Cpu className="w-4 h-4 text-white" />
                {t.confirmSimulation}
              </h3>
              <button 
                onClick={() => setShowRunConfirmModal(false)}
                className="text-neutral-500 hover:text-white font-mono text-xs hover:bg-neutral-900 rounded px-1.5 py-0.5"
              >
                {t.closeModal}
              </button>
            </div>

            {/* Included Sources List */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-display tracking-widest text-neutral-500 uppercase font-bold">
                {t.includedSources} ({selectedTheses.length})
              </span>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto bg-black border border-neutral-900 p-3 rounded-lg">
                {selectedTheses.map(id => {
                  const thesis = intelligenceFeed.find(t => t.id === id);
                  if (!thesis) return null;
                  const cat = thesis.category || "NEWS";
                  return (
                    <div key={id} className="text-[10px] flex items-center gap-2 text-neutral-300 border-b border-neutral-950 pb-1 last:border-0 last:pb-0">
                      <span className={`text-[8px] font-display font-bold px-1.5 py-0.2 rounded-full border ${
                        cat === "RESEARCH" ? "bg-amber-950/20 text-amber-400 border-amber-900/40" : 
                        cat === "NEWS" ? "bg-blue-950/20 text-blue-400 border-blue-900/40" : 
                        "bg-purple-950/20 text-purple-400 border-purple-900/40"
                      }`}>
                        {cat === "RESEARCH" ? t.npsHouseView : cat === "NEWS" ? t.marketNews : t.userAssetLabel}
                      </span>
                      <span className="truncate flex-grow font-sans font-medium">{thesis.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Max Deviation Limits Slider (δ) */}
            <div className="flex flex-col gap-2 border-t border-neutral-950 pt-3">
              <div className="flex justify-between items-center text-[10px] font-display tracking-widest text-neutral-400 font-bold">
                <span>{t.maxDeviation}</span>
                <span className="text-white font-mono bg-neutral-900 px-2 py-0.5 border border-neutral-800 rounded">{(maxDeviation * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0.01" 
                max="0.30" 
                step="0.01" 
                value={maxDeviation} 
                onChange={(e) => setMaxDeviation(parseFloat(e.target.value))}
                className="w-full accent-white bg-neutral-900 h-1 cursor-pointer mt-1"
              />
              <p className="text-[9px] text-neutral-600 leading-normal font-sans">
                {t.maxDeviationHint}
              </p>
            </div>

            {/* Optimizer Selection */}
            <div className="flex flex-col gap-2 border-t border-neutral-950 pt-3">
              <label className="text-[10px] font-display tracking-widest text-neutral-400 font-bold uppercase">{t.optimizationEngine}</label>
              <select
                value={optimizer}
                onChange={(e) => setOptimizer(e.target.value)}
                className="w-full bg-black border border-neutral-900 p-2.5 rounded text-xs outline-none text-white focus:border-white cursor-pointer font-sans"
              >
                <option value="ensemble">{t.optEnsembleDesc}</option>
                <option value="risk_parity">{t.optRpDesc}</option>
                <option value="markowitz">{t.optMvoDesc}</option>
                <option value="hrp">{t.optHrpDesc}</option>
                <option value="resampled">{t.optResampledDesc}</option>
              </select>
              <p className="text-[9px] text-neutral-600 leading-normal font-sans text-neutral-400">
                {optimizer === "ensemble" && t.optEnsembleHint}
                {optimizer === "risk_parity" && t.optRpHint}
                {optimizer === "markowitz" && t.optMvoHint}
                {optimizer === "hrp" && t.optHrpHint}
                {optimizer === "resampled" && t.optResampledHint}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end border-t border-neutral-900 pt-4 mt-1">
              <button 
                onClick={() => setShowRunConfirmModal(false)}
                className="button-ghost-dark text-[9px] px-4 py-2 font-mono"
              >
                {t.cancelBtn}
              </button>
              <button 
                onClick={() => {
                  setShowRunConfirmModal(false);
                  applyToSimulator(optimizer, maxDeviation);
                }}
                className="bg-white hover:bg-neutral-200 text-black font-display font-bold text-[9px] tracking-widest px-5 py-2 border border-white transition-all uppercase flex items-center gap-1.5 rounded-sm"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                {t.executeSimulation}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {data && (
        <div id="portfolio-pdf-report-root" className="hidden print:block bg-white text-black p-8 font-sans w-full max-w-[800px] mx-auto min-h-screen">
          {/* Header */}
          <div className="border-b-2 border-black pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-black">{t.pdfOrgTitle}</h1>
                <h2 className="text-base font-semibold text-neutral-800">{t.pdfReportTitle}</h2>
                <p className="text-[10px] text-neutral-500 mt-1">{t.pdfEngineOutput}</p>
              </div>
              <div className="text-right text-[10px] font-mono text-neutral-600">
                <div>{t.pdfRunId}{data.simulation_id}</div>
                <div>{t.pdfDate} {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</div>
                <div>{t.pdfEngine} {optimizer === "risk_parity" ? "Risk Parity (Recommended)" : optimizer === "markowitz" ? "Markowitz Sharpe Max" : "Hierarchical Risk Parity (HRP)"}</div>
                <div>{t.pdfDevLimit} {(maxDeviation * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>

          {/* Section 1: Executive Metrics Summary */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-300 pb-1 mb-3">
              {t.pdfSection1}
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1 font-semibold">{t.pdfMetric}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfStrategicBenchmark}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfOptimizedPortfolio}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfActiveVariance}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfExpReturn}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">{data.benchmark_portfolio ? formatPercent(data.benchmark_portfolio.return / 100) : "N/A"}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(data.risk_metrics.expected_return)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">
                    {data.benchmark_portfolio ? `${((data.risk_metrics.expected_return - data.benchmark_portfolio.return / 100) * 100).toFixed(2)}%` : "N/A"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfAnnualVol}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">{data.benchmark_portfolio ? formatPercent(data.benchmark_portfolio.volatility / 100) : "N/A"}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(data.risk_metrics.volatility)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">
                    {data.benchmark_portfolio ? `${((data.risk_metrics.volatility - data.benchmark_portfolio.volatility / 100) * 100).toFixed(2)}%` : "N/A"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfExpSharpe}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">{data.benchmark_portfolio ? data.benchmark_portfolio.sharpe.toFixed(2) : "N/A"}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{metrics.sharpe.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">
                    {data.benchmark_portfolio ? (metrics.sharpe - data.benchmark_portfolio.sharpe).toFixed(2) : "N/A"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfVar95}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(data.risk_metrics.var_95)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfCvar95}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(data.risk_metrics.cvar_95)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-neutral-800">{t.pdfMaxDd}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(data.risk_metrics.max_drawdown_estimate)}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-700">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 2: Portfolio Allocations & Views */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-300 pb-1 mb-3">
              {t.pdfSection2}
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1 font-semibold">{t.pdfAssetClass}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfStrategicBenchmark}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfOptimizedWeight}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfActiveWeight}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfPriorReturn}</th>
                  <th className="py-1 text-right font-semibold">{t.pdfPosteriorReturn}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {Object.keys(data.market_weights).map(asset => {
                  const benchWt = data.market_weights[asset];
                  const optWt = data.optimized_weights[asset];
                  const diffWt = optWt - benchWt;
                  const priorRet = data.prior_returns?.[asset] || 0;
                  const postRet = data.posterior_returns[asset] || 0;
                  return (
                    <tr key={asset}>
                      <td className="py-1.5 font-medium text-neutral-800">{ASSET_LABELS[asset] || asset}</td>
                      <td className="py-1.5 text-right font-mono text-neutral-700">{formatPercent(benchWt)}</td>
                      <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(optWt)}</td>
                      <td className={`py-1.5 text-right font-mono font-semibold ${diffWt >= 0 ? "text-neutral-900" : "text-neutral-600"}`}>
                        {diffWt >= 0 ? "+" : ""}{formatPercent(diffWt)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-neutral-700">{formatPercent(priorRet)}</td>
                      <td className="py-1.5 text-right font-mono font-bold text-black">{formatPercent(postRet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 3: Stress Scenario shock test */}
          {data.historical_stress_tests && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-300 pb-1 mb-3">
                {t.pdfSection3}
              </h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-black">
                    <th className="py-1 font-semibold">{t.pdfCrisisScenario}</th>
                    <th className="py-1 text-right font-semibold">{t.pdfPortfolioReturn}</th>
                    <th className="py-1 text-right font-semibold">{t.pdfKrStockImpact}</th>
                    <th className="py-1 text-right font-semibold">{t.pdfGlobalStockImpact}</th>
                    <th className="py-1 text-right font-semibold">{t.pdfAltImpact}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {data.historical_stress_tests.map((sc, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-medium text-neutral-800">{sc.name_kr} ({sc.name})</td>
                      <td className={`py-1.5 text-right font-mono font-bold ${sc.portfolio_return < 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {formatPercent(sc.portfolio_return)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-neutral-700">
                        {sc.asset_impacts.KR_STOCK < 0 ? "" : "+"}{formatPercent(sc.asset_impacts.KR_STOCK)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-neutral-700">
                        {sc.asset_impacts.GLOBAL_STOCK < 0 ? "" : "+"}{formatPercent(sc.asset_impacts.GLOBAL_STOCK)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-neutral-700">
                        {sc.asset_impacts.ALTERNATIVE < 0 ? "" : "+"}{formatPercent(sc.asset_impacts.ALTERNATIVE)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section 4: Executive Commentary */}
          {data.ai_commentary && (
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-300 pb-1 mb-2">
                {t.pdfSection4}
              </h3>
              <p className="text-[10px] text-neutral-700 font-sans leading-relaxed whitespace-pre-line border border-neutral-200 p-3 bg-neutral-50/50 rounded-sm">
                {data.ai_commentary.split("=============================================================================").pop()?.trim()}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-neutral-300 pt-3 mt-8 text-center text-[9px] text-neutral-500">
            <div>{t.pdfFooterConfidential}</div>
            <div className="mt-0.5">{t.pdfFooterCopyright}</div>
          </div>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          #main-terminal-layout {
            display: none !important;
          }
          #portfolio-pdf-report-root {
            display: block !important;
            background-color: white !important;
            color: black !important;
          }
        }
      `}</style>
    </>
  );
}
