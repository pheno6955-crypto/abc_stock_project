import { LineChart, Scale, Target } from "lucide-react";
import StreakBanner from "../components/StreakBanner";
import ollieMascot from "../assets/ollie-mascot.png";

interface Props {
  onStart: () => void;
}

const FEATURES = [
  {
    icon: Scale,
    title: "주가 영향요인 분석",
    description: "올리 포인트와 내리 포인트를 한눈에 볼 수 있게 정리했어요.",
  },
  {
    icon: LineChart,
    title: "올리내리 리포트",
    description: "최신 뉴스·공시를 AI가 분석해 핵심 이슈와 투자 포인트를 요약해드려요.",
  },
  {
    icon: Target,
    title: "방향성 예측 + 리워드 + 랭킹",
    description: "내일 주가 방향을 예측하고, 적중하면 올원캔디를 받아요. 랭킹에서 내 순위도 확인해보세요.",
  },
];

export default function Home({ onStart }: Props) {
  return (
    <div>
      <StreakBanner />
      <div className="hero">
        <img src={ollieMascot} alt="" className="hero-mascot" />
        <p className="hero-eyebrow">AI와 함께하는 투자 분석</p>
        <h1 className="hero-title">
          오를까, 내릴까? <span style={{ color: "var(--color-up)" }}>올리</span>
          <span style={{ color: "var(--color-down)" }}>내리</span>와 함께
        </h1>
        <button className="primary-button" onClick={onStart}>
          종목 살펴보기
        </button>
      </div>

      <div>
        {FEATURES.map((f) => (
          <div key={f.title} className="card feature-card">
            <span className="feature-icon">
              <f.icon size={22} strokeWidth={2} />
            </span>
            <div>
              <h2>{f.title}</h2>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 아주 좁은 화면(약 340px 이하)에서는 전체 문구가 두 줄로 넘어가, 짧은 버전으로 바꿔치기한다.
          (핵심 문구 "투자 자문·권유 아님"은 두 버전 모두 유지) */}
      <p className="disclaimer disclaimer-full">
        AI 참고용 콘텐츠로, 투자 자문·권유가 아니며 책임은 본인에게 있어요.
      </p>
      <p className="disclaimer disclaimer-short">AI 참고용 콘텐츠이며 투자 자문·권유가 아니에요.</p>
    </div>
  );
}
