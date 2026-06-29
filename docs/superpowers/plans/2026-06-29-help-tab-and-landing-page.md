# Workspace Guide Tab & Premium Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a premium, obsidian-black landing page at `/` and move the current workspace to `/workspace`, and implement an interactive, highly visual Guide tab in the workspace.

**Architecture:** Reorganize Next.js App Router folders. Move the main workspace demo to a new `/workspace` directory. Build the landing page at `/` using the Spasex design system tokens (inline styles matching `Workspace.tsx`). Extend `Workspace.tsx` to include a new "시스템" group with a "가이드" tab, featuring interactive cards, SVG pipeline illustration, and quick action buttons.

**Tech Stack:** Next.js (App Router), React, Lucide React, TypeScript.

## Global Constraints
* Use Archivo for display headings and Pretendard for body text and numbers.
* Primary theme is deep obsidian black (`#000000`) with white and grey styling.
* Keep code modular, clean, and verify builds with TypeScript compilation.

---

### Task 1: Reorganize Workspace Route

Move the current demo workspace route from `/` to `/workspace` so that `/` can serve as the new landing page.

**Files:**
* Create: `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/workspace/page.tsx`
* Modify: `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/page.tsx`

**Interfaces:**
* Consumes: `<Workspace mode="demo" />` from [Workspace.tsx](file:///C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/Workspace.tsx)
* Produces: A new `/workspace` route pointing to the workspace in demo mode.

- [ ] **Step 1: Create the new workspace demo page**

Create a new page file at `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/workspace/page.tsx` with the following content:
```tsx
import { Workspace } from "../Workspace";

export default function Page() {
  return <Workspace mode="demo" />;
}
```

- [ ] **Step 2: Modify the root page temporarily to render a placeholder for the landing page**

Edit `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/page.tsx` to clear it and render a temporary page placeholder to prevent errors:
```tsx
export default function Page() {
  return (
    <div style={{ background: "#000", color: "#fff", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <h1>Etacolla Landing Page Placeholder</h1>
    </div>
  );
}
```

- [ ] **Step 3: Run Next.js build to verify routing and type safety**

Run in terminal:
```powershell
npm run build
```
Expected output: Compilation finishes successfully.

- [ ] **Step 4: Commit the routing changes**

```bash
git add frontend/app/page.tsx frontend/app/workspace/page.tsx
git commit -m "refactor: move workspace demo to /workspace"
```

---

### Task 2: Build the Premium Landing Page at `/`

Create the complete landing page with stunning, premium dark visuals, a CSS-animated portfolio schematic, live metrics, and clear CTAs.

**Files:**
* Modify: `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/page.tsx`

**Interfaces:**
* Consumes: Style constants (Geist, Archivo fonts, colors)
* Produces: Premium dark landing page at root URL.

- [ ] **Step 1: Replace `/` with the complete landing page implementation**

Write the following full implementation into `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import React from "react";

// Design constants aligned with DESIGN.md and Workspace.tsx
const C = {
  bg: "#000",
  white: "#fff",
  t3: "#9a9a9a",
  t4: "#6a6a6a",
  b1: "#161616",
  b2: "#1c1c1c",
  b5: "#1e1e1e",
  violet: "#A78BFA",
  green: "#34D399",
  blue: "#3B82F6",
  amber: "#FBBF24",
};

const FA = "'Archivo',sans-serif";
const FP = "'Pretendard',sans-serif";

export default function LandingPage() {
  return (
    <div
      style={{
        background: C.bg,
        color: C.white,
        fontFamily: FP,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      <style jsx global>{`
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.05); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(1deg); }
        }
        @keyframes drawFrontier {
          0% { stroke-dashoffset: 600; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>

      {/* Background Glow Mesh */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "25%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(167,139,250,0.15) 0%, rgba(0,0,0,0) 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
          animation: "subtlePulse 8s infinite ease-in-out",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(34,211,153,0.08) 0%, rgba(0,0,0,0) 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
          animation: "subtlePulse 12s infinite ease-in-out",
        }}
      />

      {/* TOP NAV */}
      <header
        style={{
          height: 64,
          borderBottom: `1px solid ${C.b1}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 40px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FA, fontWeight: 800, fontSize: 18, letterSpacing: ".5px" }}>Etacolla</span>
          <span style={{ width: 1, height: 18, background: "#222" }} />
          <span style={{ fontSize: 10.5, color: C.t4, letterSpacing: ".2px", textTransform: "uppercase" }}>Quant Labs</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link
            href="/classic"
            style={{
              fontSize: 12,
              color: C.t3,
              textDecoration: "none",
              fontFamily: FA,
              fontWeight: 600,
              letterSpacing: "1px",
              transition: "color .2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = C.white)}
            onMouseOut={(e) => (e.currentTarget.style.color = C.t3)}
          >
            CLASSIC TERMINAL
          </Link>
          <Link
            href="/new"
            style={{
              fontSize: 12,
              color: C.t3,
              textDecoration: "none",
              fontFamily: FA,
              fontWeight: 600,
              letterSpacing: "1px",
              transition: "color .2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = C.white)}
            onMouseOut={(e) => (e.currentTarget.style.color = C.t3)}
          >
            NEW BLANK
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 20px", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: 900, textAlign: "center" }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.b2}`, padding: "6px 12px", borderRadius: 20, marginBottom: 24, background: "#050505" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            <span style={{ fontSize: 9.5, fontFamily: FA, fontWeight: 700, letterSpacing: "2px", color: C.t3 }}>NPS ASSET ALLOCATION PROTOCOL v0.4</span>
          </div>

          {/* Heading */}
          <h1
            style={{
              fontFamily: FA,
              fontSize: "clamp(48px, 6vw, 76px)",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-2px",
              color: C.white,
              margin: "0 0 20px 0",
              textTransform: "uppercase",
            }}
          >
            NPS AI <span style={{ background: `linear-gradient(90deg, #fff 0%, ${C.violet} 50%, ${C.green} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Black-Litterman</span>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: C.t3, maxWidth: 640, margin: "0 auto 40px auto", lineHeight: 1.6, fontWeight: 400 }}>
            하우스의 매크로 국면 리서치와 실시간 인텔리전스 신호를 결합하는<br />
            차세대 AI 기반 블랙-리터만 자산배분 최적화 엔진
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 60 }}>
            <Link href="/workspace" style={{ textDecoration: "none" }}>
              <button
                style={{
                  fontFamily: FA,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "1.5px",
                  background: C.white,
                  color: C.bg,
                  border: "none",
                  padding: "16px 32px",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "transform .2s, filter .2s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.03)"; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                데모 터미널 실행 (DEMO) →
              </button>
            </Link>
            <Link href="/new" style={{ textDecoration: "none" }}>
              <button
                style={{
                  fontFamily: FA,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "1.5px",
                  background: "transparent",
                  color: C.white,
                  border: `1px solid ${C.b2}`,
                  padding: "16px 32px",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "background-color .2s, transform .2s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#111"; e.currentTarget.style.transform = "scale(1.03)"; }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
              >
                신규 시뮬레이션 작성 ⊕
              </button>
            </Link>
          </div>
        </div>

        {/* CSS Animated Portfolio Schematic Mockup */}
        <div
          style={{
            width: "100%",
            maxWidth: 620,
            border: `1px solid ${C.b1}`,
            background: "#030303",
            borderRadius: 12,
            padding: "24px 30px",
            animation: "float 6s infinite ease-in-out",
            boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.b1}`, paddingBottom: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 9, fontFamily: FA, color: C.t4, letterSpacing: "1.5px", fontWeight: 700 }}>PORTFOLIO FRONTIER OPTIMIZATION</span>
            <div style={{ display: "flex", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.violet }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 200 120" style={{ width: 180, height: 110 }}>
              {/* Frontier Line */}
              <path
                d="M 20 100 Q 110 30 180 20"
                fill="none"
                stroke={C.violet}
                strokeWidth="2.5"
                strokeDasharray="600"
                strokeDashoffset="600"
                style={{ animation: "drawFrontier 2.5s forwards ease-in-out" }}
              />
              {/* Optimal Points */}
              <circle cx="120" cy="48" r="4" fill={C.white} />
              <circle cx="120" cy="48" r="8" fill="none" stroke={C.white} strokeWidth="1" style={{ opacity: 0.5 }} />
              <text x="132" y="52" fill={C.white} fontSize="8" fontFamily={FP} fontWeight="bold">최적 자산배분 (MVO)</text>

              {/* Grid Lines */}
              <line x1="20" y1="10" x2="20" y2="100" stroke="#161616" strokeWidth="1" />
              <line x1="20" y1="100" x2="190" y2="100" stroke="#161616" strokeWidth="1" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", pb: 5 }}>
                <span style={{ fontSize: 11, color: C.t4 }}>기대수익률 (Expected Return)</span>
                <span style={{ fontSize: 11, fontWeight: "bold", color: C.green }}>6.84%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", pb: 5 }}>
                <span style={{ fontSize: 11, color: C.t4 }}>변동성 (Volatility)</span>
                <span style={{ fontSize: 11, fontWeight: "bold" }}>9.12%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", pb: 5 }}>
                <span style={{ fontSize: 11, color: C.t4 }}>샤프 비율 (Sharpe Ratio)</span>
                <span style={{ fontSize: 11, fontWeight: "bold", color: C.violet }}>0.61</span>
              </div>
            </div>
          </div>
        </div>

        {/* METRICS */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, width: "100%", maxWidth: 900, marginTop: 80, borderTop: `1px solid ${C.b1}`, paddingTop: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, fontFamily: FA, color: C.violet }}>10,000+</span>
            <span style={{ fontSize: 12, color: C.t4, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>몬테카를로 경로 시뮬레이션</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, fontFamily: FA, color: C.green }}>Black-Litterman</span>
            <span style={{ fontSize: 12, color: C.t4, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>시장 균형 대비 사후 기대수익률 계산</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, fontFamily: FA, color: C.white }}>Ensemble MVO</span>
            <span style={{ fontSize: 12, color: C.t4, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>리스크 패리티 & HRP 결합 분석</span>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${C.b1}`, padding: "30px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 15 }}>
        <span style={{ fontSize: 11, color: C.t4 }}>© 2026 NPS AI Asset Allocation Platform. All rights reserved.</span>
        <span style={{ fontSize: 11, color: C.t4, fontFamily: FA }}>CONFIDENTIAL · FOR INTERNAL USE ONLY</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Run Next.js build to verify landing page compilation**

Run in terminal:
```powershell
npm run build
```
Expected output: Compiles without errors.

- [ ] **Step 3: Commit landing page**

```bash
git add frontend/app/page.tsx
git commit -m "feat: implement premium landing page"
```

---

### Task 3: Setup Guide Tab in Workspace

Add the "가이드" tab to the Workspace page tab bar and route logic.

**Files:**
* Modify: `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/Workspace.tsx`

**Interfaces:**
* Modify `TAB_GROUPS` to add `{ label: "시스템", tabs: ["가이드"] }`
* Add conditional render in the main container: `{tab === "가이드" && <GuideTab onNavigate={setTab} runSimulation={runSimulation} running={running} />}`

- [ ] **Step 1: Modify TAB_GROUPS to add "가이드" tab**

Edit lines 57-62 in `Workspace.tsx`:
```diff
-const TAB_GROUPS: { label: string; tabs: string[] }[] = [
-  { label: "입력", tabs: ["매크로", "인텔리전스", "리서치"] },
-  { label: "결과", tabs: ["배분", "리스크", "프론티어", "리포트"] },
-];
+const TAB_GROUPS: { label: string; tabs: string[] }[] = [
+  { label: "입력", tabs: ["매크로", "인텔리전스", "리서치"] },
+  { label: "결과", tabs: ["배분", "리스크", "프론티어", "리포트"] },
+  { label: "시스템", tabs: ["가이드"] },
+];
```

- [ ] **Step 2: Add conditional rendering for GuideTab**

Edit the tab rendering area around line 643-652 in `Workspace.tsx` to include `GuideTab`:
```diff
             {tab === "인텔리전스" && <IntelTab intel={intel} onOpen={setIntelOpen} onAttach={attachSource} onDelete={deleteIntel} onRefresh={refreshIntel} refreshing={refreshingIntel} progress={refreshProgress} onIngestUrl={ingestUrl} onIngestPdf={ingestPdf} ingesting={ingesting} />}
             {tab === "매크로" && <MacroTab macro={macro} regime={regime} regimeLabel={regimeLabel} regimeColor={regimeColor} />}
             {tab === "리서치" && <ResearchTab queue={queue} theses={houseTheses} onCollect={runCollect} collecting={collecting} collectProgress={collectProgress} onBuild={buildTheses} building={buildingTheses} msg={researchMsg} onAttachThesis={attachThesis} onDeleteThesis={deleteThesis} onResetTheses={resetTheses} />}
             {tab === "리포트" && (isNew && !hasRun ? <EmptyResults go={setTab} /> : <ReportTab sim={sim} />)}
+            {tab === "가이드" && <GuideTab onNavigate={setTab} runSimulation={runSimulation} running={running} />}
```

- [ ] **Step 3: Stub the GuideTab component at the end of the file**

Add the stub component function declaration at the bottom of `Workspace.tsx`:
```tsx
function GuideTab({ onNavigate, runSimulation, running }: { onNavigate: (t: string) => void; runSimulation: () => void; running: boolean }) {
  return (
    <div style={{ color: "#fff", padding: "10px" }}>
      <h3>Guide Tab Stub</h3>
    </div>
  );
}
```

- [ ] **Step 4: Run Next.js build to verify changes**

Run:
```powershell
npm run build
```
Expected: Compiles successfully without errors.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/app/Workspace.tsx
git commit -m "feat: add guide tab to workspace navigation"
```

---

### Task 4: Implement GuideTab Component

Write the complete implementation for the GuideTab component with step chevrons, interactive details cards, and quick-jump navigation triggers.

**Files:**
* Modify: `C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/Workspace.tsx`

**Interfaces:**
* Consumes: `onNavigate(tabName: string)`, `runSimulation()`, `running: boolean`
* Produces: A highly interactive visual roadmap page for new users.

- [ ] **Step 1: Import additional Lucide React icons in Workspace.tsx**

Check and add Lucide React icons at the top of `Workspace.tsx`. If `lucide-react` is not imported yet, add the import at the top of `Workspace.tsx` (around line 14):
```tsx
import { 
  TrendingUp, Newspaper, Cpu, Play, ChevronRight, Info, FileText, CheckCircle2, BookOpen, Navigation
} from "lucide-react";
```

- [ ] **Step 2: Replace GuideTab stub with full interactive implementation**

Write the complete interactive GuideTab component in `Workspace.tsx`:
```tsx
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
```

- [ ] **Step 3: Run Next.js build to verify entire project builds correctly**

Run:
```powershell
npm run build
```
Expected: Compiles with 0 warnings/errors.

- [ ] **Step 4: Commit entire changes**

```bash
git add frontend/app/Workspace.tsx
git commit -m "feat: implement interactive GuideTab component"
```
