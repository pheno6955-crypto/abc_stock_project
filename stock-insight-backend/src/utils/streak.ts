const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDateKey(d: Date): string {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface StreakStatus {
  currentStreak: number;
  todayParticipated: boolean;
}

// submittedAtList: 예측 제출 시각(ISO) 목록. 하루에 여러 번 참여해도 그날은 1일로만 카운트한다.
// 오늘 아직 참여 안 했으면 "어제까지의 스트릭"을 계속 보여주되(끊기기 전 마지막 유예),
// 오늘 참여했으면 오늘까지 포함해 계산한다.
export function computeStreak(submittedAtList: string[], now: Date = new Date()): StreakStatus {
  const daySet = new Set(submittedAtList.map((iso) => kstDateKey(new Date(iso))));
  const todayKey = kstDateKey(now);
  const todayParticipated = daySet.has(todayKey);

  let streak = 0;
  let cursorMs = now.getTime();
  if (!todayParticipated) cursorMs -= DAY_MS;

  while (daySet.has(kstDateKey(new Date(cursorMs)))) {
    streak++;
    cursorMs -= DAY_MS;
  }

  return { currentStreak: streak, todayParticipated };
}
