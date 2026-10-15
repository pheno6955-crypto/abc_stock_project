import pg from "pg";

// DATABASE_URL(Neon 등 Postgres)이 있을 때만 DB에 저장한다. 없거나 테스트일 때는 기존 JSON 파일 방식을 그대로 쓴다.
export const dbEnabled = Boolean(process.env.DATABASE_URL) && process.env.NODE_ENV !== "test";

let pool: pg.Pool | null = null;

// Neon이 기본으로 붙여주는 channel_binding 옵션은 pg 라이브러리와 맞지 않을 수 있어 빼고 연결한다 (sslmode=require로 암호화는 유지됨).
function connectionStringWithoutChannelBinding(): string {
  const url = new URL(process.env.DATABASE_URL as string);
  url.searchParams.delete("channel_binding");
  return url.toString();
}

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: connectionStringWithoutChannelBinding(), max: 3 });
    pool.on("error", (err) => console.error("[db] pool error:", err.message));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function initDb(): Promise<void> {
  if (!dbEnabled) return;
  await query("CREATE TABLE IF NOT EXISTS predictions (id TEXT PRIMARY KEY, data JSONB NOT NULL)");
  await query("CREATE TABLE IF NOT EXISTS streak_bonuses (milestone_key TEXT PRIMARY KEY)");
  console.log("[db] connected, tables ready");
}

// 같은 키에 대한 쓰기가 순서대로 반영되도록 한 줄로 세워서 실행한다 (실패해도 서비스는 계속 동작).
let writeChain: Promise<unknown> = Promise.resolve();
export function enqueueWrite(label: string, fn: () => Promise<unknown>): void {
  writeChain = writeChain.then(fn).catch((err) => console.error(`[db] ${label} failed:`, (err as Error).message));
}
