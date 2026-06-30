# NPS AI 블랙-리터만 자산배분 플랫폼

국민연금(NPS) 투자 프레임워크를 기반으로 한 AI 포트폴리오 최적화 엔진입니다. 실시간 거시경제 데이터와 뉴스, 기관 리서치를 수집하고 LLM 추론을 통해 정량적 투자 의견을 추출한 뒤, 블랙-리터만 앙상블 최적화기를 실행해 균형 잡힌 설명 가능한 자산배분 결과를 생성합니다.

로컬에서 직접 실행할 수 있는 연구 수준의 AI 포트폴리오 엔진이 필요한 모든 분들을 위해 만들었습니다.

---

## 무엇을 하는 플랫폼인가요?

기존 포트폴리오 최적화기는 현재 시장 상황을 반영하지 못합니다 — 과거 상관관계만으로 최적화합니다. 이 플랫폼은 그 간극을 메웁니다:

1. **실시간 인텔리전스 수집** — 10개 이상의 데이터 소스에서 정보를 수집합니다: 금융 뉴스, 중앙은행 발표문, GDELT 지정학적 이벤트, CFTC 포지셔닝, ETF 자금흐름, FRED 거시지표, 한국은행 ECOS 데이터
2. **소스별 LLM 분석** — LLM이 각 소스를 분석해 자산군별 강세/약세 신호가 담긴 구조화된 투자 테제를 추출합니다
3. **투자 의견 수치화** — 연쇄 추론(Chain-of-Thought) 모델이 테제를 블랙-리터만 파라미터로 변환합니다: 대상 자산, 기대수익률, 신뢰도
4. **BL 모델 실행** — He-Litterman tau 교정, Idzorek 신뢰도 가중치, James-Stein 수축을 적용해 극단적 사후 편향을 방지합니다
5. **앙상블 최적화** — 평균-분산 최적화(60%), 리스크 패리티(20%), 계층적 리스크 패리티(20%)를 조합해 NPS 벤치마크 편차 한도 내에서 최적 포트폴리오를 도출합니다
6. **종합 리포트 출력** — 벤치마크 대비 최종 비중, 기대수익/리스크 지표, 효율적 프론티어, 몬테카를로 경로, AI 투자 코멘터리를 제공합니다

---

## 자산군 구성

NPS 표준 5개 자산군을 기준으로 배분합니다:

| 자산군 | 벤치마크 티커 | NPS 2026 목표비중 |
|--------|--------------|-----------------|
| 국내주식 | EWY | 20.8% |
| 해외주식 | VT | 34.7% |
| 국내채권 | 136340.KS | 23.1% |
| 해외채권 | BNDX | 7.4% |
| 대체투자 | VNQ | 14.0% |

---

## 사전 요구사항

- Python 3.11 이상
- Node.js 18 이상
- [OpenRouter](https://openrouter.ai) 계정 — **무료 플랜으로 충분합니다**, 기본 모델 전부 무료

---

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/rubberama/AI-asset-allocation.git
cd AI-asset-allocation
```

### 2. 백엔드 설정

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

### 3. API 키 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 키를 입력합니다:

```env
# ── 필수 ────────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...        # https://openrouter.ai — 무료 계정

# ── 선택 (없어도 동작하며, 해당 데이터 소스만 건너뜁니다) ──────────────────
MARKETAUX_API_KEY=                  # https://www.marketaux.com — 무료 플랜
FRED_API_KEY=                       # https://fred.stlouisfed.org/docs/api/api_key.html — 무료
ECOS_API_KEY=                       # https://ecos.bok.or.kr — 무료 (한국 거시지표)
```

`.env.example`에 있는 나머지 항목(모델명, 리스크 파라미터, DB 경로 등)은 기본값이 설정되어 있으므로 수정하지 않아도 됩니다.

### 4. 백엔드 실행

```bash
cd backend
uvicorn app.main:app --reload
```

API 서버가 `http://localhost:8000`에서 실행됩니다. `http://localhost:8000/docs`에서 자동 생성된 API 문서를 확인할 수 있습니다.

### 5. 프론트엔드 실행

새 터미널을 열어 실행합니다:

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 상단의 **API Base URL** 필드가 `http://localhost:8000`으로 설정되어 있는지 확인한 후 **Run Simulation**을 클릭합니다.

---

## API 키 정리

| 키 | 필수 여부 | 용도 | 무료 여부 |
|----|---------|------|---------|
| `OPENROUTER_API_KEY` | **필수** | 모든 LLM 호출 (의견 추출, 코멘터리, 테제 생성) | 무료 플랜 제공 |
| `MARKETAUX_API_KEY` | 선택 | 금융 뉴스 피드 — 30개 이상 헤드라인에서 10~15개 기사 선별/분석 | 무료 (요청당 3건) |
| `FRED_API_KEY` | 선택 | 미국 거시지표: CPI, 기준금리, 실업률, 수익률 곡선 | 무제한 무료 |
| `ECOS_API_KEY` | 선택 | 한국 거시지표: 한은 기준금리, 한국 CPI, 무역수지 | 무제한 무료 |

선택 키가 없어도 플랫폼은 정상 동작합니다. 해당 소스만 건너뛰고 나머지 데이터로 시뮬레이션을 진행합니다. OpenRouter 키만 있으면 yfinance 가격 데이터로 전체 시뮬레이션을 실행할 수 있습니다.

---

## AI 모델

모든 기본 모델은 **OpenRouter 무료 플랜**으로 사용 가능합니다.

| 역할 | 기본 모델 | 환경변수로 변경 |
|------|---------|--------------|
| 일반 읽기 / 헤드라인 선택 | `openrouter/owl-alpha` | `OPENROUTER_MODEL` |
| 기사 분석 (장문 컨텍스트) | `openrouter/owl-alpha` | `ARTICLE_DIGESTION_MODEL` |
| 의견 파싱 / 변동성 보정 | `openrouter/owl-alpha` *(임시 — 평소 추론 모델)* | `VIEW_PARSING_MODEL` |
| 연쇄 추론 / PM 메모 | `openrouter/owl-alpha` *(임시 — 평소 추론 모델)* | `REASONING_MODEL` |

> ⚙️ **앱 안에서도 바꿀 수 있습니다.** 워크스페이스 상단의 **시스템 → 설정** 탭에서 각 작업의 모델을
> 클릭 한 번으로 교체할 수 있으며, 변경 사항은 자동으로 `backend/.env`에 저장됩니다.
>
> 현재 의견 파싱·연쇄 추론은 OpenRouter 크레딧 소진으로 `owl-alpha`로 **임시 전환**되어 있습니다.
> 크레딧이 복구되면 설정 탭(또는 `.env`)에서 `nvidia/nemotron-3-super-120b-a12b:free` 등 추론 모델로 되돌리세요.

더 강력한 모델(예: Claude, GPT-4o)을 사용하려면 설정 탭 또는 `.env`에서 변경합니다:

```env
REASONING_MODEL=anthropic/claude-sonnet-4-5
VIEW_PARSING_MODEL=anthropic/claude-haiku-4-5
```

---

## 작동 원리 (기술 상세)

### 블랙-리터만 모델

He-Litterman (1999) 공식을 기반으로 구현했습니다:

- **사전 분포 (Prior)**: 시장 균형 수익률 `Π = λΣw` — `λ`는 내재 샤프 비율로 동적 추정, `τ = 0.05`는 표준 교정값 사용
- **투자 의견 (Views)**: LLM이 추출한 절대/상대 수익률 의견 `(P, Q)`와 의견별 신뢰도 점수
- **불확실성 행렬 (Ω)**: Idzorek (2007) 신뢰도 교정 — 분석가 신뢰도 `[0, 1]`를 Ω 대각 원소로 매핑해, 해당 신뢰도 비율만큼 완전신뢰 대비 사후 포트폴리오 편차가 발생하도록 최적화
- **수축 (Shrinkage)**: 각 의견을 사전 균형 수익률 방향으로 20% James-Stein 수축 + 최종 사후 수익률에서 `Π`로 8% 블렌딩 — 다중 의견 누적 시 극단값 발생 방지
- **신뢰도 상한**: 단일 의견이 사후 분포를 지배하지 못하도록 0.72로 고정

### 앙상블 최적화기

세 가지 최적화기를 BL 사후 수익률에 동시에 실행한 후 블렌딩합니다:

| 최적화기 | 비중 | 역할 |
|---------|-----|------|
| 평균-분산 (MVO) | 60% | BL 수익률 신호를 포트폴리오 비중으로 전달 |
| 리스크 패리티 (RP) | 20% | 변동성 변화에 강건한 동등 리스크 기여 |
| 계층적 리스크 패리티 (HRP) | 20% | 상관관계 불안정에 강건한 클러스터링 기반 배분 |

세 최적화기 모두 블렌딩 전에 `[벤치마크 ± 최대편차]` 범위 내로 제한됩니다.

### 데이터 파이프라인

```
뉴스 / PDF / RSS 피드
        ↓
  기사 분석 (LLM)
        ↓
  투자 테제 (구조화 JSON)
        ↓
  의견 추출 (CoT 추론 모델)
        ↓
  BL 의견: (자산, 기대수익률, 신뢰도)
        ↓
  블랙-리터만 사후 수익률
        ↓
  앙상블 최적화
        ↓
  최종 비중 + 리스크 리포트
```

---

## 프로젝트 구조

```
backend/
  app/
    main.py                # FastAPI 엔드포인트 (/simulate, /allocate, /market-intelligence 등)
    black_litterman.py     # BL 사후 계산: Pi, Omega, Idzorek, James-Stein
    optimizer.py           # MVO / 리스크 패리티 / HRP 앙상블 + 제약 조건 투영
    llm.py                 # OpenRouter 호출 + 의견 파싱 + 클램핑
    thesis_engine.py       # 원시 인텔리전스 → 구조화 투자 테제 변환
    market_intelligence.py # 전체 데이터 소스 오케스트레이션
    collect.py             # 기사 선별 및 분석 파이프라인
    research.py            # PDF 수집 및 분석
    config.py              # 환경변수 및 상수 관리
    sources/
      normalize.py         # 소스 무관 기사 정규화기
      news_feeds.py        # RSS + Marketaux
      central_banks.py     # Fed Beige Book, 한은 MPB, ECB, IMF, BIS
      bank_research.py     # 상업은행 리서치 스크래핑
      cftc.py              # CFTC 트레이더 포지셔닝
      etf_flows.py         # ETF 자금흐름 프록시
      ecos.py              # 한국은행 ECOS API
  requirements.txt
  .env.example

frontend/
  app/
    page.tsx               # 전체 UI: 시뮬레이션 컨트롤, 차트, 마켓 인텔리전스 탭
    globals.css
    layout.tsx
```

---

## 라이선스

MIT
