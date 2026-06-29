export const translations = {
  ko: {
    // Navbar
    appTitle: "ASSET ALLOCATION MODELING",
    tabSimulator: "포트폴리오 시뮬레이터",
    tabIntelligence: "마켓 인텔리전스",
    tabMacro: "매크로 대시보드",
    tabResearch: "리서치 파이프라인",
    tabHelp: "도움말",
    marketRegime: "MARKET REGIME:",
    host: "HOST:",

    // Left sidebar — Simulator
    simulationHistory: "시뮬레이션 기록",
    noSimulations: "기록된 시뮬레이션이 없습니다.",
    runId: "RUN #",
    aiInterpretation: "AI 해석",
    thesis: "논거",
    sources: "출처",
    conf: "신뢰도",

    // Loading stepper
    pipelineTitle: "포트폴리오 시뮬레이션 파이프라인",
    pipelineDesc:
      "FastAPI 백엔드에서 실시간 베이지안 업데이트 연산 및 10,000회 몬테카를로 경로 시뮬레이션을 진행하고 있습니다.",
    stepRunning: "실행 중",
    deepseekLabel: "NEMOTRON 3 SUPER · AI 추론 트레이스",
    collapse: "▲ 접기",
    expand: "▼ 펼치기",
    steps: [
      {
        label: "MARKET PORTFOLIO RETRIEVAL",
        desc: "국민연금 공시 비중 및 2026 자산배분 목표치 로드",
      },
      {
        label: "ETF HISTORICAL FEED & TREASURY CRAWL",
        desc: "대표 ETF 시세 데이터 수집 및 10년물 국채 금리 연계",
      },
      {
        label: "DEEPSEEK R1 REASONING (FREE)",
        desc: "자연어 투자 의견을 추론 모델로 분석 · BL 뷰 벡터 수치화 (최대 2분)",
      },
      {
        label: "BAYESIAN BLACK-LITTERMAN COMBINATION",
        desc: "Prior와 View의 확률 결합을 통해 사후 기대수익률 분포 추정",
      },
      {
        label: "CONSTRAINED MULTI-ASSET OPTIMIZATION",
        desc: "설정 제약조건 범위(δ) 내에서 최적의 가중치 행렬 도출",
      },
      {
        label: "10,000-TRIAL MONTE CARLO STRESS TEST",
        desc: "Student-t 분포(Fat Tail) 기반 몬테카를로 경로 시뮬레이션",
      },
      {
        label: "HISTORICAL CRISIS SCENARIO SHOCK TEST",
        desc: "역사적 금융 위기 시나리오(GFC, 코로나19 등) 스트레스 테스트 수행",
      },
      {
        label: "REAL-TIME MACRO & AI INVESTMENT REPORTING",
        desc: "실시간 매크로 지표 분석 및 AI 포트폴리오 코멘터리 생성",
      },
    ],

    // Error / anomaly
    systemAnomaly: "시스템 이상 감지됨",

    // Results dashboard
    simulationResults: "시뮬레이션 결과",
    simulationSubtitle: "기대 지표, 리스크 통계 및 최적화된 자산 배분.",
    exportPdf: "보고서 내보내기 (PDF)",

    // Metric card labels
    expReturn: "기대 수익률",
    portfolioVol: "포트폴리오 변동성",
    sharpeRatio: "샤프 비율",
    var95: "95% VaR (1Y)",
    cvar95: "95% CVaR (1Y)",
    maxDrawdown: "최대 낙폭",

    // Metrics explanation strip
    metricDescExpReturn: "연간 기대수익률",
    metricDescVol: "연간 수익률 표준편차",
    metricDescSharpe: "단위 리스크당 초과수익",
    metricDescVar: "95% 신뢰구간 최대손실",
    metricDescCvar: "극단손실 시나리오 평균",
    metricDescMaxDd: "고점 대비 최대 낙폭 추정",

    // Min variance fallback
    minVarianceFallback: "⚠ 최소분산 대체 최적화",
    minVarianceFallbackDesc:
      "모든 사후 기대수익률이 무위험금리를 하회하여 Markowitz 대신 최소분산(Min-Variance) 최적화로 전환되었습니다. 투자 의견을 조정하거나 다른 최적화 전략을 선택하세요.",

    // BL View Attribution section
    blAttributionTitle: "BL 기대수익률 산출 근거",
    blAttributionPrior: "Prior",
    blAttributionPosterior: "Posterior",
    blAttributionDelta: "변화",
    blAttributionThesis: "논거",
    blAttributionSources: "출처",
    blAttributionNoViews: "시장 균형 유지 (해당 자산에 적용된 뷰 없음)",
    blAttributionViewType: "절대적",
    blAttributionViewTypeRel: "상대적",
    blAttributionConf: "신뢰도",

    // Grouped allocation chart
    chartGroupedAllocation: "포트폴리오 배분 비교 (벤치마크 vs 최적화)",
    legendBenchmarkShort: "국민연금 (벤치마크)",
    legendOptimizedShort: "최적화 포트폴리오",

    // AI commentary card
    aiCommentaryTitle: "AI 포트폴리오 분석 및 투자 코멘터리",
    noAiCommentary: "생성된 AI 분석 리포트가 없습니다.",

    // Macro context card
    macroIndicatorsTitle: "실시간 매크로 지표",
    noMacroData: "수집된 거시 경제 데이터가 없습니다.",

    // PM Memo
    pmMemoTitle: "PM 내부 메모",
    pmMemoConfidential: "기밀 · 내부 사용 전용",
    pmRegimeBias: "레짐 편향:",
    pmThesisSummary: "투자 의견 요약:",
    pmPositioningAdvice: "전략적 포지셔닝 조언:",
    pmCalibrationRationale: "보정 근거:",
    pmKeyRisks: "주요 리스크 고려 사항:",

    // Chart titles
    chartWeightDeviation: "BL 가중치 시장 편차",
    chartExpReturns: "기대수익률 (사전 vs 사후)",
    chartEfficientFrontier: "효율적 프론티어 곡선",
    chartMonteCarlo: "몬테카를로 드리프트 경로 (15개 샘플)",
    chartReturnDist: "누적 수익률 확률 밀도 및 95% VaR",
    chartStressTest: "역사적 위기 시나리오 스트레스 테스트",
    chartUnitPct: "단위: %",
    chartImpact: "포트폴리오 영향",

    // Stress test table headers
    stressCrisisScenario: "위기 시나리오",
    stressImpact: "영향",
    stressKrStock: "국내주식",
    stressGlobalStock: "해외주식",
    stressAlt: "대체투자",
    stressNoData: "역사적 스트레스 테스트 결과를 찾을 수 없습니다.",

    // Efficient frontier tooltip
    efExpReturn: "기대수익률",
    efVolatility: "변동성",

    // Legend labels (chart series names)
    legendPrior: "시장 균형수익률 (Prior)",
    legendPosterior: "BL 기대수익률 (Posterior)",
    legendBLDelta: "BL 편차 (pp)",
    legendBenchmark: "국민연금 벤치마크",
    legendOptimized: "최적화 포트폴리오",

    // Asset info panel
    assetMappingLabel:
      "국민연금 가중치 모델 매핑 자산:",
    assetMappingValues:
      "국내주식(EWY), 해외주식(VT), 국내채권(136340.KS), 해외채권(BNDX), 대체투자(VNQ)",
    lambdaLabel: "위험회피도 (Lambda):",
    lambdaDefault: "(기본값)",
    lambdaDynamic: "(동적추정)",
    tauLabel: "척도 (Tau):",
    tauDefault: "(기본값)",
    tauBayesian: "(베이지안)",
    rfLabel: "무위험수익률:",

    // Intelligence tab
    intelTitle: "실시간 마켓 인텔리전스",
    intelSubtitle:
      "AI 해석이 담긴 시장 전문가들의 엄선된 투자 의견.",
    refreshFeed: "피드 새로고침",
    applyToSimulator: "시뮬레이터에 적용",
    srcResearch: "1. 리서치",
    srcNews: "2. 뉴스 기사",
    srcUserAsset: "3. 사용자 자산 (링크/PDF)",
    searchPlaceholder: "인텔 검색 (제목, 내용, 저자)...",
    clear: "지우기",
    catAll: "전체",
    catEquity: "주식",
    catBond: "채권",
    catAlt: "대체",
    catMacro: "경제 & 기타",
    sortOrder: "정렬 순서:",
    sortNewest: "최신순",
    sortRanked: "AI 신뢰도 순",
    noIntelFound: "일치하는 인텔을 찾을 수 없습니다",
    selectThesisPrompt: "보고서를 보려면 논거를 선택하세요",
    active: "활성",
    addToDock: "활성 도크에 추가",
    removeFromDock: "활성 도크에서 제거 (클릭)",
    includedInSimulation: "시뮬레이션에 포함",
    feedbackPlaceholder:
      "이 논거에 대한 맞춤 피드백/수정 사항 입력 (AI가 최적화 시 이를 반영합니다)...",

    // Source attribution labels
    sourceAttribution: "출처 정보",
    npsHouseView: "NPS 하우스 뷰",
    userAssetLabel: "사용자 자산",
    marketNews: "시장 뉴스",
    viewOriginalArticle: "원본 기사 보기 ↗",

    // Report sections
    execAbstract: "핵심 요약",
    reportSection1: "I. 핵심 요약",
    reportSection2: "II. 거시경제 근거",
    reportSection3: "III. 대상 자산 시사점",
    reportSection4: "IV. 포트폴리오 배분 권고사항",
    reportSection5: "V. 리스크 요인 및 주의사항",
    sourcesUsed: "본 분석에 사용된 출처",
    primarySource: "주요 출처:",
    authorLabel: "저자:",
    aiInterpretationLabel: "AI 해석",
    confidenceLabel: "신뢰도:",

    // URL/PDF Ingestion
    addUserAssets: "사용자 리서치 자산 추가 (링크 또는 PDF 업로드)",
    addUserAssetsHint:
      "— 링크 입력 또는 PDF 업로드 시 AI가 본문을 판독해 보고서 피드에 추가합니다.",
    urlPlaceholder: "https://example.com/market-article",
    analyzing: "분석 중…",
    analyzeLink: "링크 분석",
    uploadPdf: "PDF 보고서 업로드",
    pdfHint:
      "리서치 리포트·정책 문서 PDF를 업로드하면 AI가 본문을 읽고 분석합니다.",
    ingestingMsg:
      "문서를 해독하고 AI 분석 보고서를 생성하는 중입니다. 최대 1분가량 소요될 수 있습니다…",
    pasteContentPlaceholder:
      "URL을 자동으로 불러오지 못했습니다. 기사 본문을 복사하여 여기에 붙여넣은 뒤 ANALYZE를 다시 누르세요.",

    // Macro tab
    macroTitle: "거시경제 대시보드",
    macroSubtitle: "실시간 글로벌 시장 지표 및 레짐 감지.",
    refreshData: "데이터 새로고침",
    fetchingMarketData: "시장 데이터 불러오는 중...",
    detectedRegime: "감지된 시장 레짐",
    vixLabel: "VIX 변동성 수준",
    lambdaMultiplierLabel: "위험회피 배율 (λ)",
    allocationStrategyLabel: "자산배분 전략 영향",
    overlayLabel: "오버레이:",
    noHistoricalData: "이용 가능한 역사적 데이터 없음",
    correlationHeatmap: "거시경제 상관관계 히트맵",
    selectCellForAnalysis: "분석하려면 셀을 선택하세요",
    correlationAnalysis: "상관관계 분석",

    // Research Pipeline tab
    researchTitle: "매크로 리서치 파이프라인",
    researchSubtitle:
      "매크로 정보 수집 및 선택 → 보정된 논거 구축 (Nemotron Super) → 자산배분 계산 (Idzorek BL).",
    btnCollect: "1 · 수집",
    btnBuildTheses: "2 · 논거 구축",
    researchQueueLabel: "리서치 큐",
    queueEmpty: "큐가 비어 있습니다. COLLECT를 실행하세요.",
    houseThesesLabel: "하우스 논거",
    noTheses: "Thesis가 없습니다. BUILD THESES를 실행하세요.",
    analysisPromotion: "분석 및 승격",
    queued: "대기 중",
    dragThesesHere: "논거를 여기에 드래그",
    dragThesesHint:
      "여러 논거를 드래그하여 대기열에 추가하세요. ▶ 를 눌러 모두 마켓 인텔리전스로 병렬 승격합니다.",
    allocationResult: "자산배분 결과",
    debateLog: "토론 로그",
    dragToPromote: "src · 승격하려면 드래그 →",
    parallelAnalyses: "병렬 LLM 분석 실행 중",
    promotingAll: "개 논거를 병렬 분석 중...",

    // Help tab
    helpTitle: "터미널 시스템 문서 및 가이드",
    helpSubtitle:
      "자산배분 모델링 플랫폼과 워크플로우 운용 방법을 알아보세요.",
    helpOpPhase: "운영 단계",
    helpSOP: "표준 운영 절차",
    helpProTip: "운영 프로팁:",
    helpSteps: [
      {
        title: "수집",
        subtitle: "인텔리전스 수집",
        description:
          "최신 거시경제 지표, 금융 뉴스 및 글로벌 RSS 피드를 가져와 워크플로우를 초기화합니다. 시스템은 Yahoo Finance 및 RSS 소스에서 실시간 피드를 처리합니다.",
        howItWorks: [
          "리서치 파이프라인 탭에서 'COLLECT' 버튼을 클릭하세요.",
          "시스템이 백엔드 크롤러에 쿼리하여 글로벌 시장 피드를 파싱합니다.",
          "각 기사에 대한 관련성 및 복합 감성 점수가 자동으로 계산됩니다.",
        ],
        tip: "일중 거시경제 변화에 맞춰 이 데이터를 주기적으로 새로고침할 수 있습니다.",
      },
      {
        title: "구축",
        subtitle: "하우스 논거 작성",
        description:
          "원시 뉴스와 데이터를 구조화된 투자 아이디어로 변환합니다. AI 코어가 수집된 큐를 읽고 고수준 거시경제 뷰 정의를 생성합니다.",
        howItWorks: [
          "리서치 파이프라인 2열에서 'BUILD THESES' 버튼을 클릭하세요.",
          "Nemotron AI 에이전트가 뉴스 맥락을 평가하고 개별 자산 전망을 형성합니다.",
          "각 논거에는 주제별 신뢰도 점수(0~100%)와 시장 시계가 할당됩니다.",
        ],
        tip: "이 AI 초안 논거를 직접 승인하거나 거부하여 노이즈를 필터링할 수 있습니다.",
      },
      {
        title: "승격",
        subtitle: "보고서로 확장",
        description:
          "승인된 아이디어를 기관급 애널리스트 보고서로 심화합니다. 3열에 하우스 논거 카드를 드래그 앤 드롭하여 Bloomberg 스타일의 전체 보고서를 생성하세요.",
        howItWorks: [
          "'HOUSE THESES' 열에서 초안 카드를 선택하세요.",
          "점선으로 된 'ANALYSIS & PROMOTION' 영역에 드래그 앤 드롭하세요.",
          "AI 에이전트가 자동으로 논거를 핵심 요약, 거시 근거 및 특정 리스크 요인으로 확장합니다.",
        ],
        tip: "승격 후 논거는 활성 소스로 '마켓 인텔리전스' 탭에 이전됩니다.",
      },
      {
        title: "도크",
        subtitle: "활성 뷰 선택",
        description:
          "마켓 인텔리전스 카탈로그와 상호작용합니다. 리서치, 뉴스, 사용자 업로드 자산을 정리한 후 포트폴리오 시뮬레이션에 적용할 관점을 선택하세요.",
        howItWorks: [
          "마켓 인텔리전스 폴더(리서치, 뉴스, 사용자 자산)를 탐색하세요.",
          "관련 카드를 하단의 부유하는 '활성 시뮬레이션 바스켓'에 드래그 앤 드롭하세요.",
          "선택적으로 소스 카드를 클릭하여 전체 애널리스트 보고서를 읽고 맞춤 조정 사항을 입력하세요.",
        ],
        tip: "부유하는 도크는 카드를 드래그하면 동적으로 업데이트되는 유동형 컨테이너 역할을 합니다.",
      },
      {
        title: "시뮬레이션",
        subtitle: "블랙-리터만 실행",
        description:
          "주관적 뷰와 시장 균형을 결합하여 배분을 최적화합니다. 파라미터를 구성하고 베이지안 결합 모델링 파이프라인을 실행하세요.",
        howItWorks: [
          "하단 도크의 원형 실행 버튼을 클릭하세요.",
          "확인 팝업에서 활성 소스를 검토하고 최대 벤치마크 이탈(δ)을 조정하세요.",
          "최적화 엔진(예: 리스크 패리티, Markowitz MVO 또는 HRP)을 선택하고 '시뮬레이션 실행'을 클릭하세요.",
        ],
        tip: "백엔드에서 10,000회 몬테카를로 스트레스 테스트와 역사적 충격 테스트를 실행합니다.",
      },
      {
        title: "내보내기",
        subtitle: "보고서 생성",
        description:
          "시뮬레이션 결과, 최적화된 포트폴리오 가중치 및 스트레스 테스트 회복력을 요약한 벡터 선명도의 단일 페이지 PDF 보고서를 생성합니다.",
        howItWorks: [
          "시뮬레이션이 완료된 후 포트폴리오 시뮬레이터 대시보드로 이동하세요.",
          "시뮬레이션 헤더 옆의 'EXPORT REPORT (PDF)' 버튼을 클릭하세요.",
          "투자위원회를 위해 벡터 스타일 보고서를 저장하거나 인쇄하세요.",
        ],
        tip: "인쇄 버전은 UI 요소를 제거하고 표준 레터/A4 페이지 템플릿에 맞게 자동으로 최적화됩니다.",
      },
    ],

    // Floating dock
    activeBasket: "활성 시뮬레이션 바스켓",
    sourcesActive: "개 소스 활성",
    dragDropHint: "마켓 인텔 카드를 여기에 드래그 앤 드롭하여 활성 시뮬레이션에 추가하세요",

    // Confirm modal
    confirmSimulation: "시뮬레이션 실행 확인",
    closeModal: "✕ 닫기",
    includedSources: "포함된 소스",
    maxDeviation: "최대 벤치마크 이탈 (δ)",
    maxDeviationHint:
      "NPS 전략적 벤치마크 가중치 대비 최대 허용 언더/오버웨이트 범위를 정의합니다.",
    optimizationEngine: "최적화 엔진",
    cancelBtn: "취소",
    executeSimulation: "시뮬레이션 실행",

    // Optimizer descriptions
    optEnsembleDesc: "ENSEMBLE (권장 - MVO + 리스크 패리티 + HRP 평균)",
    optRpDesc: "RISK PARITY (균형 리스크 배분)",
    optMvoDesc: "MARKOWITZ MVO (샤프 최대화)",
    optHrpDesc: "HIERARCHICAL RISK PARITY (HRP)",
    optResampledDesc: "RESAMPLED MVO (Michaud - 부트스트랩 강건)",
    optEnsembleHint:
      "✓ 권장: Markowitz, 리스크 패리티, HRP를 평균화하여 단일 모델 민감도를 줄이고 극단적 집중을 방지합니다.",
    optRpHint: "✓ 위험 기여도를 균등화하여 집중 급등을 방지하는 방식으로 가중치를 배분합니다.",
    optMvoHint: "⚠ 샤프 비율 최대화; 기대수익률 입력에 가장 민감 — 집중된 포트폴리오를 생성할 수 있습니다.",
    optHrpHint: "💡 계층적 클러스터링 기반 배분 — 표본 외 안정적이며 기대수익률을 무시합니다.",
    optResampledHint: "💡 50회 MVO를 부트스트랩하고 평균화 — 표준 Markowitz 대비 추정 오류를 줄입니다.",

    // PDF Report strings
    pdfOrgTitle: "국민연금 (NPS)",
    pdfReportTitle: "글로벌 포트폴리오 배분 보고서",
    pdfEngineOutput: "블랙-리터만 최적화 엔진 출력",
    pdfRunId: "실행 ID: #",
    pdfDate: "날짜:",
    pdfEngine: "엔진:",
    pdfDevLimit: "이탈 한도 (δ):",
    pdfSection1: "I. 포트폴리오 리스크 및 수익률 분석",
    pdfMetric: "지표",
    pdfStrategicBenchmark: "전략적 벤치마크",
    pdfOptimizedPortfolio: "최적화 포트폴리오",
    pdfActiveVariance: "액티브 분산",
    pdfExpReturn: "연간 기대수익률",
    pdfAnnualVol: "연간 변동성",
    pdfExpSharpe: "기대 샤프 비율",
    pdfVar95: "95% VaR (1Y)",
    pdfCvar95: "95% CVaR (1Y)",
    pdfMaxDd: "예상 최대 낙폭",
    pdfSection2: "II. 자산 배분 및 기대수익률",
    pdfAssetClass: "자산군",
    pdfOptimizedWeight: "최적화 가중치",
    pdfActiveWeight: "액티브 가중치",
    pdfPriorReturn: "사전 수익률",
    pdfPosteriorReturn: "사후 수익률",
    pdfSection3: "III. 역사적 위기 시나리오 분석",
    pdfCrisisScenario: "위기 시나리오명",
    pdfPortfolioReturn: "포트폴리오 수익률",
    pdfKrStockImpact: "국내주식 영향",
    pdfGlobalStockImpact: "해외주식 영향",
    pdfAltImpact: "대체투자 영향",
    pdfSection4: "IV. 전략적 코멘터리 및 투자 의견",
    pdfFooterConfidential: "기밀 - 투자위원회 검토 전용",
    pdfFooterCopyright: "국민연금 (NPS) 계량적 배분 플랫폼 © 2026",
  },
  en: {
    // Navbar
    appTitle: "ASSET ALLOCATION MODELING",
    tabSimulator: "PORTFOLIO SIMULATOR",
    tabIntelligence: "MARKET INTELLIGENCE",
    tabMacro: "MACRO DASHBOARD",
    tabResearch: "RESEARCH PIPELINE",
    tabHelp: "HELP",
    marketRegime: "MARKET REGIME:",
    host: "HOST:",

    // Left sidebar — Simulator
    simulationHistory: "SIMULATION HISTORY",
    noSimulations: "No simulations recorded.",
    runId: "RUN #",
    aiInterpretation: "AI INTERPRETATION",
    thesis: "THESIS",
    sources: "SOURCES",
    conf: "CONF",

    // Loading stepper
    pipelineTitle: "PORTFOLIO SIMULATION PIPELINE",
    pipelineDesc:
      "Running real-time Bayesian update computations and 10,000-trial Monte Carlo path simulations on the FastAPI backend.",
    stepRunning: "RUNNING",
    deepseekLabel: "NEMOTRON 3 SUPER · AI REASONING TRACE",
    collapse: "▲ COLLAPSE",
    expand: "▼ EXPAND",
    steps: [
      {
        label: "MARKET PORTFOLIO RETRIEVAL",
        desc: "Load NPS disclosed weights and 2026 asset allocation targets",
      },
      {
        label: "ETF HISTORICAL FEED & TREASURY CRAWL",
        desc: "Collect benchmark ETF price data and link 10Y Treasury yields",
      },
      {
        label: "DEEPSEEK R1 REASONING (FREE)",
        desc: "Analyze natural language views with reasoning model · Encode BL view vectors (up to 2 min)",
      },
      {
        label: "BAYESIAN BLACK-LITTERMAN COMBINATION",
        desc: "Estimate posterior expected return distribution via probabilistic combination of prior and views",
      },
      {
        label: "CONSTRAINED MULTI-ASSET OPTIMIZATION",
        desc: "Derive optimal weight matrix within the configured constraint range (δ)",
      },
      {
        label: "10,000-TRIAL MONTE CARLO STRESS TEST",
        desc: "Student-t distribution (fat tail) based Monte Carlo path simulation",
      },
      {
        label: "HISTORICAL CRISIS SCENARIO SHOCK TEST",
        desc: "Stress testing against historical financial crisis scenarios (GFC, COVID-19, etc.)",
      },
      {
        label: "REAL-TIME MACRO & AI INVESTMENT REPORTING",
        desc: "Real-time macro indicator analysis and AI portfolio commentary generation",
      },
    ],

    // Error / anomaly
    systemAnomaly: "SYSTEM ANOMALY DETECTED",

    // Results dashboard
    simulationResults: "SIMULATION RUN RESULTS",
    simulationSubtitle: "Expected metrics, risk statistics, and optimized asset allocations.",
    exportPdf: "EXPORT REPORT (PDF)",

    // Metric card labels
    expReturn: "EXP RETURN",
    portfolioVol: "PORTFOLIO VOL",
    sharpeRatio: "SHARPE RATIO",
    var95: "95% VAR (1Y)",
    cvar95: "95% CVAR (1Y)",
    maxDrawdown: "MAX DRAWDOWN",

    // Metrics explanation strip
    metricDescExpReturn: "Annual expected return",
    metricDescVol: "Annual return standard deviation",
    metricDescSharpe: "Excess return per unit of risk",
    metricDescVar: "Maximum loss at 95% confidence",
    metricDescCvar: "Average loss in extreme scenarios",
    metricDescMaxDd: "Estimated max drawdown from peak",

    // Min variance fallback
    minVarianceFallback: "⚠ MIN-VARIANCE FALLBACK",
    minVarianceFallbackDesc:
      "All posterior expected returns fell below the risk-free rate, switching from Markowitz to Min-Variance optimization. Adjust your investment views or select a different optimization strategy.",

    // BL View Attribution section
    blAttributionTitle: "BL Expected Return Attribution",
    blAttributionPrior: "Prior",
    blAttributionPosterior: "Posterior",
    blAttributionDelta: "Delta",
    blAttributionThesis: "Thesis",
    blAttributionSources: "Sources",
    blAttributionNoViews: "At market equilibrium (no views applied)",
    blAttributionViewType: "ABS",
    blAttributionViewTypeRel: "REL",
    blAttributionConf: "Conf",

    // Grouped allocation chart
    chartGroupedAllocation: "Allocation Comparison (Benchmark vs Optimized)",
    legendBenchmarkShort: "NPS Benchmark",
    legendOptimizedShort: "Optimized Portfolio",

    // AI commentary card
    aiCommentaryTitle: "AI PORTFOLIO ANALYSIS & INVESTMENT COMMENTARY",
    noAiCommentary: "No AI analysis report generated.",

    // Macro context card
    macroIndicatorsTitle: "REAL-TIME MACRO INDICATORS",
    noMacroData: "No macroeconomic data collected.",

    // PM Memo
    pmMemoTitle: "PM INTERNAL MEMO",
    pmMemoConfidential: "CONFIDENTIAL · INTERNAL USE ONLY",
    pmRegimeBias: "Regime Bias:",
    pmThesisSummary: "Investment Thesis Summary:",
    pmPositioningAdvice: "Strategic Positioning Advice:",
    pmCalibrationRationale: "Calibration Rationale:",
    pmKeyRisks: "Key Risks Considered:",

    // Chart titles
    chartWeightDeviation: "BL WEIGHT DEVIATION FROM MARKET",
    chartExpReturns: "EXPECTED RETURNS (PRIOR VS POSTERIOR)",
    chartEfficientFrontier: "EFFICIENT FRONTIER CURVE",
    chartMonteCarlo: "MONTE CARLO DRIFT PATHS (15 SAMPLES)",
    chartReturnDist: "CUMULATIVE RETURN PROBABILITY DENSITY & 95% VAR",
    chartStressTest: "HISTORICAL CRISIS SCENARIO STRESS TEST",
    chartUnitPct: "UNIT: %",
    chartImpact: "PORTFOLIO IMPACT",

    // Stress test table headers
    stressCrisisScenario: "CRISIS SCENARIO",
    stressImpact: "IMPACT",
    stressKrStock: "KR STOCK",
    stressGlobalStock: "GLOBAL STOCK",
    stressAlt: "ALTERNATIVE",
    stressNoData: "No historical stress test results found.",

    // Efficient frontier tooltip
    efExpReturn: "Expected Return",
    efVolatility: "Volatility",

    // Legend labels (chart series names)
    legendPrior: "Market Equilibrium (Prior)",
    legendPosterior: "BL Expected Return (Posterior)",
    legendBLDelta: "BL Deviation (pp)",
    legendBenchmark: "NPS Benchmark",
    legendOptimized: "Optimized Portfolio",

    // Asset info panel
    assetMappingLabel: "NPS weight model mapped assets:",
    assetMappingValues:
      "KR Equity (EWY), Global Equity (VT), KR Bond (136340.KS), Global Bond (BNDX), Alternatives (VNQ)",
    lambdaLabel: "Risk Aversion (Lambda):",
    lambdaDefault: "(default)",
    lambdaDynamic: "(dynamic)",
    tauLabel: "Tau:",
    tauDefault: "(default)",
    tauBayesian: "(Bayesian)",
    rfLabel: "Risk-Free Rate:",

    // Intelligence tab
    intelTitle: "REAL-TIME MARKET INTELLIGENCE",
    intelSubtitle:
      "Curated investment theses from market professionals with AI interpretations.",
    refreshFeed: "REFRESH FEED",
    applyToSimulator: "APPLY TO SIMULATOR",
    srcResearch: "1. Research",
    srcNews: "2. News Article",
    srcUserAsset: "3. User Asset (Link/PDF)",
    searchPlaceholder: "SEARCH INTEL (TITLE, CONTENT, AUTHOR)...",
    clear: "CLEAR",
    catAll: "ALL",
    catEquity: "EQUITIES",
    catBond: "FIXED INCOME",
    catAlt: "ALT",
    catMacro: "ECON & ETC",
    sortOrder: "SORT ORDER:",
    sortNewest: "NEWEST",
    sortRanked: "RANKED (AI CONFIDENCE)",
    noIntelFound: "NO MATCHING INTEL FOUND",
    selectThesisPrompt: "SELECT A THESIS TO VIEW REPORT",
    active: "ACTIVE",
    addToDock: "ADD TO ACTIVE DOCK",
    removeFromDock: "ACTIVE IN DOCK (CLICK TO REMOVE)",
    includedInSimulation: "Include in Active Simulation",
    feedbackPlaceholder:
      "Type custom feedback/modifications to this thesis (AI will incorporate these adjustments in the optimization)...",

    // Source attribution labels
    sourceAttribution: "Source Attribution",
    npsHouseView: "NPS House View",
    userAssetLabel: "User Asset",
    marketNews: "Market News",
    viewOriginalArticle: "View Original Article ↗",

    // Report sections
    execAbstract: "Executive Abstract",
    reportSection1: "I. Executive Summary",
    reportSection2: "II. Macroeconomic Rationale",
    reportSection3: "III. Target Assets Implications",
    reportSection4: "IV. Portfolio Allocation Recommendation",
    reportSection5: "V. Risk Factors & Caveats",
    sourcesUsed: "Sources Used in This Analysis",
    primarySource: "Primary Source:",
    authorLabel: "Author:",
    aiInterpretationLabel: "AI INTERPRETATION",
    confidenceLabel: "CONFIDENCE:",

    // URL/PDF Ingestion
    addUserAssets: "ADD USER RESEARCH ASSETS (LINK OR PDF UPLOAD)",
    addUserAssetsHint:
      "— AI reads the article body and adds it to the report feed when you submit a link or upload a PDF.",
    urlPlaceholder: "https://example.com/market-article",
    analyzing: "ANALYZING…",
    analyzeLink: "ANALYZE LINK",
    uploadPdf: "UPLOAD PDF REPORT",
    pdfHint:
      "Upload a research report or policy document PDF and AI will read and analyze the content.",
    ingestingMsg:
      "Decoding document and generating AI analysis report. This may take up to 1 minute…",
    pasteContentPlaceholder:
      "Could not auto-fetch the URL. Please copy and paste the article body here, then click ANALYZE again.",

    // Macro tab
    macroTitle: "MACROECONOMIC DASHBOARD",
    macroSubtitle: "Real-time global market indicators and regime detection.",
    refreshData: "REFRESH DATA",
    fetchingMarketData: "FETCHING MARKET DATA...",
    detectedRegime: "Detected Market Regime",
    vixLabel: "VIX VOLATILITY LEVEL",
    lambdaMultiplierLabel: "RISK-AVERSION MULTIPLIER (λ)",
    allocationStrategyLabel: "ALLOCATION STRATEGY IMPACT",
    overlayLabel: "OVERLAY:",
    noHistoricalData: "NO HISTORICAL DATA AVAILABLE",
    correlationHeatmap: "MACROECONOMIC CORRELATION HEATMAP",
    selectCellForAnalysis: "SELECT CELL FOR ANALYSIS",
    correlationAnalysis: "CORRELATION ANALYSIS",

    // Research Pipeline tab
    researchTitle: "MACRO RESEARCH PIPELINE",
    researchSubtitle:
      "Search & select macro info → build calibrated theses (Nemotron Super) → compute allocation (Idzorek BL).",
    btnCollect: "1 · COLLECT",
    btnBuildTheses: "2 · BUILD THESES",
    researchQueueLabel: "RESEARCH QUEUE",
    queueEmpty: "Queue is empty. Run COLLECT.",
    houseThesesLabel: "HOUSE THESES",
    noTheses: "No theses found. Run BUILD THESES.",
    analysisPromotion: "ANALYSIS & PROMOTION",
    queued: "queued",
    dragThesesHere: "DRAG THESES HERE",
    dragThesesHint:
      "Drop multiple theses to queue them. Hit ▶ to promote all in parallel to Market Intelligence.",
    allocationResult: "ALLOCATION RESULT",
    debateLog: "DEBATE LOG",
    dragToPromote: "src · drag to promote →",
    parallelAnalyses: "parallel LLM analyses",
    promotingAll: "theses in parallel...",

    // Help tab
    helpTitle: "TERMINAL SYSTEM DOCUMENTATION & GUIDE",
    helpSubtitle:
      "Learn about the Asset Allocation Modeling platform and how to operate its workflows.",
    helpOpPhase: "Operational Phase",
    helpSOP: "Standard Operational Procedure",
    helpProTip: "OPERATIONAL PRO-TIP:",
    helpSteps: [
      {
        title: "COLLECT",
        subtitle: "Gather Intelligence",
        description:
          "Initialize the workflow by fetching the latest macroeconomic indicators, financial news, and global RSS feeds. The system processes real-time feeds from Yahoo Finance and RSS sources.",
        howItWorks: [
          "Click the 'COLLECT' button in the Research Pipeline tab.",
          "The system queries backend crawlers to parse global market feeds.",
          "Relevance and composite sentiment scores are calculated automatically for each article.",
        ],
        tip: "You can refresh this data periodically to stay aligned with intraday macroeconomic shifts.",
      },
      {
        title: "BUILD",
        subtitle: "Draft House Theses",
        description:
          "Transform raw news and data into structured investment ideas. The AI core reads the collected queue and generates high-level macroeconomic view definitions.",
        howItWorks: [
          "Click the 'BUILD THESES' button in Column 2 of the Research Pipeline.",
          "The Nemotron AI agent evaluates the news context and forms discrete asset outlooks.",
          "Each thesis is assigned a subject-specific confidence score (0% to 100%) and market horizon.",
        ],
        tip: "You can directly APPROVE or REJECT these AI-drafted theses to filter out noise.",
      },
      {
        title: "PROMOTE",
        subtitle: "Expand to Reports",
        description:
          "Deepen your approved ideas into institutional-grade analyst reports. Drag-and-drop a house thesis card into Column 3 to generate a full Bloomberg-style dossier.",
        howItWorks: [
          "Select a draft card in the 'HOUSE THESES' column.",
          "Drag it and drop it into the dashed 'ANALYSIS & PROMOTION' zone.",
          "The AI agent automatically expands the thesis with an Executive Summary, Macro Rationale, and specific Risk Factors.",
        ],
        tip: "Once promoted, the thesis is transferred to the 'Market Intelligence' tab as an active source.",
      },
      {
        title: "DOCK",
        subtitle: "Select Active Views",
        description:
          "Interact with the Market Intelligence catalog. Organize your research, news, and user uploaded assets, then select the viewpoints to apply to your portfolio simulation.",
        howItWorks: [
          "Browse the Market Intelligence folders (Research, News, User Assets).",
          "Drag any relevant card and drop it into the bottom floating 'Active Simulation Basket'.",
          "Optionally, click on a source card to read the full analyst dossier and type custom adjustments.",
        ],
        tip: "The floating dock acts as a liquid glass container that updates dynamically as you drag cards over it.",
      },
      {
        title: "SIMULATE",
        subtitle: "Run Black-Litterman",
        description:
          "Combine subjective views with market equilibrium to optimize allocation. Configure parameters and run a Bayesian combination modeling pipeline.",
        howItWorks: [
          "Click the circular Play button in the bottom dock.",
          "In the confirmation popup, review the active sources and adjust the Max Benchmark Deviation (δ).",
          "Choose an optimization engine (e.g. Risk Parity, Markowitz MVO, or HRP) and click 'EXECUTE SIMULATION'.",
        ],
        tip: "The backend will run a 10,000-trial Monte Carlo stress test and historical shock tests.",
      },
      {
        title: "EXPORT",
        subtitle: "Generate Dossier",
        description:
          "Generate a vector-sharp one-page PDF report summarizing the simulation outcomes, optimized portfolio weights, and stress test resilience.",
        howItWorks: [
          "After the simulation finishes, navigate to the Portfolio Simulator dashboard.",
          "Click the 'EXPORT REPORT (PDF)' button next to the simulation header.",
          "Save or print the vector-styled dossier for the investment committee.",
        ],
        tip: "The printed version is automatically optimized for standard letter/A4 page templates, removing UI elements.",
      },
    ],

    // Floating dock
    activeBasket: "ACTIVE SIMULATION BASKET",
    sourcesActive: "SOURCES ACTIVE",
    dragDropHint: "DRAG & DROP MARKET INTEL CARDS HERE TO ADD THEM TO THE ACTIVE SIMULATION",

    // Confirm modal
    confirmSimulation: "CONFIRM SIMULATION RUN",
    closeModal: "✕ CLOSE",
    includedSources: "INCLUDED SOURCES",
    maxDeviation: "MAX BENCHMARK DEVIATION (δ)",
    maxDeviationHint:
      "Defines the maximum allowed underweight/overweight bounds relative to the NPS strategic benchmark weights.",
    optimizationEngine: "OPTIMIZATION ENGINE",
    cancelBtn: "CANCEL",
    executeSimulation: "EXECUTE SIMULATION",

    // Optimizer descriptions
    optEnsembleDesc: "ENSEMBLE (Recommended - Averages MVO + Risk Parity + HRP)",
    optRpDesc: "RISK PARITY (Balanced Risk Allocation)",
    optMvoDesc: "MARKOWITZ MVO (Sharpe Maximization)",
    optHrpDesc: "HIERARCHICAL RISK PARITY (HRP)",
    optResampledDesc: "RESAMPLED MVO (Michaud - Bootstrap Robust)",
    optEnsembleHint:
      "✓ Recommended: Averages Markowitz, Risk Parity, and HRP — reduces single-model sensitivity and prevents extreme concentrations.",
    optRpHint: "✓ Allocates weights to equalize risk contributions, preventing concentration spikes.",
    optMvoHint: "⚠ Maximizes Sharpe Ratio; most sensitive to expected return inputs — can produce concentrated portfolios.",
    optHrpHint: "💡 Hierarchical clustering-based allocation — stable out-of-sample, ignores expected returns.",
    optResampledHint: "💡 Bootstraps 50 MVO runs and averages — reduces estimation error vs standard Markowitz.",

    // PDF Report strings
    pdfOrgTitle: "NATIONAL PENSION SERVICE (NPS)",
    pdfReportTitle: "GLOBAL PORTFOLIO ALLOCATION REPORT",
    pdfEngineOutput: "Black-Litterman Optimization Engine Output",
    pdfRunId: "RUN ID: #",
    pdfDate: "DATE:",
    pdfEngine: "ENGINE:",
    pdfDevLimit: "DEV LIMIT (δ):",
    pdfSection1: "I. Portfolio Risk & Return Analysis",
    pdfMetric: "Metric",
    pdfStrategicBenchmark: "Strategic Benchmark",
    pdfOptimizedPortfolio: "Optimized Portfolio",
    pdfActiveVariance: "Active Variance",
    pdfExpReturn: "Expected Annual Return",
    pdfAnnualVol: "Annual Volatility",
    pdfExpSharpe: "Expected Sharpe Ratio",
    pdfVar95: "95% Value-at-Risk (1Y)",
    pdfCvar95: "95% Conditional VaR (1Y)",
    pdfMaxDd: "Projected Max Drawdown",
    pdfSection2: "II. Asset Allocations & Expected Returns",
    pdfAssetClass: "Asset Class",
    pdfOptimizedWeight: "Optimized Weight",
    pdfActiveWeight: "Active Weight",
    pdfPriorReturn: "Prior Return",
    pdfPosteriorReturn: "Posterior Return",
    pdfSection3: "III. Historical Crisis Scenario Analysis",
    pdfCrisisScenario: "Crisis Scenario Name",
    pdfPortfolioReturn: "Portfolio Return",
    pdfKrStockImpact: "KR Stock Impact",
    pdfGlobalStockImpact: "Global Stock Impact",
    pdfAltImpact: "Alternatives Impact",
    pdfSection4: "IV. Strategic Commentary & Investment Thesis",
    pdfFooterConfidential: "CONFIDENTIAL - FOR INVESTMENT COMMITTEE REVIEW ONLY",
    pdfFooterCopyright: "National Pension Service (NPS) Quantitative Allocation Platform © 2026",
  },
} as const;

export type Lang = "ko" | "en";
export type Translations = typeof translations.ko;
