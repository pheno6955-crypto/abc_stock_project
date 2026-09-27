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
}

// 리포트 화면의 "주가 영향요인 분석" 메뉴 안에 표시되는 내용. (별도 화면이 아님)
export default function FactorAnalysis({ stock }: Props) {
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
      <div>
        <p style={{ color: "var(--color-up)" }}>{error}</p>
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
          <span>AI가 올리·내리 포인트를 분석하고 있어요</span>
          <span className="ai-loading-dots">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </span>
        </div>
        <Skeleton width="100%" height={56} />
        <div style={{ marginTop: "var(--space-sm)" }}>
          <Skeleton width="100%" height={56} />
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
      {priceChangePct != null && (
        <div className="factor-price-row">
          <PriceBadge priceChangePct={priceChangePct} />
        </div>
      )}

      {!hasFactors && (
        <div className="card empty-state">
          <span className="empty-state-icon">
            <Bot size={32} />
          </span>
          <p className="empty-state-title">
            {data.note ? "아직 AI 분석이 연결되지 않았어요" : "올리·내리 포인트를 찾지 못했어요"}
          </p>
          <p className="empty-state-desc">
            {data.note ??
              "이 종목과 직접 관련된 뉴스가 충분하지 않아 분석할 요인이 없어요. 잠시 후 다시 확인해보세요."}
          </p>
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
        <div className="factor-group">
          <h3 className="card-title factor-title up">
            <TrendingUp size={16} /> 올리 포인트
          </h3>
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
        <div className="factor-group">
          <h3 className="card-title factor-title down">
            <TrendingDown size={16} /> 내리 포인트
          </h3>
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
    </div>
  );
}
