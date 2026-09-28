import { useCallback, useEffect, useState } from "react";
import { PiggyBank, Trophy } from "lucide-react";
import type { RankingResponse } from "../types";
import { getRankings } from "../api/client";
import { getErrorMessage } from "../api/errors";

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// 유명 축구선수 이름 목록. 로그인 전(guest-<uuid>) 사용자는 이름이 없어서 그대로 보여주면
// 알아보기 힘든 무작위 문자열이 노출되므로, 친숙한 이름으로 바꿔서 보여준다.
const PLAYER_NAMES = [
  "손흥민", "리오넬 메시", "크리스티아누 호날두", "킬리안 음바페", "엘링 홀란드",
  "네이마르 주니어", "카림 벤제마", "모하메드 살라", "케빈 데 브라이너", "루카 모드리치",
  "황희찬", "이강인", "해리 케인", "앙투안 그리즈만", "루이스 수아레스",
  "가레스 베일", "안드레스 이니에스타", "차비 에르난데스", "요한 크루이프", "지네딘 지단",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// 같은 게스트는 항상 같은 이름으로 보이도록 userId를 해시해 이름을 고정 배정한다.
// 같은 화면(명단) 안에서 이름이 겹치면 목록의 다음 이름으로 넘어가 중복을 피한다.
function assignNames(userIds: string[]): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const id of userIds) {
    if (!id.startsWith("guest-")) {
      result.set(id, id);
      continue;
    }
    const start = hashString(id) % PLAYER_NAMES.length;
    for (let i = 0; i < PLAYER_NAMES.length; i++) {
      const candidate = PLAYER_NAMES[(start + i) % PLAYER_NAMES.length];
      if (!used.has(candidate)) {
        used.add(candidate);
        result.set(id, candidate);
        break;
      }
    }
  }
  return result;
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

      <div className="card cross-sell-card ranking-benefit-card" style={{ marginBottom: "var(--space-md)" }}>
        <PiggyBank size={20} />
        <div>
          <p className="cross-sell-title">상위 랭커 혜택</p>
          <p className="cross-sell-desc">랭킹 상위권을 꾸준히 유지하면 예금·적금·대출 우대금리 혜택을 드려요.</p>
        </div>
      </div>

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

      {!error && !data && <p>랭킹을 불러오는 중이에요...</p>}

      {data && data.entries.length === 0 && (
        <div className="card empty-state">
          <span className="empty-state-icon">
            <Trophy size={32} />
          </span>
          <p className="empty-state-title">아직 이 기간에 확정된 예측이 없어요</p>
          <p className="empty-state-desc">예측을 제출하고 결과가 확정되면 랭킹에 반영돼요.</p>
        </div>
      )}

      {data && data.entries.length > 0 && (() => {
        const nameMap = assignNames(data.entries.filter((e) => !e.isMe).map((e) => e.userId));
        return (
          <div className="card ranking-list">
            {data.entries.map((e) => (
              <div key={e.rank} className={`ranking-row ${e.isMe ? "me" : ""}`}>
                <span className="ranking-rank">{RANK_MEDAL[e.rank] ?? `${e.rank}위`}</span>
                <span className="ranking-name">{e.isMe ? "나" : nameMap.get(e.userId)}</span>
                <span className="ranking-stats">
                  {e.hits}승 {e.attempts - e.hits}패 · 적중률 {Math.round(e.accuracy * 100)}%
                </span>
              </div>
            ))}
          </div>
        );
      })()}

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
