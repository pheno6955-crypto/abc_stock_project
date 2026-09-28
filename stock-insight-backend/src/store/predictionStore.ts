import fs from "node:fs";
import path from "node:path";
import type { PredictionResult } from "../types.js";

// 프로토타입 단계: 실제 DB 대신 JSON 파일 영속화. 트래픽/동시성이 커지면 실제 DB로 교체 필요 (README TODO 참고).
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "predictions.json");

function loadFromDisk(): [string, PredictionResult][] {
  if (isTest || !fs.existsSync(dataFile)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as PredictionResult[];
    return raw.map((p) => [p.id, p]);
  } catch {
    return [];
  }
}

const predictions = new Map<string, PredictionResult>(loadFromDisk());

function persist(): void {
  if (isTest) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(predictions.values()), null, 2));
}

export function savePrediction(prediction: PredictionResult): void {
  predictions.set(prediction.id, prediction);
  persist();
}

export function getPrediction(id: string): PredictionResult | undefined {
  return predictions.get(id);
}

// 테스트/시연용으로 만든 예측 데이터를 정리할 때 사용 (실제 사용자 데이터는 이 함수로 지우지 않을 것).
export function deletePredictionsByUser(userId: string): number {
  let removed = 0;
  for (const [id, p] of predictions) {
    if (p.userId === userId) {
      predictions.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) persist();
  return removed;
}

// 데모 시드 버튼을 여러 번 눌러도 카드가 계속 쌓이지 않도록, 이전에 만든 데모 데이터만 지운다
// (실제 제출한 예측은 id가 "demo-"로 시작하지 않으므로 건드리지 않음).
export function deleteDemoPredictions(userId: string): number {
  const prefix = `demo-${userId}-`;
  let removed = 0;
  for (const [id, p] of predictions) {
    if (id.startsWith(prefix)) {
      predictions.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) persist();
  return removed;
}

export function listPredictions(): PredictionResult[] {
  return Array.from(predictions.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

export function updatePrediction(
  id: string,
  patch: Partial<PredictionResult>
): PredictionResult | undefined {
  const existing = predictions.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  predictions.set(id, updated);
  persist();
  return updated;
}
