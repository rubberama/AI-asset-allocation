"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EtacollaLogo } from "./EtacollaLogo";

// Design constants aligned with DESIGN.md and Workspace.tsx
const C = {
  bg: "#000",
  white: "#fff",
  t3: "#9a9a9a",
  t4: "#6a6a6a",
  b1: "#161616",
  b2: "#1c1c1c",
  b3: "#242424",
  violet: "#A78BFA",
  green: "#34D399",
  green2: "#6EE7B7",
  blue: "#3B82F6",
  amber: "#FBBF24",
  red: "#EF4444",
};

const FA = "'Archivo',sans-serif";
const FP = "'Pretendard',sans-serif";

export default function LoginPage() {
  const router = useRouter();
  const [emailOrId, setEmailOrId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrId.trim()) {
      setError("사원번호 또는 이메일을 입력하세요.");
      return;
    }
    if (!password.trim()) {
      setError("비밀번호를 입력하세요.");
      return;
    }

    setError("");
    setLoading(true);
    // Simulate auth lag and redirect
    timerRef.current = setTimeout(() => {
      setLoading(false);
      router.push("/workspace");
    }, 600);
  };

  const handleDemoLogin = () => {
    setLoading(true);
    setError("");
    timerRef.current = setTimeout(() => {
      setLoading(false);
      router.push("/workspace");
    }, 300);
  };

  return (
    <div
      style={{
        background: C.bg,
        color: C.white,
        fontFamily: FP,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style jsx global>{`
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.08); }
        }
        input {
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        input:focus {
          border-color: ${C.violet} !important;
          box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.2);
        }
      `}</style>

      {/* Background Glow Mesh behind the card */}
      <div
        style={{
          position: "absolute",
          width: "480px",
          height: "480px",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(167,139,250,0.18) 0%, rgba(0,0,0,0) 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
          animation: "subtlePulse 6s infinite ease-in-out",
          zIndex: 1,
        }}
      />

      {/* LOGIN CARD */}
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          border: `1px solid ${C.b1}`,
          background: "rgba(3, 3, 3, 0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 16,
          padding: "36px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.9)",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          position: "relative",
          zIndex: 5,
          margin: "20px",
        }}
      >
        {/* Branding Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 9.5, fontFamily: FA, color: C.t4, letterSpacing: "2.5px", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 14 }}>NPS QUANT LABS</span>
          <EtacollaLogo size={52} wordmarkSize={28} orientation="column" color={C.white} spin />
          <span style={{ fontSize: 11.5, color: C.t3, marginTop: 10, display: "block" }}>Quant Labs Portal / 자산배분 시스템</span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ fontSize: 11, color: C.red, background: "rgba(239, 68, 68, 0.08)", border: `1px solid rgba(239, 68, 68, 0.25)`, padding: "10px 12px", borderRadius: 6 }}>
              {error}
            </div>
          )}

          {/* Email input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="login-email" style={{ fontSize: 10.5, fontWeight: 600, color: "#8a8a8a" }}>사원번호 또는 이메일</label>
            <input
              id="login-email"
              name="email"
              type="text"
              autoComplete="username"
              placeholder="e.g. employee@nps.or.kr"
              value={emailOrId}
              onChange={(e) => setEmailOrId(e.target.value)}
              style={{
                background: "#080808",
                border: `1px solid ${C.b2}`,
                color: C.white,
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 12.5,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Password input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="login-password" style={{ fontSize: 10.5, fontWeight: 600, color: "#8a8a8a" }}>비밀번호</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                background: "#080808",
                border: `1px solid ${C.b2}`,
                color: C.white,
                padding: "12px 14px",
                borderRadius: 8,
                fontSize: 12.5,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            id="btn-login-submit"
            type="submit"
            disabled={loading}
            style={{
              fontFamily: FA,
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "1.5px",
              background: C.white,
              color: C.bg,
              border: "none",
              padding: "14px 20px",
              borderRadius: 8,
              cursor: loading ? "wait" : "pointer",
              transition: "transform 0.15s, opacity 0.15s",
              marginTop: 6,
              opacity: loading ? 0.75 : 1,
            }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.transform = "scale(1.02)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {loading ? "인증 처리 중..." : "포털 로그인"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "6px 0" }}>
          <div style={{ height: 1, background: C.b1, flex: 1 }} />
          <span style={{ fontSize: 9.5, color: C.t4, letterSpacing: "1px", textTransform: "uppercase" }}>OR</span>
          <div style={{ height: 1, background: C.b1, flex: 1 }} />
        </div>

        {/* Demo Fast Access Button */}
        <button
          id="btn-login-demo"
          type="button"
          onClick={handleDemoLogin}
          disabled={loading}
          style={{
            fontFamily: FA,
            fontWeight: 700,
            fontSize: 12.5,
            letterSpacing: "1px",
            background: "transparent",
            color: C.green,
            border: `1px solid rgba(52, 211, 153, 0.3)`,
            padding: "14px 20px",
            borderRadius: 8,
            cursor: loading ? "wait" : "pointer",
            transition: "background-color 0.15s, transform 0.15s",
            opacity: loading ? 0.75 : 1,
          }}
          onMouseOver={(e) => { if (!loading) { e.currentTarget.style.backgroundColor = "rgba(52, 211, 153, 0.04)"; e.currentTarget.style.transform = "scale(1.02)"; } }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
        >
          데모 계정으로 바로 시작 (DEMO) →
        </button>
      </div>

      {/* Footer Branding */}
      <span style={{ fontSize: 10, color: C.t4, fontFamily: FA, position: "absolute", bottom: 20, zIndex: 5 }}>
        CONFIDENTIAL · NPS INTERNAL USE ONLY
      </span>
    </div>
  );
}
