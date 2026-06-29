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
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 5 }}>
                <span style={{ fontSize: 11, color: C.t4 }}>기대수익률 (Expected Return)</span>
                <span style={{ fontSize: 11, fontWeight: "bold", color: C.green }}>6.84%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 5 }}>
                <span style={{ fontSize: 11, color: C.t4 }}>변동성 (Volatility)</span>
                <span style={{ fontSize: 11, fontWeight: "bold" }}>9.12%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #111", paddingBottom: 5 }}>
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
