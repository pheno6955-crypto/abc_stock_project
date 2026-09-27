import { useCallback, useEffect, useRef, useState } from "react";
import type { StockMetric, StockSummary } from "../types";
import { getStockMetrics } from "../api/client";
import { getErrorMessage } from "../api/errors";
import Skeleton from "../components/Skeleton";

interface Props {
  stock: StockSummary;
}

// 리포트 화면의 "투자 지표" 메뉴 안에 표시되는 내용. 네이버 금융에서 실시간으로 가져온
// 시가총액/PER/PBR 등을 그대로 보여준다 (숫자를 다시 계산하지 않고 네이버 표기를 그대로 사용).
export default function InvestmentMetrics({ stock }: Props) {
  const [metrics, setMetrics] = useState<StockMetric[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedCodeRef = useRef<string | null>(null);

  const load = useCallback(() => {
    loadedCodeRef.current = stock.code;
    setError(null);
    setMetrics(null);
    getStockMetrics(stock.code)
      .then(setMetrics)
      .catch((err) => setError(getErrorMessage(err)));
  }, [stock.code]);

  useEffect(() => {
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

  if (!metrics) {
    return (
      <div className="metric-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="metric-card">
            <Skeleton width="50%" height={12} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width="75%" height={18} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (metrics.length === 0) {
    return <p className="empty-state-desc">이 종목은 투자 지표를 제공하지 않아요.</p>;
  }

  return (
    <div className="metric-grid">
      {metrics.map((m) => (
        <div key={m.label} className="metric-card">
          <div className="metric-label">{m.label}</div>
          <div className="metric-value">{m.value}</div>
        </div>
      ))}
    </div>
  );
}
