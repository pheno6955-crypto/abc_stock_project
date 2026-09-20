import { useState } from "react";
import type { PredictionDirection, PredictionResult, StockSummary } from "../types";
import { submitPrediction } from "../api/client";
import { getErrorMessage } from "../api/errors";

interface Props {
  stock: StockSummary;
  onSubmitted: (result: PredictionResult) => void;
}

export default function Predict({ stock, onSubmitted }: Props) {
  const [selected, setSelected] = useState<PredictionDirection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <h2 style={{ fontSize: 20 }}>{stock.name} 방향 예측</h2>
      <p style={{ color: "var(--color-text-secondary)" }}>
        내일 종가가 오늘보다 오를지, 내릴지 예측해보세요. (투자 행위가 아닌 참여형 콘텐츠입니다)
      </p>
      <div className="predict-buttons" style={{ margin: "24px 0" }}>
        <button
          className={`predict-button up ${selected === "UP" ? "selected" : ""}`}
          onClick={() => setSelected("UP")}
        >
          상승 ▲
        </button>
        <button
          className={`predict-button down ${selected === "DOWN" ? "selected" : ""}`}
          onClick={() => setSelected("DOWN")}
        >
          하락 ▼
        </button>
      </div>
      <button
        className="primary-button"
        disabled={!selected || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "제출 중..." : "예측 제출"}
      </button>
      {error && <p style={{ color: "var(--color-up)", fontSize: 13 }}>{error}</p>}
      <p className="disclaimer">
        예측이 적중하면 소정의 리워드(올원캔디 등)가 지급됩니다. 실제 매수·매도를 권유하는 것이 아닙니다.
      </p>
    </div>
  );
}
