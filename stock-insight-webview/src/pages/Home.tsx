interface Props {
  onStart: () => void;
  onViewHistory: () => void;
}

const FEATURES = [
  {
    icon: "📊",
    title: "AI 종목 리포트",
    description: "최신 뉴스·공시를 AI가 분석해 핵심 이슈와 투자 포인트를 요약해드려요.",
  },
  {
    icon: "⚖️",
    title: "주가 영향요인 분석",
    description: "상승·하락에 영향을 주는 요인을 한눈에 볼 수 있게 정리했어요.",
  },
  {
    icon: "🎯",
    title: "방향성 예측 + 리워드",
    description: "내일 주가 방향을 예측해보고, 적중하면 올원캔디를 받아보세요.",
  },
];

export default function Home({ onStart, onViewHistory }: Props) {
  return (
    <div>
      <div className="hero">
        <p className="hero-eyebrow">AI 기반 증권 종목 인사이트</p>
        <h1 className="hero-title">
          읽고, 분석하고,
          <br />
          함께 예측해보세요
        </h1>
        <p className="hero-subtitle">
          AI가 정리한 종목 리포트와 영향요인 분석을 보고, 방향성 예측에 참여해 리워드까지
          받아가는 참여형 금융 콘텐츠예요.
        </p>
        <button className="primary-button" onClick={onStart}>
          종목 살펴보기
        </button>
      </div>

      <div>
        {FEATURES.map((f) => (
          <div key={f.title} className="card feature-card">
            <span className="feature-icon">{f.icon}</span>
            <div>
              <h2>{f.title}</h2>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        className="secondary-link"
        onClick={onViewHistory}
      >
        내 예측 이력 보러가기 →
      </button>

      <p className="disclaimer">
        본 서비스는 AI가 생성한 참고용 정보와 비투자성 예측 콘텐츠를 제공하며, 투자 자문이나
        매매 권유가 아닙니다. 투자 결정은 본인 판단과 책임 하에 이루어져야 합니다.
      </p>
    </div>
  );
}
