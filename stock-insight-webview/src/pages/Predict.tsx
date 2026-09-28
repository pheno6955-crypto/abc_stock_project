import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { PredictionDirection, PredictionResult, StockSummary } from "../types";
import { getMyPredictions, getRecentSearchPrices, submitPrediction } from "../api/client";
import { getErrorMessage } from "../api/errors";
import { displayStockName } from "../utils/stockName";

interface Props {
  stock: StockSummary;
  onSubmitted: (result: PredictionResult) => void;
}

export default function Predict({ stock, onSubmitted }: Props) {
  const [selected, setSelected] = useState<PredictionDirection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 같은 종목에 결과가 확정되지 않은 예측이 이미 있으면 새 예측은 불가 (서버에서도 동일하게 막음)
  const [pending, setPending] = useState<PredictionResult | null>(null);
  // 예측의 기준가가 될 "지금 가격"을 화면에도 보여준다 (검색 시점 가격은 오래됐을 수 있어 새로 조회).
  const [livePrice, setLivePrice] = useState<StockSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecentSearchPrices([{ code: stock.code, name: stock.name, market: stock.market }])
      .then((list) => {
        if (!cancelled) setLivePrice(list[0] ?? null);
      })
      .catch(() => {
        // 현재가 표시만 실패하는 것이므로, 실패해도 예측 제출 자체는 그대로 진행 가능
      });
    return () => {
      cancelled = true;
    };
  }, [stock.code, stock.name, stock.market]);

  useEffect(() => {
    let cancelled = false;
    getMyPredictions()
      .then((list) => {
        if (!cancelled) setPending(list.find((p) => p.code === stock.code && p.resolvedAt === null) ?? null);
      })
      .catch(() => {
        // 조회 실패해도 제출 시 서버가 중복 여부를 다시 검사하므로 화면은 그대로 진행
      });
    return () => {
      cancelled = true;
    };
  }, [stock.code]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitPrediction(stock.code, stock.name, selected);
      onSubmitted(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{displayStockName(stock.name, stock.code)} 방향 예측</h2>
      <p style={{ color: "var(--color-text-secondary)" }}>내일 가격이 오를지 내릴지 예측해보세요.</p>
      {livePrice?.closePrice != null && (
        <div className="current-price-row">
          <span className="current-price-label">지금 기준가</span>
          <span className="current-price-value">{livePrice.closePrice.toLocaleString()}원</span>
          {livePrice.fluctuationsRatio != null && (
            <span
              className={`current-price-change ${livePrice.fluctuationsRatio >= 0 ? "up" : "down"}`}
            >
              {livePrice.fluctuationsRatio >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(livePrice.fluctuationsRatio).toFixed(2)}%
            </span>
          )}
        </div>
      )}
      {pending && (
        <div className="card notice-card already-predicted">
          <Info size={16} />
          <p>
            <strong>이미 예측에 참여한 종목이에요.</strong> 내 예측은{" "}
            <span className={`direction-chip ${pending.direction === "UP" ? "up" : "down"}`}>
              {pending.direction === "UP" ? "올리 ▲" : "내리 ▼"}
            </span>
            (기준가 {pending.referencePrice.toLocaleString()}원)이고, 결과 확정 후 다시 참여할 수
            있어요.
          </p>
        </div>
      )}
      <div className="predict-buttons" style={{ margin: "24px 0" }}>
        <button
          className={`predict-button up ${selected === "UP" ? "selected" : ""}`}
          disabled={!!pending}
          onClick={() => setSelected("UP")}
        >
          올리 ▲
        </button>
        <button
          className={`predict-button down ${selected === "DOWN" ? "selected" : ""}`}
          disabled={!!pending}
          onClick={() => setSelected("DOWN")}
        >
          내리 ▼
        </button>
      </div>
      <button
        className="primary-button"
        disabled={!selected || submitting || !!pending}
        onClick={handleSubmit}
      >
        {pending ? "이미 예측한 종목이에요" : submitting ? "제출 중..." : "예측 제출"}
      </button>
      {error && <p style={{ color: "var(--color-up)", fontSize: 13 }}>{error}</p>}
      <div className="card notice-card" style={{ marginTop: "var(--space-lg)" }}>
        <Info size={16} />
        <div>
          <p className="notice-title">판정 기준</p>
          <ul className="notice-list">
            <li>다음 거래일 종가와 비교해 자동 판정해요.</li>
            <li>결과는 예측 이력에서 확인할 수 있어요.</li>
          </ul>
        </div>
      </div>
      <p className="disclaimer">
        적중하면 리워드(NH포인트 등)가 지급돼요. 매수·매도를 권유하는 게 아니에요.
      </p>
    </div>
  );
}
