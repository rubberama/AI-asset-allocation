"use client";

import Link from "next/link";
import React, { useState, useMemo } from "react";

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
  green2: "#6EE7B7",
  blue: "#3B82F6",
  amber: "#FBBF24",
};

const FA = "'Archivo',sans-serif";
const FP = "'Pretendard',sans-serif";

export default function LandingPage() {
  // Simulator State
  const [riskTolerance, setRiskTolerance] = useState<number>(50); // 10 to 90
  const [globalEquityView, setGlobalEquityView] = useState<number>(0); // -10 to 10

  // Calculate live portfolio weights using Black-Litterman heuristic
  const portfolio = useMemo(() => {
    // Prior NPS target weights (sum to 100)
    let glStock = 34.7;
    let lcStock = 20.8;
    let lcBond = 23.1;
    let glBond = 7.4;
    let alts = 14.0;

    // 1. Adjust risk tolerance (shifts bonds to stocks/alternatives)
    const riskFactor = (riskTolerance - 50) / 100; // -0.4 to +0.4
    if (riskFactor >= 0) {
      // Risk-seeking: reduce bonds, increase equities and alternatives
      const bondReduction = (lcBond + glBond) * riskFactor * 0.8;
      lcBond -= bondReduction * (lcBond / (lcBond + glBond));
      glBond -= bondReduction * (glBond / (lcBond + glBond));

      lcStock += bondReduction * 0.45;
      glStock += bondReduction * 0.45;
      alts += bondReduction * 0.1;
    } else {
      // Risk-averse: reduce equities and alternatives, increase bonds
      const riskReduction = (lcStock + glStock + alts) * Math.abs(riskFactor) * 0.6;
      lcStock -= riskReduction * (lcStock / (lcStock + glStock + alts));
      glStock -= riskReduction * (glStock / (lcStock + glStock + alts));
      alts -= riskReduction * (alts / (lcStock + glStock + alts));

      lcBond += riskReduction * 0.7;
      glBond += riskReduction * 0.3;
    }

    // 2. Adjust Black-Litterman Global Equity Outlook View
    // Shifts weights between Domestic Stock and Global Stock
    const viewFactor = globalEquityView / 100; // -0.1 to +0.1
    if (viewFactor >= 0) {
      // Bullish on Global Equity: long global stock, short local stock
      const shift = lcStock * viewFactor * 1.5;
      lcStock -= shift;
      glStock += shift;
    } else {
      // Bearish on Global Equity: short global stock, long local stock
      const shift = glStock * Math.abs(viewFactor) * 1.5;
      glStock -= shift;
      lcStock += shift;
    }

    // Ensure no negative weights
    glStock = Math.max(glStock, 2.0);
    lcStock = Math.max(lcStock, 2.0);
    lcBond = Math.max(lcBond, 2.0);
    glBond = Math.max(glBond, 2.0);
    alts = Math.max(alts, 2.0);

    // Re-normalize to sum to exactly 100%
    const total = glStock + lcStock + lcBond + glBond + alts;
    const wGlStock = (glStock / total) * 100;
    const wLcStock = (lcStock / total) * 100;
    const wLcBond = (lcBond / total) * 100;
    const wGlBond = (glBond / total) * 100;
    const wAlts = (alts / total) * 100;

    // Calculate metrics
    const expReturn = 3.5 + (riskTolerance / 100) * 4.5 + (globalEquityView / 10) * 0.8;
    const vol = 4.2 + (riskTolerance / 100) * 8.8 - (globalEquityView / 10) * 0.2;
    const sharpe = expReturn / vol;

    return {
      weights: [
        { name: "해외주식", color: C.violet, value: wGlStock },
        { name: "국내주식", color: C.blue, value: wLcStock },
        { name: "국내채권", color: C.green, value: wLcBond },
        { name: "해외채권", color: C.green2, value: wGlBond },
        { name: "대체투자", color: C.amber, value: wAlts },
      ],
      metrics: {
        return: expReturn,
        volatility: vol,
        sharpe: sharpe,
      }
    };
  }, [riskTolerance, globalEquityView]);

  // Donut SVG circumference calculation helpers
  const r = 50;
  const circ = 2 * Math.PI * r; // ~314.159

  // Calculate cumulative rotation angles for each donut slice
  const donutSlices = useMemo(() => {
    let currentPct = 0;
    return portfolio.weights.map((w) => {
      const pct = w.value;
      const strokeDashoffset = circ - (pct / 100) * circ;
      const rotation = (currentPct / 100) * 360;
      currentPct += pct;
      return {
        ...w,
        offset: strokeDashoffset,
        rotate: rotation,
      };
    });
  }, [portfolio.weights]);

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
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: #1c1c1c;
          height: 5px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          transition: transform .15s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
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
            id="nav-classic-terminal"
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
            id="nav-new-blank"
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "60px 20px", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: 900, textAlign: "center" }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.b2}`, padding: "6px 12px", borderRadius: 20, marginBottom: 20, background: "#050505" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            <span style={{ fontSize: 9.5, fontFamily: FP, fontWeight: 700, letterSpacing: "2px", color: C.t3 }}>NPS ASSET ALLOCATION PROTOCOL v0.4</span>
          </div>

          {/* Heading */}
          <h1
            style={{
              fontFamily: FA,
              fontSize: "clamp(44px, 5.5vw, 70px)",
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
          <p style={{ fontSize: "clamp(14px, 1.8vw, 17px)", color: C.t3, maxWidth: 640, margin: "0 auto 35px auto", lineHeight: 1.6, fontWeight: 400 }}>
            하우스의 매크로 국면 리서치와 실시간 인텔리전스 신호를 결합하는<br />
            차세대 AI 기반 블랙-리터만 자산배분 최적화 엔진
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 50 }}>
            <Link href="/workspace" style={{ textDecoration: "none" }}>
              <button
                id="btn-launch-demo"
                style={{
                  fontFamily: FA,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "1.5px",
                  background: C.white,
                  color: C.bg,
                  border: "none",
                  padding: "15px 30px",
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
                id="btn-new-simulation"
                style={{
                  fontFamily: FA,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "1.5px",
                  background: "transparent",
                  color: C.white,
                  border: `1px solid ${C.b2}`,
                  padding: "15px 30px",
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

        {/* INTERACTIVE SIMULATOR CARD */}
        <div
          style={{
            width: "100%",
            maxWidth: 860,
            border: `1px solid ${C.b1}`,
            background: "#030303",
            borderRadius: 16,
            padding: "32px",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 32,
            position: "relative",
            zIndex: 5,
          }}
        >
          {/* Left panel: sliders */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 24 }}>
            <div>
              <span style={{ fontSize: 9.5, fontFamily: FA, color: C.t4, letterSpacing: "1.5px", fontWeight: 700, display: "block", marginBottom: 6 }}>INTERACTIVE SIMULATOR</span>
              <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: FA, margin: 0 }}>포트폴리오 자산배분 체험</h3>
              <p style={{ fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 1.5 }}>아래의 슬라이더를 조정하여 NPS 하우스의 블랙-리터만 모형 하에서 자산비중과 기대 성과 지표가 실시간으로 어떻게 변화하는지 체험해 보세요.</p>
            </div>

            {/* Slider 1 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#e4e4e7" }}>위험 허용도 (Risk Tolerance)</span>
                <span style={{ fontSize: 12.5, fontWeight: "bold", fontFamily: FP, color: C.green }}>{riskTolerance}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.t4 }}>
                <span>보수적 (Conservative)</span>
                <span>공격적 (Aggressive)</span>
              </div>
            </div>

            {/* Slider 2 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#e4e4e7" }}>해외주식 시장 전망 (Global Equity View)</span>
                <span style={{ fontSize: 12.5, fontWeight: "bold", fontFamily: FP, color: C.violet }}>
                  {globalEquityView > 0 ? `+${globalEquityView}` : globalEquityView}%
                </span>
              </div>
              <input
                type="range"
                min="-10"
                max="10"
                step="1"
                value={globalEquityView}
                onChange={(e) => setGlobalEquityView(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.t4 }}>
                <span>약세 (Bearish)</span>
                <span>중립 (Neutral)</span>
                <span>강세 (Bullish)</span>
              </div>
            </div>
          </div>

          {/* Right panel: dynamic visualization */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, borderLeft: `1px solid ${C.b1}`, paddingLeft: "12px" }}>
            <div style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
              {/* Dynamic SVG Donut */}
              <div style={{ position: "relative", width: 150, height: 150 }}>
                <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
                  {donutSlices.map((slice, idx) => (
                    <circle
                      key={idx}
                      cx="60"
                      cy="60"
                      r={r}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="10"
                      strokeDasharray={`${(slice.value / 100) * circ} ${circ}`}
                      strokeDashoffset={-slice.offset}
                      transform={`rotate(${slice.rotate - 90} 60 60)`}
                      style={{ transition: "stroke-dasharray .3s, stroke-dashoffset .3s, transform .3s" }}
                    />
                  ))}
                </svg>
                {/* Center Text */}
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 9, fontFamily: FA, color: C.t4, letterSpacing: "1px", fontWeight: 700 }}>PORTFOLIO</span>
                  <span style={{ fontSize: 11, fontWeight: "bold", color: "#fff" }}>최적화 완료</span>
                </div>
              </div>

              {/* Dynamic Metrics */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 150 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: C.t4 }}>기대수익률 (Return)</span>
                  <span style={{ fontSize: 12, fontWeight: "bold", fontFamily: FP, color: C.green }}>{portfolio.metrics.return.toFixed(2)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: C.t4 }}>변동성 (Volatility)</span>
                  <span style={{ fontSize: 12, fontWeight: "bold", fontFamily: FP }}>{portfolio.metrics.volatility.toFixed(2)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: C.t4 }}>샤프 비율 (Sharpe)</span>
                  <span style={{ fontSize: 12, fontWeight: "bold", fontFamily: FP, color: C.violet }}>{portfolio.metrics.sharpe.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Weights Legend and sliders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {portfolio.weights.map((w) => (
                <div key={w.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.color, flexShrink: 0 }} />
                  <span style={{ color: "#aaa" }}>{w.name}</span>
                  {/* weight bar representation */}
                  <div style={{ flex: 1, height: 4, background: "#111", borderRadius: 2, overflow: "hidden", margin: "0 10px" }}>
                    <div style={{ width: `${w.value}%`, height: "100%", background: w.color, transition: "width .3s" }} />
                  </div>
                  <span style={{ fontFamily: FP, fontWeight: "bold", color: "#fff", width: 42, textAlign: "right" }}>{w.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* METRICS */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, width: "100%", maxWidth: 900, marginTop: 80, borderTop: `1px solid ${C.b1}`, paddingTop: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px" }}>
            <span style={{ fontSize: "28px", fontWeight: 700, fontFamily: FP, color: C.violet }}>10,000+</span>
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
