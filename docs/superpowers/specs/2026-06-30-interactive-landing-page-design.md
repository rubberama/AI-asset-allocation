# Design Spec: Interactive Premium Landing Page

This document outlines the design specification for upgrading the landing page at `/` to include an interactive, live-updating portfolio simulator.

---

## 1. Goal & Objectives
* **Interactive Experience**: Allow visitors to experience the core asset allocation logic of the platform directly on the landing page without logging in.
* **State-of-the-Art Visuals**: Maintain the Spasex-inspired dark aesthetic while introducing dynamic SVG assets (donut charts, sliders, metric indicators).
* **Responsive Layout**: Ensure the interactive simulator renders perfectly on both desktop (side-by-side) and mobile (stacked).

---

## 2. Interactive Simulator Component Design

### 2.1 Inputs (Control Panel)
* **Risk Tolerance Slider (`위험 허용도`)**:
  * Range: 10% to 90% (step: 5%)
  * Default: 50%
  * Effect: Increases domestic/global stocks and alternatives, decreases bonds.
* **Global Equity View Slider (`해외주식 전망`)**:
  * Range: -10% (Bearish) to +10% (Bullish) (step: 1%)
  * Default: 0%
  * Effect: Shifts weights between local stocks/bonds and global stocks based on Black-Litterman logic.

### 2.2 Outputs (Live Visualization)
* **SVG Donut Chart**:
  * Displays the 5 NPS asset classes with matching colors:
    * 해외주식 (Global Stock): Violet (`#A78BFA`)
    * 국내주식 (Local Stock): Blue (`#3B82F6`)
    * 국내채권 (Local Bond): Green (`#34D399`)
    * 해외채권 (Global Bond): Teal (`#6EE7B7`)
    * 대체투자 (Alternatives): Amber (`#FBBF24`)
* **Portfolio Metrics Panel**:
  * **Expected Return (`기대수익률`)**: Dynamic calculation: `baseReturn + risk * 0.05 + view * 0.3`
  * **Volatility (`변동성`)**: Dynamic calculation: `baseVol + risk * 0.08 - (1 - risk) * 0.02`
  * **Sharpe Ratio (`샤프 비율`)**: Computed as `Expected Return / Volatility`
* **Weights Table**: Shows active percentage weights per asset with micro-bar representations.

---

## 3. Visual Layout of the Landing Page
* **Hero Banner**: Retain the giant "NPS AI BLACK-LITTERMAN" heading.
* **Interactive Section**: Placed directly under the Hero CTAs. It features a full-width dark card (`#050505`) with a subtle glowing border.
* **Methodology Overview**: A clean 3-column features grid explaining the 3-step pipeline (Inference, Optimization, Ensemble).

---

## 4. Spec Review & Verification

### 4.1 Verification Plan
* Ensure all math equations in the JS simulator are robust and don't produce division-by-zero or negative numbers.
* Run `npm run build` to verify there are no TypeScript compile errors.
