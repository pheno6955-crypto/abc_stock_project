// KRX 정규장은 15:30 KST에 마감. 종가 확정 여유(10분)를 두고 15:40 KST를 판정 가능 시각으로 잡는다.
// 주말만 걸러내며, 설/추석 등 공휴일 휴장일은 반영하지 않음 — 실서비스 전환 시 거래소 휴장일 캘린더 필요.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RESOLVE_HOUR_KST = 15;
const RESOLVE_MINUTE_KST = 40;

export function nextResolvableTime(from: Date = new Date()): Date {
  const kst = new Date(from.getTime() + KST_OFFSET_MS);
  kst.setUTCDate(kst.getUTCDate() + 1);
  while (kst.getUTCDay() === 0 || kst.getUTCDay() === 6) {
    kst.setUTCDate(kst.getUTCDate() + 1);
  }
  kst.setUTCHours(RESOLVE_HOUR_KST, RESOLVE_MINUTE_KST, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MS);
}
