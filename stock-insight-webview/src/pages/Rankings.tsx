import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { RankingResponse } from "../types";
import { getRankings } from "../api/client";
import { getErrorMessage } from "../api/errors";

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// 로그인 전(guest-<uuid>) 사용자는 이름이 없어서, 그대로 보여주면 알아보기 힘든 무작위 문자열이 노출된다.
// 실제 이름/닉네임이 있는 경우(향후 NH 로그인 연동 시)만 그대로 보여주고, 그 외엔 "게스트"로 대체한다.
function displayName(userId: string, isMe: boolean): string {
  if (isMe) return "나";
  if (userId.startsWith("guest-")) return "게스트";
  return userId;
}

export default function Rankings() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [data, setData] = useState<RankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((p: "week" | "month") => {
    setError(null);
    setData(null);
    getRankings(p)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>예측왕 랭킹</h2>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 0 }}>
        기간 내 적중 횟수가 많은 순으로, 같으면 적중률이 높은 순으로 순위를 매겨요.
      </p>

      <div className="category-chip-row" style={{ marginBottom: "var(--space-md)" }}>
        <button
          className={`category-chip ${period === "week" ? "active" : ""}`}
          onClick={() => setPeriod("week")}
        >
          이번 주
        </button>
        <button
          className={`category-chip ${period === "month" ? "active" : ""}`}
          onClick={() => setPeriod("month")}
        >
          이번 달
        </button>
      </div>

      {error && (
        <div className="card">
          <p>{error}</p>
          <button className="primary-button" onClick={() => load(period)}>
            다시 시도
          </button>
        </div>
      )}

      {!error && !data && <p>랭킹을 불러오는 중입니다...</p>}

      {data && data.entries.length === 0 && (
        <div className="card empty-state">
          <span className="empty-state-icon">
            <Trophy size={32} />
          </span>
          <p className="empty-state-title">아직 이 기간에 확정된 예측이 없어요</p>
          <p className="empty-state-desc">예측을 제출하고 결과가 확정되면 랭킹에 반영돼요.</p>
        </div>
      )}

      {data && data.entries.length > 0 && (
        <div className="card ranking-list">
          {data.entries.map((e) => (
            <div key={e.rank} className={`ranking-row ${e.isMe ? "me" : ""}`}>
              <span className="ranking-rank">{RANK_MEDAL[e.rank] ?? `${e.rank}위`}</span>
              <span className="ranking-name">{displayName(e.userId, e.isMe)}</span>
              <span className="ranking-stats">
                {e.hits}승 {e.attempts - e.hits}패 · 적중률 {Math.round(e.accuracy * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {data && data.me && data.me.rank > data.entries.length && (
        <div className="card ranking-list">
          <div className="ranking-row me">
            <span className="ranking-rank">{data.me.rank}위</span>
            <span className="ranking-name">나</span>
            <span className="ranking-stats">
              {data.me.hits}승 {data.me.attempts - data.me.hits}패 · 적중률{" "}
              {Math.round(data.me.accuracy * 100)}%
            </span>
          </div>
        </div>
      )}

      {data && !data.me && data.entries.length > 0 && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center" }}>
          아직 이 기간에 확정된 내 예측이 없어요. 예측을 제출해보세요!
        </p>
      )}
    </div>
  );
}
