import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { PredictionResult } from "../types";
import { getMyPredictions, claimReward, seedDemoPredictions } from "../api/client";
import { nhBridge } from "../bridge/nhBridge";
import { getErrorMessage } from "../api/errors";
import { displayStockName } from "../utils/stockName";

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
  const [seeding, setSeeding] = useState(false);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await seedDemoPredictions();
      load();
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setSeeding(false);
    }
  };

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

  // 팀 검토/화면 점검용. 실제 서비스에서는 노출하지 않을 임시 버튼.
  const devSeedButton = (
    <button className="secondary-button dev-seed-button" onClick={handleSeedDemo} disabled={seeding}>
      {seeding ? "추가 중..." : "테스트 데이터 추가 (적중·미적중 예시)"}
    </button>
  );

  if (predictions.length === 0) {
    return (
      <div>
        <p style={{ color: "var(--color-text-secondary)" }}>아직 참여한 예측이 없어요.</p>
        {devSeedButton}
      </div>
    );
  }

  return (
    <div className="history-list">
      {devSeedButton}
      {predictions.map((p) => {
        const dir = p.direction === "UP" ? "up" : "down";
        const status = p.resolvedAt === null ? "pending" : p.isCorrect ? "hit" : "miss";
        const statusLabel = { pending: "확정 대기", hit: "적중", miss: "미적중" }[status];
        return (
        <div key={p.id} className={`card history-card ${dir}`}>
          <div className="history-head">
            <h2>{displayStockName(p.stockName, p.code)}</h2>
            <span className={`status-chip ${status}`}>{statusLabel}</span>
          </div>
          <p className="history-meta">
            <span className={`direction-chip ${dir}`}>
              {p.direction === "UP" ? "올리 ▲" : "내리 ▼"}
            </span>
            <span className="price-chip">기준가 {p.referencePrice.toLocaleString()}원</span>
          </p>
          {p.resolvedAt === null && (
            <p className="pending-notice">
              <Clock size={14} />
              {formatResolvableAt(p.resolvableAt)} 결과 확정 예정
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
        );
      })}
    </div>
  );
}
