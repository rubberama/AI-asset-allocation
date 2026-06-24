"use client";

import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, ReferenceLine, ScatterChart, Scatter
} from "recharts";
import { 
  TrendingUp, ShieldAlert, Cpu, BarChart3, LineChart as LineIcon, 
  RefreshCw, Play, AlertCircle, Info, History, Globe, Newspaper,
  MessageSquare, CheckCircle2, ChevronRight, Check
} from "lucide-react";

// Asset translation
const ASSET_LABELS: Record<string, string> = {
  KR_STOCK: "국내주식 (EWY)",
  GLOBAL_STOCK: "해외주식 (VT)",
  KR_BOND: "국내채권 (KBSTAR)",
  GLOBAL_BOND: "해외채권 (BNDX)",
  ALTERNATIVE: "대체투자 (VNQ)"
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

interface SimulationData {
  simulation_id: number;
  market_weights: Record<string, number>;
  parsed_views: ViewItem[];
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
  user_view: string;
  optimizer: string;
}

type TabType = "SIMULATOR" | "INTELLIGENCE" | "MACRO";

interface Thesis {
  id: string;
  author: string;
  author_title: string;
  source: string;
  date: string;
  title: string;
  content: string;
  image_url: string;
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
  };
}

export default function Dashboard() {
  // User Inputs
  const [viewText, setViewText] = useState("해외주식이 국내주식보다 연 5% 우세할 것 같다. 그리고 금리는 하락할 것이다.");
  const [optimizer, setOptimizer] = useState("markowitz");
  const [maxDeviation, setMaxDeviation] = useState<number>(0.10); // Default 10%
  
  // App States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SimulationData | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000");
  const [simulationsList, setSimulationsList] = useState<SimulationMeta[]>([]);

  // Streaming States
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState<string>("");

  // Tab & New Feature States
  const [activeTab, setActiveTab] = useState<TabType>("SIMULATOR");
  const [intelligenceFeed, setIntelligenceFeed] = useState<Thesis[]>([]);
  const [macroData, setMacroData] = useState<any | null>(null);
  const [selectedTheses, setSelectedTheses] = useState<string[]>([]);
  const [userComments, setUserComments] = useState<Record<string, string>>({});
  const [isFetchingMacro, setIsFetchingMacro] = useState(false);
  const [selectedThesisId, setSelectedThesisId] = useState<string | null>(null);
  const [isRefreshingIntel, setIsRefreshingIntel] = useState(false);

  // Search, Category, and Sorting States
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "EQUITY" | "BOND" | "ALTERNATIVE">("ALL");
  const [sortMode, setSortMode] = useState<"CHRONOLOGICAL" | "RANKED">("CHRONOLOGICAL");

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
    let result = [...intelligenceFeed];

    // 1. Category Filter
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
  }, [intelligenceFeed, searchQuery, categoryFilter, sortMode]);

  // Fetch initial simulation & history list
  useEffect(() => {
    handleRunSimulation();
    fetchSimulationsList();
    fetchIntelligenceFeed();
    fetchMacroData();
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
    try {
      const res = await fetch(`${apiBaseUrl}/market-intelligence/refresh`, {
        method: "POST"
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        setIntelligenceFeed(data);
        if (data.length > 0) {
          setSelectedThesisId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to refresh intelligence:", err);
    } finally {
      setIsRefreshingIntel(false);
    }
  };

  const fetchMacroData = async () => {
    setIsFetchingMacro(true);
    try {
      const res = await fetch(`${apiBaseUrl}/macro-data`);
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

  const applyToSimulator = () => {
    if (selectedTheses.length === 0) return;
    
    let combinedViewText = viewText ? viewText + "\n\n" : "";
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

  const handleRunSimulation = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStep(0);
    setLoadingMessage("서버와의 연결을 초기화하고 있습니다...");
    setData(null);
    
    try {
      const response = await fetch(`${apiBaseUrl}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          view_text: viewText, 
          optimizer,
          max_deviation: maxDeviation
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
      name: ASSET_LABELS[asset] || asset,
      "국민연금 (Market)": Math.round(data.market_weights[asset] * 1000) / 10,
      "최적 포트폴리오 (BL)": Math.round(data.optimized_weights[asset] * 1000) / 10
    }));
  };

  const getReturnsData = () => {
    if (!data) return [];
    return Object.keys(data.market_weights).map(asset => ({
      name: ASSET_LABELS[asset] || asset,
      "시장 균형수익률 (Prior)": Math.round((data.prior_returns?.[asset] || 0) * 1000) / 10,
      "BL 기대수익률 (Posterior)": Math.round(data.posterior_returns[asset] * 1000) / 10
    }));
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
    <div className="min-h-screen bg-black text-white flex flex-col font-ui selection:bg-white selection:text-black">
      {/* Top Navbar */}
      <nav className="border-b border-neutral-950 sticky top-0 bg-black/90 backdrop-blur z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-display text-lg tracking-[0.2em]">SPACEX</span>
            <span className="text-neutral-700 text-xs font-light">|</span>
            <span className="font-display text-xs tracking-wider text-neutral-400 hidden md:inline">NPS MISSION CONTROL</span>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => setActiveTab("SIMULATOR")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "SIMULATOR" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              PORTFOLIO SIMULATOR
            </button>
            <button 
              onClick={() => setActiveTab("INTELLIGENCE")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "INTELLIGENCE" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              MARKET INTELLIGENCE
            </button>
            <button 
              onClick={() => setActiveTab("MACRO")}
              className={`font-display text-[10px] tracking-widest pb-1 border-b-2 transition-colors ${activeTab === "MACRO" ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              MACRO DASHBOARD
            </button>
          </div>
          <div className="flex gap-4 items-center text-xs">
            {data && data.macro_context && data.macro_context.market_regime && (
              <div className="flex gap-2 items-center text-[10px] text-neutral-400 border border-neutral-900 px-3 py-1 bg-neutral-950/50">
                <span>MARKET REGIME:</span>
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
            <div className="flex gap-2 items-center text-[10px] text-neutral-400 border border-neutral-900 px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              <span>HOST:</span>
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
        <aside className="lg:col-span-1 flex flex-col gap-8">
          
          {/* Main Controls Card */}
          <div className="bg-[#0a0a0a] border border-neutral-900 p-6 flex flex-col gap-6">
            <h2 className="font-display text-sm tracking-wider text-neutral-400 border-b border-neutral-900 pb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-white" />
              SYSTEM PARAMETERS
            </h2>

            {/* Input View Text */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-display tracking-widest text-neutral-500 flex justify-between">
                <span>INVESTMENT THESIS (VIEW)</span>
                <span className="text-white hover:underline cursor-pointer flex items-center gap-1" 
                      onClick={() => setViewText("미국 주식이 매우 유망하여 연 15% 수익이 기대되며 국내 주식은 횡보할 것이다.")}>
                  <RefreshCw className="w-2.5 h-2.5" /> LOAD EXAMPLE
                </span>
              </label>
              <textarea
                value={viewText}
                onChange={(e) => setViewText(e.target.value)}
                placeholder="시장 전망을 자연어로 작성해 주세요."
                rows={5}
                className="w-full bg-[#050505] border border-neutral-900 p-3 text-xs outline-none text-white focus:border-white transition-colors duration-200 resize-none font-sans"
              />
            </div>

            {/* Max Deviation Limits Slider */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-display tracking-widest text-neutral-500 flex justify-between">
                <span>MAX BENCHMARK DEVIATION (δ)</span>
                <span className="text-white font-mono">{(maxDeviation * 100).toFixed(0)}%</span>
              </label>
              <input 
                type="range" 
                min="0.01" 
                max="0.30" 
                step="0.01" 
                value={maxDeviation} 
                onChange={(e) => setMaxDeviation(parseFloat(e.target.value))}
                className="w-full accent-white bg-neutral-900 h-1 cursor-pointer"
              />
              <p className="text-[9px] text-neutral-600 leading-normal font-sans">
                최적화 포트폴리오 가중치가 국민연금 기준 비중에서 최대 이탈할 수 있는 상하한 범위 제한선입니다.
              </p>
            </div>

            {/* Optimizer Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-display tracking-widest text-neutral-500">OPTIMIZATION ENGINE</label>
              <select
                value={optimizer}
                onChange={(e) => setOptimizer(e.target.value)}
                className="w-full bg-[#050505] border border-neutral-900 p-2.5 text-xs outline-none text-white focus:border-white cursor-pointer"
              >
                <option value="markowitz">MARKOWITZ MVO (SHARPE MAX)</option>
                <option value="risk_parity">RISK PARITY (RISK BUDGET EQUAL)</option>
                <option value="hrp">HIERARCHICAL RISK PARITY (HRP)</option>
              </select>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleRunSimulation}
              disabled={isLoading}
              className="button-ghost-dark w-full mt-2 cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  CALCULATING...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-white" />
                  RUN SIMULATION
                </>
              )}
            </button>
          </div>

          {/* Past Simulations History Sidebar */}
          <div className="bg-[#0a0a0a] border border-neutral-900 p-6 flex flex-col gap-4">
            <h3 className="font-display text-sm tracking-wider text-neutral-400 border-b border-neutral-900 pb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-white" />
              SIMULATION HISTORY
            </h3>
            
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
              {simulationsList.length === 0 ? (
                <p className="text-[10px] text-neutral-600 italic">기록된 시뮬레이션이 없습니다.</p>
              ) : (
                simulationsList.map((sim) => (
                  <button
                    key={sim.id}
                    onClick={() => handleLoadSimulation(sim.id)}
                    className="w-full text-left bg-[#050505] hover:bg-neutral-950 border border-neutral-900 hover:border-neutral-800 p-3 transition flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                      <span>RUN #{sim.id}</span>
                      <span>{new Date(sim.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[10px] text-neutral-300 font-sans line-clamp-2 leading-relaxed">
                      {sim.user_view}
                    </p>
                    <span className="text-[8px] font-display text-neutral-600 mt-1">
                      {sim.optimizer.toUpperCase()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* AI Parser Thesis Card */}
          {data && data.parsed_views.length > 0 && (
            <div className="bg-[#0a0a0a] border border-neutral-900 p-6 flex flex-col gap-4">
              <h3 className="font-display text-sm tracking-wider text-neutral-400 border-b border-neutral-900 pb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-white" />
                AI INTERPRETATION
              </h3>
              
              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                {data.parsed_views.map((v, i) => (
                  <div key={i} className="border border-neutral-900 p-3 text-[10px] flex flex-col gap-2">
                    <div className="flex justify-between items-center font-display text-[9px]">
                      <span className="text-white border border-neutral-700 px-1 py-0.5">
                        {v.view_type.toUpperCase()} VIEW
                      </span>
                      <span className="text-neutral-500 font-mono">CONF: {(v.confidence * 100).toFixed(0)}%</span>
                    </div>

                    <div className="font-semibold text-neutral-200">
                      {v.view_type === "absolute" ? (
                        <p>
                          <span>{ASSET_LABELS[v.asset!] || v.asset}</span>: 
                          <span className="text-neutral-100 ml-1">+{formatPercent(v.expected_return!)}</span>
                        </p>
                      ) : (
                        <p>
                          <span>{ASSET_LABELS[v.asset1!] || v.asset1}</span> vs <span>{ASSET_LABELS[v.asset2!] || v.asset2}</span>:
                          <span className="text-neutral-100 font-bold ml-1">+{formatPercent(v.outperformance!)}</span>
                        </p>
                      )}
                    </div>
                    
                    {v.thesis && (
                      <div className="text-[10px] text-neutral-400 leading-relaxed font-sans border-t border-neutral-900 pt-1.5">
                        <span className="font-display text-[8px] text-neutral-500 block mb-0.5">THESIS</span>
                        {v.thesis}
                      </div>
                    )}
                  </div>
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
                <h4 className="font-display text-xs tracking-wider text-white">SYSTEM ANOMALY DETECTED</h4>
                <p className="text-xs text-neutral-400 mt-1 font-sans leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Loading Stepper */}
          {!data && !error && (
            <div className="border border-neutral-900 bg-[#0a0a0a] p-8 flex flex-col gap-6 min-h-[500px] justify-center items-center">
              <div className="text-center flex flex-col items-center gap-2 max-w-md mb-4">
                <RefreshCw className="w-8 h-8 text-neutral-600 animate-spin mb-2" />
                <h3 className="font-display text-sm tracking-wider text-neutral-300">PORTFOLIO SIMULATION PIPELINE</h3>
                <p className="text-xs text-neutral-500 leading-relaxed font-sans">
                  FastAPI 백엔드에서 실시간 베이지안 업데이트 연산 및 10,000회 몬테카를로 경로 시뮬레이션을 진행하고 있습니다.
                </p>
              </div>

              {/* Progress Stepper List */}
              <div className="w-full max-w-lg bg-[#050505] border border-neutral-900 p-6 flex flex-col gap-4">
                {[
                  { id: 1, label: "MARKET PORTFOLIO RETRIEVAL", desc: "국민연금 공시 비중 및 2026 자산배분 목표치 로드" },
                  { id: 2, label: "ETF HISTORICAL FEED & TREASURY CRAWL", desc: "대표 ETF 시세 데이터 수집 및 10년물 국채 금리 연계" },
                  { id: 3, label: "LLM VIEW ENCODING (OPENROUTER)", desc: "자연어 시각을 AI 모델(owl-alpha)을 이용해 수치형 매트릭스로 변환" },
                  { id: 4, label: "BAYESIAN BLACK-LITTERMAN COMBINATION", desc: "Prior와 View의 확률 결합을 통해 사후 기대수익률 분포 추정" },
                  { id: 5, label: "CONSTRAINED MULTI-ASSET OPTIMIZATION", desc: "설정 제약조건 범위(δ) 내에서 최적의 가중치 행렬 도출" },
                  { id: 6, label: "10,000-TRIAL MONTE CARLO STRESS TEST", desc: "Student-t 분포(Fat Tail) 기반 몬테카를로 경로 시뮬레이션" },
                  { id: 7, label: "HISTORICAL CRISIS SCENARIO SHOCK TEST", desc: "역사적 금융 위기 시나리오(GFC, 코로나19 등) 스트레스 테스트 수행" },
                  { id: 8, label: "REAL-TIME MACRO & AI INVESTMENT REPORTING", desc: "실시간 매크로 지표 분석 및 AI 포트폴리오 코멘터리 생성" }
                ].map((step) => {
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
                            <span className="text-neutral-500 font-mono text-[9px] animate-pulse">RUNNING</span>
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
            </div>
          )}

          {/* Dashboard Visualizer */}
          {data && (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                
                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">EXP RETURN</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.expected_return)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">PORTFOLIO VOL</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.volatility)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">SHARPE RATIO</span>
                  <span className="text-xl font-display text-white">
                    {metrics.sharpe.toFixed(2)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">95% VAR (1Y)</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.var_95)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">95% CVAR (1Y)</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.cvar_95)}
                  </span>
                </div>

                <div className="border border-neutral-900 bg-[#0a0a0a] p-4 flex flex-col gap-1 text-center justify-center">
                  <span className="text-[9px] font-display tracking-widest text-neutral-500">MAX DRAWDOWN</span>
                  <span className="text-xl font-display text-white">
                    {formatPercent(data.risk_metrics.max_drawdown_estimate)}
                  </span>
                </div>

              </div>

              {/* AI Analysis Commentary & Macro Indicators */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* AI Commentary Card */}
                <div className="lg:col-span-2 border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-white" />
                      AI PORTFOLIO ANALYSIS & INVESTMENT COMMENTARY
                    </h3>
                  </div>
                  <div className="text-xs text-neutral-300 font-sans leading-relaxed whitespace-pre-line max-h-[220px] overflow-y-auto pr-2">
                    {data.ai_commentary ? (
                      data.ai_commentary
                    ) : (
                      <p className="text-neutral-500 italic">생성된 AI 분석 리포트가 없습니다.</p>
                    )}
                  </div>
                </div>

                {/* Macro Context Card */}
                <div className="lg:col-span-1 border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      REAL-TIME MACRO INDICATORS
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2.5 font-mono text-[10px] text-neutral-400">
                    {data.macro_context ? (
                      <>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>CBOE VIX (Fear Index)</span>
                          <span className="text-white font-bold">{data.macro_context.vix ?? "N/A"} ({data.macro_context.vix_5d_change > 0 ? "+" : ""}{(data.macro_context.vix_5d_change ?? 0).toFixed(1)}%)</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>US 10Y Treasury Yield</span>
                          <span className="text-white font-bold">{data.macro_context.us_10y_yield ?? "N/A"}%</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>S&P 500 (1M / 6M)</span>
                          <span className="text-white font-bold">{(data.macro_context.sp500_1m_return ?? 0).toFixed(1)}% / {(data.macro_context.sp500_6m_return ?? 0).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>KOSPI (Level / 1M)</span>
                          <span className="text-white font-bold">{data.macro_context.kospi_level ?? "N/A"} ({(data.macro_context.kospi_1m_return ?? 0).toFixed(1)}%)</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>US Dollar Index (DXY)</span>
                          <span className="text-white font-bold">{data.macro_context.dxy_index ?? "N/A"}</span>
                        </div>
                        <div className="flex justify-between border-b border-neutral-950 pb-1">
                          <span>USD/KRW Rate</span>
                          <span className="text-white font-bold">{data.macro_context.usd_krw ?? "N/A"} 원</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-neutral-500 italic">수집된 거시 경제 데이터가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Chart Section 1: Weights & Expected Returns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Weight Comparison Chart */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-white" />
                      ASSET WEIGHT COMPONENT COMPARISON
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">UNIT: %</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getWeightsData()} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="name" stroke="#525252" fontSize={9} tickLine={false} />
                        <YAxis stroke="#525252" fontSize={9} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#000000", border: "1px solid #262626", borderRadius: "0px" }}
                          itemStyle={{ fontSize: "10px", color: "#ffffff" }}
                          labelStyle={{ fontSize: "11px", fontWeight: "bold", color: "#ffffff" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                        <Bar dataKey="국민연금 (Market)" fill="#262626" />
                        <Bar dataKey="최적 포트폴리오 (BL)" fill="#ffffff" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Black Litterman Expected Returns */}
                <div className="border border-neutral-900 bg-[#0a0a0a] p-6 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-neutral-900 pb-3">
                    <h3 className="font-display text-xs tracking-wider text-neutral-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-white" />
                      EXPECTED RETURNS (PRIOR VS POSTERIOR)
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">UNIT: %</span>
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
                        <Bar dataKey="시장 균형수익률 (Prior)" fill="#262626" />
                        <Bar dataKey="BL 기대수익률 (Posterior)" fill="#ffffff" />
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
                      EFFICIENT FRONTIER CURVE
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">UNIT: %</span>
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
                                  <p>기대수익률: {pt.return.toFixed(2)}%</p>
                                  <p>변동성: {pt.volatility.toFixed(2)}%</p>
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
                            name="국민연금 Benchmark" 
                            data={[getBenchmarkDot()]} 
                            fill="#8a8a8f" 
                            shape="circle" 
                          />
                        )}
                        
                        {/* Optimal Portfolio Dot */}
                        {getOptimizedDot() && (
                          <Scatter 
                            name="최적화 포트폴리오" 
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
                      MONTE CARLO DRIFT PATHS (15 SAMPLES)
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">UNIT: %</span>
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
                      CUMULATIVE RETURN PROBABILITY DENSITY & 95% VAR
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">UNIT: %</span>
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
                      HISTORICAL CRISIS SCENARIO STRESS TEST
                    </h3>
                    <span className="text-[9px] text-neutral-600 font-mono">PORTFOLIO IMPACT</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[9px] text-neutral-400">
                      <thead>
                        <tr className="border-b border-neutral-900 text-neutral-500">
                          <th className="pb-2 font-display text-[9px] tracking-wider">CRISIS SCENARIO</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">IMPACT</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">KR STOCK</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">GLOBAL STOCK</th>
                          <th className="pb-2 text-right font-display text-[9px] tracking-wider">ALTERNATIVE</th>
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
                              No historical stress test results found.
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
                  <p>국민연금 가중치 모델 매핑 자산: 
                    <span className="text-neutral-300 ml-1">국내주식(EWY), 해외주식(VT), 국내채권(136340.KS), 해외채권(BNDX), 대체투자(VNQ)</span>.
                  </p>
                </div>
                <div>
                  <p>
                    위험회피도 (Lambda): <span className="text-white">{(data.risk_aversion ?? 2.5).toFixed(4)}</span>
                    {data.risk_aversion === undefined || data.risk_aversion === null ? " (기본값)" : " (동적추정)"} | 
                    척도 (Tau): <span className="text-white">{(data.tau ?? 0.05).toFixed(6)}</span>
                    {data.tau === undefined || data.tau === null ? " (기본값)" : " (베이지안)"} | 
                    무위험수익률: <span className="text-white">{(data.risk_free_rate * 100).toFixed(2)}%</span> (^TNX 10Y Treasury)
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
                  REAL-TIME MARKET INTELLIGENCE
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-1">
                  Curated investment theses from market professionals with AI interpretations.
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleRefreshIntelligence}
                  disabled={isRefreshingIntel}
                  className="button-ghost-dark flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingIntel ? "animate-spin" : ""}`} />
                  REFRESH FEED
                </button>
                <button 
                  onClick={applyToSimulator}
                  disabled={selectedTheses.length === 0}
                  className="button-ghost-dark flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-white text-white"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  APPLY TO SIMULATOR ({selectedTheses.length})
                </button>
              </div>
            </div>

            <div className="flex gap-8">
              {/* Left Side List (40% width) */}
              <div className="w-[40%] flex flex-col gap-4 overflow-y-auto h-[calc(100vh-14rem)] pr-2 border-r border-neutral-900">
                {/* Search & Filter Controls */}
                <div className="flex flex-col gap-3 pb-3 border-b border-neutral-900 sticky top-0 bg-[#000000] z-10">
                  {/* Search Input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="SEARCH INTEL (TITLE, CONTENT, AUTHOR)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#050505] border border-neutral-900 text-xs text-white px-3 py-2 outline-none focus:border-neutral-700 font-mono tracking-wider placeholder-neutral-700"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2.5 text-[9px] text-neutral-500 hover:text-white font-mono"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>

                  {/* Category Selection Tabs */}
                  <div className="flex gap-1 border-b border-neutral-950 pb-2">
                    {(["ALL", "EQUITY", "BOND", "ALTERNATIVE"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`flex-1 py-1 text-[8px] font-display tracking-widest border transition-all ${
                          categoryFilter === cat
                            ? "bg-white text-black border-white"
                            : "bg-[#050505] text-neutral-400 border-neutral-950 hover:border-neutral-800"
                        }`}
                      >
                        {cat === "ALL" ? "ALL" : cat === "EQUITY" ? "EQUITIES" : cat === "BOND" ? "FIXED INCOME" : "ALTERNATIVES"}
                      </button>
                    ))}
                  </div>

                  {/* Sorting Toggles */}
                  <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                    <span>SORT ORDER:</span>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => setSortMode("CHRONOLOGICAL")}
                        className={`hover:text-white transition-all ${sortMode === "CHRONOLOGICAL" ? "text-white font-bold" : "text-neutral-500"}`}
                      >
                        NEWEST
                      </button>
                      <span>|</span>
                      <button
                        onClick={() => setSortMode("RANKED")}
                        className={`hover:text-white transition-all ${sortMode === "RANKED" ? "text-white font-bold" : "text-neutral-500"}`}
                      >
                        RANKED (AI CONFIDENCE)
                      </button>
                    </div>
                  </div>
                </div>

                {filteredAndSortedFeed.length > 0 ? (
                  filteredAndSortedFeed.map(thesis => {
                    const isSelected = selectedThesisId === thesis.id;
                    const rank = globalRankMap[thesis.id];
                    return (
                      <div 
                        key={thesis.id}
                        onClick={() => setSelectedThesisId(thesis.id)}
                        className={`bg-[#050505] border p-4 cursor-pointer transition-all ${isSelected ? 'border-white' : 'border-neutral-900 hover:border-neutral-800'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-[9px] text-neutral-500 tracking-wider uppercase">{thesis.source}</span>
                            {sortMode === "RANKED" && rank && (
                              <span className="font-mono text-[8px] bg-white text-black px-1 font-bold">
                                #{rank} RANK
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-neutral-500 font-mono">{new Date(thesis.date).toLocaleDateString()}</span>
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleThesisSelection(thesis.id);
                              }}
                              className={`w-3.5 h-3.5 border ${selectedTheses.includes(thesis.id) ? 'bg-white border-white' : 'border-neutral-500'} flex items-center justify-center`}
                            >
                              {selectedTheses.includes(thesis.id) && <Check className="w-2.5 h-2.5 text-black" />}
                            </div>
                          </div>
                        </div>
                        <h3 className="text-xs font-bold text-white font-sans line-clamp-1 mb-1">{thesis.title}</h3>
                        <p className="text-[10px] text-neutral-400 font-sans line-clamp-2">"{thesis.content}"</p>
                        <div className="flex justify-between items-center mt-2.5">
                          <div className="flex gap-1.5 flex-wrap">
                            {(thesis.ai_interpretation.impacted_assets || []).map(asset => (
                              <span key={asset} className="text-[8px] font-display bg-neutral-950 text-neutral-400 px-1.5 py-0.5 border border-neutral-900">
                                {asset.replace("_", " ")}
                              </span>
                            ))}
                          </div>
                          <span className="text-[9px] text-neutral-500 font-mono">CONF: {((thesis.ai_interpretation.confidence ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-16 text-center text-neutral-600 font-display text-[10px] tracking-widest border border-neutral-900 bg-[#050505]">
                    NO MATCHING INTEL FOUND
                  </div>
                )}
              </div>

              {/* Right Side Detail Viewer (60% width) */}
              <div className="w-[60%] flex flex-col gap-6 overflow-y-auto h-[calc(100vh-14rem)] pr-2">
                {selectedThesisId ? (() => {
                  const thesis = intelligenceFeed.find(t => t.id === selectedThesisId);
                  if (!thesis) return null;
                  return (
                    <div className="bg-[#050505] border border-neutral-900 p-6 flex flex-col gap-6">
                      {/* Image cover & metadata header */}
                      <div className="h-56 w-full relative overflow-hidden border-b border-neutral-900">
                        <img src={thesis.image_url} alt="Cover" className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <span className="font-display text-[10px] bg-white text-black px-2 py-0.5 font-bold tracking-widest uppercase">{thesis.source}</span>
                          <h2 className="text-lg font-bold text-white mt-2 leading-snug">{thesis.title}</h2>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1 font-mono">
                            <span>BY: {thesis.author} ({thesis.author_title})</span>
                            <span>•</span>
                            <span>{new Date(thesis.date).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* AI interpretation banner */}
                      <div className="border border-neutral-800 bg-neutral-950/50 p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-neutral-400 animate-pulse" />
                            <span className="font-display text-[9px] tracking-widest text-neutral-400">AI INTERPRETATION</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-[9px] text-neutral-500">CONFIDENCE:</span>
                            <span className="font-mono text-xs font-bold text-white">{(thesis.ai_interpretation.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        <p className="text-xs text-neutral-300 font-sans leading-relaxed italic">
                          "{thesis.ai_interpretation.summary}"
                        </p>
                        <div className="flex gap-2 mt-1">
                          {thesis.ai_interpretation.impacted_assets.map(asset => (
                            <span key={asset} className="text-[9px] font-display bg-neutral-900 text-neutral-300 px-2 py-0.5">
                              {asset.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Main Thesis text */}
                      <div className="flex flex-col gap-2">
                        <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">Executive Abstract</h4>
                        <p className="text-sm text-neutral-200 font-sans leading-relaxed italic">
                          "{thesis.content}"
                        </p>
                      </div>

                      {/* Bloomberg Analyst Report sections */}
                      {thesis.full_report && (
                        <div className="flex flex-col gap-5 border-t border-neutral-900 pt-5">
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">I. Executive Summary</h4>
                            <div className="text-xs text-neutral-400 font-sans leading-relaxed">{renderReportField(thesis.full_report.executive_summary)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">II. Macroeconomic Rationale</h4>
                            <div className="text-xs text-neutral-400 font-sans leading-relaxed">{renderReportField(thesis.full_report.rationale)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">III. Target Assets Implications</h4>
                            <div className="text-xs text-neutral-400 font-sans leading-relaxed">{renderReportField(thesis.full_report.target_assets)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">IV. Portfolio Allocation Recommendation</h4>
                            <div className="text-xs text-emerald-400 font-sans leading-relaxed font-semibold">{renderReportField(thesis.full_report.recommendation)}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-display text-[10px] tracking-wider text-neutral-500 uppercase">V. Risk Factors & Caveats</h4>
                            <div className="text-xs text-red-400/90 font-sans leading-relaxed">{renderReportField(thesis.full_report.risk_factors)}</div>
                          </div>
                        </div>
                      )}

                      {/* User comment input */}
                      <div className="border-t border-neutral-900 pt-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="font-display text-[9px] tracking-widest text-neutral-500 uppercase font-bold">Include in Active Simulation</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleThesisSelection(thesis.id)}
                              className={`px-3 py-1 font-display text-[9px] tracking-widest border transition-all ${
                                selectedTheses.includes(thesis.id)
                                  ? 'bg-white text-black border-white'
                                  : 'bg-transparent text-white border-neutral-800 hover:border-neutral-600'
                              }`}
                            >
                              {selectedTheses.includes(thesis.id) ? 'SELECTED' : 'SELECT'}
                            </button>
                          </div>
                        </div>
                        
                        {selectedTheses.includes(thesis.id) && (
                          <div className="flex flex-col gap-2">
                            <textarea 
                              value={userComments[thesis.id] || ""}
                              onChange={(e) => updateComment(thesis.id, e.target.value)}
                              placeholder="Type custom feedback/modifications to this thesis (AI will incorporate these adjustments in the optimization)..."
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
                    <p className="font-display text-xs tracking-widest">SELECT A THESIS TO VIEW REPORT</p>
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
                  MACROECONOMIC DASHBOARD
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-1">
                  Real-time global market indicators and regime detection.
                </p>
              </div>
              <button 
                onClick={fetchMacroData}
                disabled={isFetchingMacro}
                className="button-ghost-dark flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingMacro ? "animate-spin" : ""}`} />
                REFRESH DATA
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
              return (
                <div className="flex flex-col gap-8">
                  {/* Current Regime Header */}
                  <div className="border border-neutral-900 bg-neutral-950 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <ShieldAlert className={`w-8 h-8 ${macroData.market_regime === "CRISIS" ? "text-red-500 animate-pulse" : macroData.market_regime === "ELEVATED_RISK" ? "text-amber-500 animate-bounce" : "text-emerald-500"}`} />
                      <div>
                        <span className="text-[10px] font-display tracking-widest text-neutral-500 block uppercase font-bold">Detected Market Regime</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-display text-white font-bold">{macroData.market_regime.replace("_", " ")}</span>
                          <span className="text-xs text-neutral-400">({macroData.regime_kr})</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono text-neutral-500">
                      STATUS: REAL-TIME FEED ACTIVE | SOURCE: YAHOO FINANCE API
                    </div>
                  </div>

                  {/* Categories Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {Object.entries(categories).map(([catName, keys]) => (
                      <div key={catName} className="border border-neutral-900 bg-[#020202] p-5 flex flex-col gap-4">
                        <h3 className="font-display text-[10px] tracking-wider text-neutral-400 border-b border-neutral-900 pb-2 uppercase font-bold">
                          {catName}
                        </h3>
                        <div className="flex flex-col gap-3">
                          {keys.map(key => {
                            const item = macroData[key];
                            if (!item) return null;
                            const isUp = item.change_5d >= 0;
                            return (
                              <div key={key} className="bg-[#070707] border border-neutral-900 p-4 flex flex-col justify-between hover:border-neutral-800 transition-colors min-w-0">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <span className="text-[9px] font-mono text-neutral-500 block">{key}</span>
                                    <span className="text-xs font-bold text-white leading-tight block">{item.name}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-display font-bold text-white block">{item.current}</span>
                                    <span className={`text-[10px] font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {isUp ? '+' : ''}{item.change_5d}%
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Sparkline */}
                                {item.history && item.history.length > 0 && (
                                  <div className="h-10 w-full mt-3 min-w-0 opacity-80 hover:opacity-100 transition-opacity">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={item.history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                        <defs>
                                          <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.15}/>
                                            <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
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
              );
            })() : (
              <div className="border border-neutral-900 bg-[#0a0a0a] p-12 flex flex-col items-center justify-center text-neutral-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                <p className="font-display text-xs tracking-widest">FETCHING MARKET DATA...</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
