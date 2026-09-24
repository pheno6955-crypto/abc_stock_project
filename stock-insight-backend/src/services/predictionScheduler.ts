import { resolveEligiblePending } from "../routes/predictions.js";

// 별도 cron 인프라 없이, 주기적으로 깨어나 판정 가능 시각(resolvableAt)이 지난 예측을 확인한다.
// 실서비스 전환 시 node-cron 등으로 교체 가능하나, 이 폴링 방식으로도 지연은 최대 CHECK_INTERVAL_MS 이내로 충분.
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function startPredictionScheduler(): void {
  const tick = async () => {
    try {
      const { resolved, failed } = await resolveEligiblePending();
      if (resolved.length > 0 || failed.length > 0) {
        console.log(`[predictionScheduler] resolved ${resolved.length}, failed ${failed.length}`);
      }
    } catch (err) {
      console.warn("[predictionScheduler] tick failed:", (err as Error).message);
    }
  };

  setInterval(tick, CHECK_INTERVAL_MS);
  tick();
}
