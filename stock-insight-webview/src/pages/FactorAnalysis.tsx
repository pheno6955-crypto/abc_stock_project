import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { FactorAnalysis as FactorAnalysisType, StockSummary } from "../types";
import { getFactorAnalysis } from "../api/client";
import { getErrorMessage } from "../api/errors";
import Skeleton from "../components/Skeleton";

function PriceBadge({ priceChangePct }: { priceChangePct: number }) {
  const color =
    priceChangePct > 0 ? "var(--color-up)" : priceChangePct < 0 ? "var(--color-down)" : "var(--color-text-secondary)";
  return (
    <span className="empty-state-badge" style={{ color }}>
      {priceChangePct > 0 ? "▲" : priceChangePct < 0 ? "▼" : "-"} 전일 대비{" "}
      {Math.abs(priceChangePct).toFixed(2)}%
    </span>
  );
}

interface Props {
  stock: StockSummary;
  onNext: () => void;
}

export default function FactorAnalysis({ stock, onNext }: Props) {
  const [data, setData] = useState<FactorAnalysisType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedCodeRef = useRef<string | null>(null);

  const load = useCallback(() => {
    loadedCodeRef.current = stock.code;
    setError(null);
    setData(null);
    getFactorAnalysis(stock.code)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }, [stock.code]);

  useEffect(() => {
    // 이미 로드된 종목이면 스킵 (React StrictMode의 개발 모드 중복 실행 방지)
    if (loadedCodeRef.current === stock.code) return;
    load();
  }, [stock.code, load]);

  if (error) {
    return (
      <div className="card">
        <p>{error}</p>
        <button className="primary-button" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <div className="ai-loading-status">
          <Bot size={16} />
          <span>AI가 상승·하락 요인을 분석하고 있어요</span>
          <span className="ai-loading-dots">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </span>
        </div>
        <Skeleton width="45%" height={20} />
        <div className="card" style={{ marginTop: "var(--space-md)" }}>
          <Skeleton width="20%" height={16} />
          <div style={{ marginTop: "var(--space-md)" }}>
            <Skeleton width="100%" height={56} />
            <div style={{ marginTop: "var(--space-sm)" }}>
              <Skeleton width="100%" height={56} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasFactors = data.bullishFactors.length > 0 || data.bearishFactors.length > 0;
  const priceChangePct = data.priceChangePct;
  const movedUp = priceChangePct != null && priceChangePct > 0;
  const movedDown = priceChangePct != null && priceChangePct < 0;
  const directionMismatch =
    hasFactors &&
    ((movedUp && data.bullishFactors.length === 0) || (movedDown && data.bearishFactors.length === 0));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{stock.name} 영향요인</h2>
        {priceChangePct != null && <PriceBadge priceChangePct={priceChangePct} />}
      </div>

      {!hasFactors && data.note && (
        <div className="card empty-state">
          <span className="empty-state-icon">
            <Bot size={32} />
          </span>
          <p className="empty-state-title">아직 AI 분석이 연결되지 않았어요</p>
          <p className="empty-state-desc">{data.note}</p>
        </div>
      )}

      {directionMismatch && (
        <div className="card notice-card">
          <Info size={16} />
          <p>
            오늘 {stock.name}은 {movedUp ? "상승" : "하락"}했지만, 관련 뉴스에서는 뚜렷한{" "}
            {movedUp ? "상승" : "하락"} 근거를 찾지 못했어요. 시장 전체 흐름이나 수급 등 뉴스에
            드러나지 않는 다른 요인의 영향일 수 있어요.
          </p>
        </div>
      )}

      {data.bullishFactors.length > 0 && (
        <div className="card">
          <h2 className="card-title factor-title up">
            <TrendingUp size={18} /> 상승 요인
          </h2>
          <div className="factor-list">
            {data.bullishFactors.map((f) => (
              <div key={f.label} className="factor-item up">
                <strong>{f.label}</strong>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.bearishFactors.length > 0 && (
        <div className="card">
          <h2 className="card-title factor-title down">
            <TrendingDown size={18} /> 하락 요인
          </h2>
          <div className="factor-list">
            {data.bearishFactors.map((f) => (
              <div key={f.label} className="factor-item down">
                <strong>{f.label}</strong>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasFactors && <p className="bridge-copy">지금까지 살펴본 내용을 참고해서, 내일 주가 방향을 예측해보세요</p>}

      <button className="primary-button" onClick={onNext}>
        방향성 예측 참여하기
      </button>
    </div>
  );
}
