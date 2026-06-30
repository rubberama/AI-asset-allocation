# Design Spec: Minimalist Login Portal

This document outlines the design specification for replacing the landing page at `/` with a simple, fast-looking login portal.

---

## 1. Goal & Objectives
* **Simple & Fast Login**: Create a centered minimalist login card on a pitch-black background.
* **Instant Demo Access**: Provide a quick button to log in with a demo account instantly and redirect to `/workspace`.
* **Consistent Brand Identity**: Match the obsidian black styling system and fonts (Geist, Archivo, Pretendard) specified in [DESIGN.md](file:///C:/Users/hyunjaekim/Desktop/Etacolla/AI-asset-allocation/frontend/DESIGN.md).

---

## 2. Visual Layout & Components

### 2.1 Login Card Structure
* **Branding Header**:
  * Title: "Etacolla" (bold uppercase `Archivo` font).
  * Subtitle: "Quant Labs Portal / 자산배분 시스템".
* **Form Inputs**:
  * **Email/ID (`사원번호 또는 이메일`)**: Plain text input with a dark border (`#1c1c1c`) and subtle focus ring.
  * **Password (`비밀번호`)**: Secure password input.
* **Action Buttons**:
  * Primary: `[로그인 (Sign In)]` (solid white button, black text).
  * Secondary (Fast Entry): `[데모 계정으로 바로 시작 (Launch Demo) →]` (ghost button with a subtle green border, instantly bypassing form validation and redirecting to `/workspace`).

### 2.2 Background & Effects
* Single central card with standard glassmorphic backdrop filter and subtle border.
* Radial gradient background glow centered behind the card, matching the obsidian aesthetic.

---

## 3. Spec Review & Verification

### 3.1 Verification Plan
* Verify that Next.js routing still compiles correctly and redirects successful logins to `/workspace`.
* Ensure input fields are fully keyboard-navigable and have proper ARIA labels.
