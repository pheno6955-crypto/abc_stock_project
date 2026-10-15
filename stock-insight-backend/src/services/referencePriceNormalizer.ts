import { getDailyCloses } from "./naverFinance.js";
import { listPredictions, updatePrediction } from "../store/predictionStore.js";

// 정규장 종가 기준을 도입하기 전에 장 마감 후·주말에 제출된 확정 대기 예측은 기준가가 통합 시세(시간외·넥스트레이드 포함)로
// 저장돼 있다. 그런 건을 "제출 시점 직전 정규장 종가"로 바로잡는다. 이미 맞는 값이면 건드리지 않으므로 여러 번 실행해도 안전하다.
export async function normalizePendingReferencePrices(): Promise<number> {
  let fixed = 0;
  for (const p of listPredictions()) {
    if (p.resolvedAt !== null) continue;
    const submitted = new Date(p.submittedAt);
    const kst = new Date(submitted.getTime() + 9 * 60 * 60 * 1000);
    const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    const weekday = kst.getUTCDay();
    const duringSession = weekday >= 1 && weekday <= 5 && minutes >= 9 * 60 && minutes < 15 * 60 + 30;
    if (duringSession) continue; // 장중 제출은 그 시각의 현재가가 기준가라 그대로 둔다

    try {
      const closes = await getDailyCloses(p.code, submitted);
      const last = closes[closes.length - 1];
      if (last && last.closePrice !== p.referencePrice) {
        updatePrediction(p.id, { referencePrice: last.closePrice });
        fixed++;
      }
    } catch (err) {
      console.warn(`[normalize] ${p.code} 기준가 보정 실패:`, (err as Error).message);
    }
  }
  return fixed;
}
