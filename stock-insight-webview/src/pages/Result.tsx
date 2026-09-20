import type { PredictionResult } from "../types";

interface Props {
  result: PredictionResult;
  onDone: () => void;
}

export default function Result({ result, onDone }: Props) {
  return (
    <div>
      <div className="card" style={{ textAlign: "center" }}>
        <h2>예측이 제출되었습니다</h2>
        <p>
          {result.stockName} 내일 방향: <strong>{result.direction === "UP" ? "상승 ▲" : "하락 ▼"}</strong>
        </p>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          제출 시점 기준가 {result.referencePrice.toLocaleString()}원
        </p>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          결과는 다음 거래일 종가 확정 후 반영되며, 적중 시 리워드가 자동 지급됩니다.
        </p>
        <span className="reward-badge">적중 시 올원캔디 지급 예정</span>
      </div>
      <button className="primary-button" onClick={onDone}>
        종목 검색으로 돌아가기
      </button>
    </div>
  );
}
