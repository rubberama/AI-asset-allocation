# Macro Dashboard Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Macroeconomic Dashboard on both backend and frontend to support 1-year timeframes, dynamic data refresh, Pearson correlation matrix calculation, and interactive elements including indicator overlays, interactive heatmaps, and a regime impact gauge.

**Architecture:** Fetch 1-year yfinance histories on the backend and compute correlation coefficients in python using pandas/numpy, exposing them via `/macro-data?refresh=true`. The React frontend handles local timeframe slicing (1M/3M/6M/1Y), overlays two charts using dual Y-axis Recharts, renders an SVG correlation matrix heatmap, and visualizes regime changes.

**Tech Stack:** FastAPI, SQLAlchemy, yfinance, pandas, numpy, Next.js, React, TailwindCSS, Recharts, Lucide React.

## Global Constraints
- **Color Palette**: Pure dark background `#000000` (canvas-night), `#0a0a0a` (canvas-night-soft), hairline borders `#3a3a3f` (hairline-on-dark), text `#ffffff` (on-primary) and `#f0f0fa` (on-primary-mute).
- **Typography**: Display elements in uppercase, bold, and tracked (letter-spacing: ~1.2-1.6px).
- **No Accent Colors**: Maintain strict Spasex aesthetic (no generic greens, blues, or reds except standard positive/negative price return states).
- **Auditability**: Maintain full backward compatibility for endpoints.

---

### Task 1: Extend History Window & Implement Force-Refresh

**Files:**
- Modify: `backend/app/macro_data.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/llm.py`
- Create: `backend/tests/test_macro_data.py`

**Interfaces:**
- Consumes: yfinance ticker history request.
- Produces: `/macro-data?refresh=true` API endpoint returning 1-year history.

- [ ] **Step 1: Write test file for backend macro data endpoints**
  Create `backend/tests/test_macro_data.py`:
  ```python
  import pytest
  from fastapi.testclient import TestClient
  from app.main import app

  client = TestClient(app)

  def test_get_macro_data():
      response = client.get("/macro-data")
      assert response.status_code == 200
      json_data = response.json()
      assert "data" in json_data
      data = json_data["data"]
      assert "SPY" in data
      assert "history" in data["SPY"]
      # Check that at least some history is returned
      assert len(data["SPY"]["history"]) > 50

  def test_get_macro_data_refresh():
      response = client.get("/macro-data?refresh=true")
      assert response.status_code == 200
      json_data = response.json()
      assert "data" in json_data
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest backend/tests/test_macro_data.py -v`
  Expected: FAIL (either because data is 3mo only and len is not > 50, or refresh parameter is ignored).

- [ ] **Step 3: Modify backend/app/macro_data.py to fetch 1y history**
  Replace `period="3mo"` with `period="1y"` in `fetch_macro_context()` (line 46):
  ```python
  history_df = ticker_obj.history(period="1y")
  ```

- [ ] **Step 4: Modify backend/app/main.py and backend/app/llm.py to support cache clearing**
  In `backend/app/main.py`, update `get_macro_data()` to:
  ```python
  @app.get("/macro-data")
  def get_macro_data(refresh: bool = False):
      """
      Fetches real-time macro indicators.
      """
      try:
          if refresh:
              from app.macro_data import fetch_macro_context
              import app.llm as llm
              macro_context = fetch_macro_context()
              llm._last_macro_context = macro_context
          else:
              macro_context = get_last_macro_context()
              if not macro_context:
                  from app.macro_data import fetch_macro_context
                  macro_context = fetch_macro_context()
          return {"data": macro_context}
      except Exception as e:
          logger.error(f"Failed to fetch macro data: {e}")
          raise HTTPException(status_code=500, detail=str(e))
  ```

- [ ] **Step 5: Run tests to verify they pass**
  Run: `pytest backend/tests/test_macro_data.py -v`
  Expected: PASS

- [ ] **Step 6: Commit changes**
  ```bash
  git add backend/app/macro_data.py backend/app/main.py backend/tests/test_macro_data.py
  git commit -m "feat(backend): extend macro history to 1 year and implement force refresh"
  ```

---

### Task 2: Implement Pearson Correlation Matrix Calculation

**Files:**
- Modify: `backend/app/macro_data.py`
- Modify: `backend/tests/test_macro_data.py`

**Interfaces:**
- Consumes: A dictionary of indicator histories.
- Produces: `correlation_matrix` in `/macro-data` response.

- [ ] **Step 1: Write failing correlation test in backend/tests/test_macro_data.py**
  Add to test file:
  ```python
  def test_correlation_matrix():
      response = client.get("/macro-data")
      json_data = response.json()
      assert "correlation_matrix" in json_data["data"]
      matrix = json_data["data"]["correlation_matrix"]
      # Check that SPY and VIX are present and have negative correlation
      assert "SPY" in matrix
      assert "VIX" in matrix["SPY"]
      assert matrix["SPY"]["VIX"] < 0
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest backend/tests/test_macro_data.py::test_correlation_matrix -v`
  Expected: FAIL with KeyError ("correlation_matrix")

- [ ] **Step 3: Implement correlation logic in backend/app/macro_data.py**
  Add `compute_correlation_matrix` function and invoke it at the end of `fetch_macro_context()` before returning:
  ```python
  import pandas as pd
  import numpy as np

  def compute_correlation_matrix(indicators: dict) -> dict:
      """
      Computes Pearson correlation matrix for key macro indicators over 1 year.
      """
      target_keys = ["SPY", "QQQ", "KOSPI", "VIX", "US10Y", "YIELD_SPREAD", "HYG", "GOLD", "BTC", "USD_KRW"]
      
      series_dict = {}
      for key in target_keys:
          if key in indicators and "history" in indicators[key]:
              hist = indicators[key]["history"]
              dates = [pt["date"] for pt in hist]
              values = [pt["value"] for pt in hist]
              series_dict[key] = pd.Series(values, index=pd.to_datetime(dates))
              
      if not series_dict:
          return {}
          
      df = pd.DataFrame(series_dict)
      # Align and forward-fill missing values
      df = df.ffill().bfill()
      
      # Compute correlation matrix
      corr_df = df.corr()
      
      # Replace NaN with 0.0 for safety
      corr_df = corr_df.fillna(0.0)
      
      return corr_df.to_dict()
  ```
  In `fetch_macro_context()`, before returning `indicators`, compute and add correlation:
  ```python
  indicators["correlation_matrix"] = compute_correlation_matrix(indicators)
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `pytest backend/tests/test_macro_data.py::test_correlation_matrix -v`
  Expected: PASS

- [ ] **Step 5: Commit changes**
  ```bash
  git add backend/app/macro_data.py backend/tests/test_macro_data.py
  git commit -m "feat(backend): add Pearson correlation matrix calculation for macro indicators"
  ```

---

### Task 3: Frontend Timeframe Selector & Categorized Filters

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Implement local timeframe selection state and helper**
  Initialize timeframe state in `Dashboard`:
  ```typescript
  const [selectedTimeframe, setSelectedTimeframe] = useState<"1M" | "3M" | "6M" | "1Y">("3M");
  ```
  Add timeframe filtering helper inside `Dashboard` component:
  ```typescript
  const getFilteredHistory = (history: { date: string; value: number }[]) => {
    if (!history) return [];
    const now = new Date();
    let cutoff = new Date();
    if (selectedTimeframe === "1M") cutoff.setMonth(now.getMonth() - 1);
    else if (selectedTimeframe === "3M") cutoff.setMonth(now.getMonth() - 3);
    else if (selectedTimeframe === "6M") cutoff.setMonth(now.getMonth() - 6);
    else cutoff.setFullYear(now.getFullYear() - 1);
    
    return history.filter(item => new Date(item.date) >= cutoff);
  };
  ```

- [ ] **Step 2: Add timeframe buttons and category filter navigation**
  Modify the `MACRO` tab layout in `page.tsx` to add category pills and timeframe buttons, replacing lines 2110-2130:
  ```typescript
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  // update fetchMacroData to pass refresh=true
  const handleForceRefreshMacro = async () => {
    setIsFetchingMacro(true);
    try {
      const res = await fetch(`${apiBaseUrl}/macro-data?refresh=true`);
      if (res.ok) {
        const json = await res.json();
        setMacroData(json.data || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingMacro(false);
    }
  };
  ```
  Add visual buttons in JSX with Spasex styling: uppercase font, letter tracking, minimal borders.

- [ ] **Step 3: Add sparkline warning badges and list filtering**
  In the categories grid rendering, filter categories based on `selectedCategory`. Add status badges to ticker cards:
  - If `key === "VIX" && item.current > 20`: Show "SPIKE WARNING" badge.
  - If `key === "YIELD_SPREAD" && item.current < 0`: Show "INVERSION ALERT" badge.

- [ ] **Step 4: Verify layout compiles without TS errors**
  Verify by checking frontend compile state or test output.

---

### Task 4: Frontend Dual Y-Axis Overlay Comparison Mode

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Create state for comparison overlay indicator**
  ```typescript
  const [compareMacroKey, setCompareMacroKey] = useState<string>("");
  ```

- [ ] **Step 2: Create a comparison dropdown selector next to timeframe buttons**
  Show list of indicators excluding `selectedMacroKey`, plus a "None / Clear" option:
  ```typescript
  const compareOptions = Object.keys(TICKER_DETAILS).filter(k => k !== selectedMacroKey);
  ```

- [ ] **Step 3: Update Recharts AreaChart to dual Y-Axis setup**
  If `compareMacroKey` is selected:
  1. Combine data points of primary and secondary tickers aligned by date.
  2. Add `<YAxis yAxisId="right" orientation="right" ... />`.
  3. Add `<Line yAxisId="right" dataKey="compareValue" stroke="#a3a3a3" strokeDasharray="3 3" dot={false} />` to overlay comparison.
  4. Modify `Tooltip` content to display values of both series.

- [ ] **Step 4: Verify chart rendering**
  Open comparison, choose overlay indicator, confirm dual lines and tooltip display correctly.

---

### Task 5: Frontend Interactive Correlation Heatmap

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Create state for selected cell in matrix**
  ```typescript
  const [selectedCell, setSelectedCell] = useState<{ x: string; y: string } | null>(null);
  ```

- [ ] **Step 2: Design interactive correlation table grid**
  Expose a UI component showing the 10x10 correlation grid.
  Calculate colors dynamically:
  - Pos correlation (`> 0.1`): `rgba(16, 185, 129, ${val})` (green)
  - Neg correlation (`< -0.1`): `rgba(239, 68, 68, ${Math.abs(val)})` (red)
  - Neutral correlation: `rgba(38, 38, 38, 0.4)` (dark gray)
  - Diagonal cell: Solid `#1a1a1a` (value = 1.0)

- [ ] **Step 3: Design dynamic correlation explainer panel**
  When a cell `(X, Y)` is clicked, render a panel with explanation:
  - If correlation `< -0.5`: "Strong negative correlation. X can act as a reliable hedge for Y."
  - If correlation `> 0.5`: "Strong positive correlation. X and Y move together; watch for concentration risk."
  - Else: "Weak or neutral correlation. Diversification benefit exists between X and Y."

- [ ] **Step 4: Verify cell hovering and text change**
  Hover and select cells, confirm explanation update.

---

### Task 6: Frontend Regime Impact Gauge Panel

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Build the Regime Scale Gauge**
  Render a 4-step progress grid (`LOW_VOL`, `NORMAL`, `ELEVATED_RISK`, `CRISIS`). Highlight active regime with corresponding Spasex color (Crisis = flashing red text, Low Vol = emerald green, etc.).

- [ ] **Step 2: Display Risk Aversion Multiplier & Quantitative Impact Info**
  Determine multiplier based on regime:
  - Crisis: `1.6x` risk aversion. Explains: "BL penalizes high-volatility equities heavily; shifts target weights towards Cash, Bonds, and safe havens."
  - Elevated Risk: `1.25x` risk aversion. Explains: "Cautious stance; moderate scaling down of risk assets."
  - Normal: `1.0x` risk aversion. Explains: "Baseline Black-Litterman optimization active."
  - Low Vol: `0.9x` risk aversion. Explains: "Optimistic scaling; allows higher equity weights within bounds."

- [ ] **Step 3: Verify regime display updates**
  Verify matching regime with VIX value from mock/real data.

---

### Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-macro-dashboard-upgrade.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
