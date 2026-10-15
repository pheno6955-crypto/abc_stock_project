import fs from "node:fs";
import path from "node:path";
import type { PredictionResult } from "../types.js";
import { dbEnabled, enqueueWrite, query } from "./db.js";

// 메모리 Map을 읽기 기준으로 쓰고, 변경은 저장소에 반영한다.
// DATABASE_URL이 있으면 Postgres(Neon 등), 없으면 JSON 파일(로컬 개발용)에 저장한다.
const isTest = process.env.NODE_ENV === "test";
const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "predictions.json");

function loadFromDisk(): [string, PredictionResult][] {
  if (isTest || dbEnabled || !fs.existsSync(dataFile)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as PredictionResult[];
    return raw.map((p) => [p.id, p]);
  } catch {
    return [];
  }
}

const predictions = new Map<string, PredictionResult>(loadFromDisk());

// 서버 시작 시 DB에 저장된 예측을 메모리로 불러온다. (DB를 쓰지 않을 때는 아무 일도 하지 않음)
export async function hydratePredictions(): Promise<void> {
  if (!dbEnabled) return;
  const { rows } = await query<{ data: PredictionResult }>("SELECT data FROM predictions");
  for (const row of rows) predictions.set(row.data.id, row.data);
  console.log(`[db] loaded ${rows.length} predictions`);
}

function persistFile(): void {
  if (isTest || dbEnabled) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(Array.from(predictions.values()), null, 2));
}

function persistUpsert(p: PredictionResult): void {
  if (dbEnabled) {
    enqueueWrite("prediction upsert", () =>
      query(
        "INSERT INTO predictions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [p.id, JSON.stringify(p)]
      )
    );
  } else {
    persistFile();
  }
}

function persistDelete(ids: string[]): void {
  if (ids.length === 0) return;
  if (dbEnabled) {
    enqueueWrite("prediction delete", () => query("DELETE FROM predictions WHERE id = ANY($1)", [ids]));
  } else {
    persistFile();
  }
}

export function savePrediction(prediction: PredictionResult): void {
  predictions.set(prediction.id, prediction);
  persistUpsert(prediction);
}

export function getPrediction(id: string): PredictionResult | undefined {
  return predictions.get(id);
}

function deleteWhere(match: (id: string, p: PredictionResult) => boolean): number {
  const removedIds: string[] = [];
  for (const [id, p] of predictions) {
    if (match(id, p)) {
      predictions.delete(id);
      removedIds.push(id);
    }
  }
  persistDelete(removedIds);
  return removedIds.length;
}

// 테스트/시연용으로 만든 예측 데이터를 정리할 때 사용 (실제 사용자 데이터는 이 함수로 지우지 않을 것).
export function deletePredictionsByUser(userId: string): number {
  return deleteWhere((_id, p) => p.userId === userId);
}

// 데모 시드 버튼을 여러 번 눌러도 카드가 계속 쌓이지 않도록, 이전에 만든 데모 데이터만 지운다
// (실제 제출한 예측은 id가 "demo-"로 시작하지 않으므로 건드리지 않음).
export function deleteDemoPredictions(userId: string): number {
  const prefix = `demo-${userId}-`;
  return deleteWhere((id) => id.startsWith(prefix));
}

// 랭킹 샘플 데이터처럼 id 접두사로 구분되는 데이터를 한 번에 지운다.
export function deletePredictionsByIdPrefix(prefix: string): number {
  return deleteWhere((id) => id.startsWith(prefix));
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
  persistUpsert(updated);
  return updated;
}
