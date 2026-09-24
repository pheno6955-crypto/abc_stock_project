import { useState } from "react";
import { Info } from "lucide-react";
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
        지금 가격 대비, 다음 거래일 종가가 오를지 내릴지 예측해보세요. (투자 행위가 아닌 참여형
        콘텐츠입니다)
      </p>
      <div className="card notice-card">
        <Info size={16} />
        <p>
          <strong>판정 기준</strong>: 지금 이 순간의 가격을 기준가로 저장하고, 다음 거래일 장이
          마감되면(15:30 이후) 그 종가와 비교해 자동으로 상승/하락을 판정해요. 결과는 예측 이력
          페이지에서 확인할 수 있어요.
        </p>
      </div>
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
