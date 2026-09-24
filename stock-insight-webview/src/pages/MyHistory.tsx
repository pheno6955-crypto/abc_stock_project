import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { PredictionResult } from "../types";
import { getMyPredictions, claimReward } from "../api/client";
import { nhBridge } from "../bridge/nhBridge";
import { getErrorMessage } from "../api/errors";

function formatResolvableAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export default function MyHistory() {
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const load = () => {
    setLoadError(null);
    getMyPredictions()
      .then(setPredictions)
      .catch((err) => setLoadError(getErrorMessage(err)));
  };

  useEffect(load, []);

  const handleClaim = async (prediction: PredictionResult) => {
    setActionErrors((prev) => ({ ...prev, [prediction.id]: "" }));
    try {
      await claimReward(prediction.id);
      await nhBridge.grantRewardPoint(1, `stock-prediction-correct:${prediction.id}`);
      setPredictions((prev) =>
        prev.map((p) => (p.id === prediction.id ? { ...p, rewardClaimed: true } : p))
      );
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [prediction.id]: getErrorMessage(err) }));
    }
  };

  if (loadError) {
    return (
      <div className="card">
        <p>{loadError}</p>
        <button className="primary-button" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  if (predictions.length === 0) {
    return <p style={{ color: "var(--color-text-secondary)" }}>아직 참여한 예측이 없습니다.</p>;
  }

  return (
    <div className="history-list">
      {predictions.map((p) => (
        <div key={p.id} className="card">
          <h2>{p.stockName}</h2>
          <p>
            예측: {p.direction === "UP" ? "상승 ▲" : "하락 ▼"} · 기준가{" "}
            {p.referencePrice.toLocaleString()}원 · 결과:{" "}
            {p.resolvedAt === null ? "확정 대기" : p.isCorrect ? "적중" : "미적중"}
          </p>
          {p.resolvedAt === null && (
            <p className="pending-notice">
              <Clock size={14} />
              {formatResolvableAt(p.resolvableAt)} 다음 거래일 종가 확정 후 자동으로 결과가
              나와요. 그 전까지는 결과를 확인할 수 없어요.
            </p>
          )}
          {p.isCorrect && !p.rewardClaimed && (
            <button className="primary-button" onClick={() => handleClaim(p)}>
              리워드 받기
            </button>
          )}
          {p.rewardClaimed && <span className="reward-badge">리워드 수령 완료</span>}
          {actionErrors[p.id] && (
            <p style={{ color: "var(--color-up)", fontSize: 13 }}>{actionErrors[p.id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
