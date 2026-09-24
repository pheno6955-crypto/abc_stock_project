import fs from "node:fs";
import path from "node:path";

// 프로토타입 단계: 실제 DB 대신 JSON 파일 영속화 (predictionStore.ts와 동일한 방식).
// 로그인이 아직 없어 전체 서비스 단위로 마일스톤(날짜)을 하나만 추적한다 — 실 사용자 구분 붙으면 userId 기준으로 교체 필요.
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "streakBonuses.json");

function loadFromDisk(): string[] {
  if (isTest || !fs.existsSync(dataFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf-8")) as string[];
  } catch {
    return [];
  }
}

const claimedMilestones = new Set<string>(loadFromDisk());

function persist(): void {
  if (isTest) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(claimedMilestones), null, 2));
}

export function isMilestoneClaimed(dateKey: string): boolean {
  return claimedMilestones.has(dateKey);
}

export function claimMilestone(dateKey: string): void {
  claimedMilestones.add(dateKey);
  persist();
}
