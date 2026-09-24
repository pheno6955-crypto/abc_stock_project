import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import type { StreakStatus } from "../types";
import { getStreak, claimStreakBonus } from "../api/client";
import { nhBridge } from "../bridge/nhBridge";

export default function StreakBanner() {
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    getStreak()
      .then(setStreak)
      .catch(() => setStreak(null));
  }, []);

  // 0일째부터 "끊겼다"는 압박을 주면 역효과라, 참여 이력이 있을 때만 보여준다.
  if (!streak || streak.currentStreak === 0) return null;

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await claimStreakBonus();
      await nhBridge.grantRewardPoint(res.bonusAmount, `streak-bonus:${res.streak}`);
      setStreak((prev) => (prev ? { ...prev, bonusAvailable: false } : prev));
    } catch {
      // 실패해도 조용히 무시 — 다음 방문 때 다시 시도 가능
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="card streak-banner">
      <Flame size={22} />
      <div className="streak-text">
        <p className="streak-title">
          {streak.currentStreak}일 연속 참여 중{!streak.todayParticipated && " · 오늘은 아직이에요"}
        </p>
        <p className="streak-desc">
          {streak.todayParticipated
            ? `${streak.milestoneEvery}일마다 보너스 캔디를 드려요`
            : "오늘도 예측하면 스트릭이 이어져요"}
        </p>
      </div>
      {streak.bonusAvailable && (
        <button className="secondary-button" onClick={handleClaim} disabled={claiming}>
          보너스 받기
        </button>
      )}
    </div>
  );
}
