const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type RankingPeriod = "week" | "month";

// 기간 시작 시각(KST 자정)을 UTC Date로 반환한다. week는 그 주 월요일, month는 그달 1일 기준.
export function periodStart(period: RankingPeriod, now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);

  if (period === "month") {
    kst.setUTCDate(1);
  } else {
    const day = kst.getUTCDay(); // 0=일 ... 6=토
    const diffToMonday = (day + 6) % 7;
    kst.setUTCDate(kst.getUTCDate() - diffToMonday);
  }
  kst.setUTCHours(0, 0, 0, 0);

  return new Date(kst.getTime() - KST_OFFSET_MS);
}
