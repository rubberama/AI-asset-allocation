# Design Spec: Workspace Guide Tab & Premium Landing Page

This document outlines the design specification for integrating an interactive, highly visual **Guide Tab** in the Next.js Workspace, alongside a stunning **Premium Landing Page** at the root route `/`.

---

## 1. Goal & Objectives
* **Interactive Guide Tab**: Replace the text-heavy classic Help tab with an interactive, visually appealing roadmap in the Workspace. It should guide users through the workflow step-by-step, explain key quantitative concepts (Black-Litterman, prior/posterior, etc.), and provide direct jump links to corresponding tabs/actions.
* **Premium Landing Page**: Create a modern, mission-oriented dark-themed landing page at the root route `/`. It will showcase the NPS AI Black-Litterman Asset Allocation engine with rich animations, metric counters, and clear call-to-actions (CTAs) directing users to either the demo workspace, new workspace, or classic dashboard.

---

## 2. Part 1: Interactive Guide Tab (`가이드`)

### 2.1 Tab Placement & Naming
* **Name**: `가이드` (Guide)
* **Placement**: Located as a distinct third tab group in [Workspace.tsx](file:///C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/app/Workspace.tsx).
  ```ts
  const TAB_GROUPS = [
    { label: "입력", tabs: ["매크로", "인텔리전스", "리서치"] },
    { label: "결과", tabs: ["배분", "리스크", "프론티어", "리포트"] },
    { label: "시스템", tabs: ["가이드"] } // Added
  ];
  ```

### 2.2 Visual Workflow Layout
Instead of a simple list, we will render a modern, interactive grid/stepper flow:
1. **Interactive Workflow Timeline**: A visual horizontal pipeline representing the 5 core stages of asset allocation:
   * **01. 매크로 (Macro)**: Analyze the macroeconomic regime (VIX, Fear & Greed, and key indicators).
   * **02. 인텔리전스 (Intel)**: Ingest news, URLs, and PDFs to extract market sentiment signals.
   * **03. 리서치 논거 (Research)**: Formulate investment theses and qualitative views.
   * **04. 시뮬레이션 (Optimize)**: Run Black-Litterman prior/posterior optimization.
   * **05. 분석 보고서 (Reports)**: Review portfolio allocation, risk analysis, and PM report.

2. **Step detail panels**: Clicking a step opens a clean glassmorphism card explaining:
   * **Core Action**: What the user does in this step.
   * **AI Logic**: How Ben (AI Analyst) and Chris (Chief Strategist) process the information.
   * **Quick Shortcut Link**: A button that says `[매크로 확인하러 가기 →]` or `[시뮬레이션 실행하기 ▶]` to immediately redirect the tab or trigger actions.
   * **Pro-tip**: Actionable advice on how to improve optimization outcomes.

---

## 3. Part 2: Premium Landing Page (`/`)

### 3.1 Routing Changes
To position the Landing Page at `/`, we will adjust the routes:
* **`/` (Root)**: Displays the new **Premium Landing Page** (`app/page.tsx`).
* **`/workspace` (Workspace)**: Displays the **Workspace Demo** (`app/workspace/page.tsx` - moved from `/`).
* **`/new` (New Workspace)**: Remains the empty workspace (`app/new/page.tsx`).
* **`/classic` (Classic View)**: Remains the classic terminal (`app/classic/page.tsx`).

### 3.2 Landing Page Visual System & Components
Designed to match the high-end Spasex styling specified in [DESIGN.md](file:///C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/DESIGN.md):
* **Obsidian Black Theme**: Absolute pitch-black background with a subtle glowing network background or dark blue gradient mesh that feels high-tech and professional.
* **Hero Text**: Giant typography utilizing the `Archivo` font with tight letter-spacing. White text grading into a soft violet/cyan hue.
* **Animated Schematic**: A CSS-animated SVG or canvas visualization of the **Efficient Frontier** and **Asset Weights** that dynamically moves, indicating active, real-time calculation.
* **Metric Counters**:
  * `10,000+ Monte Carlo Scenarios`
  * `Black-Litterman + HRP Ensemble Engine`
  * `Real-time Macro Regime Detection`
* **Features Grid**: Three glass cards detailing:
  1. *Smart Ingestion*: Automated sentiment scoring on news/documents.
  2. *Black-Litterman Calibration*: Blending market consensus with custom analyst views.
  3. *Ensemble Allocator*: Parallel execution of MVO, Risk Parity, and HRP under risk constraints.
* **High-Contrast CTAs**:
  * Primary: `[데모 터미널 실행 (Launch Demo) →]` (links to `/workspace`).
  * Secondary: `[신규 포트폴리오 작성 (New Simulation) ⊕]` (links to `/new`).
  * Utility: `[클래식 대시보드 (Classic View)]` (links to `/classic`).

---

## 4. Spec Review & Verification

### 4.1 Verification Plan
* Validate Next.js routing changes and make sure all imports link correctly.
* Verify responsiveness of both the new Guide tab layout and the landing page.
* Run local TypeScript compiler (`npm run build` or similar) to ensure no type errors are introduced.
