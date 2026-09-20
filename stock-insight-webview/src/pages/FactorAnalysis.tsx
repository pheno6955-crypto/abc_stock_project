import { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { FactorAnalysis as FactorAnalysisType, StockSummary } from "../types";
import { getFactorAnalysis } from "../api/client";
import { getErrorMessage } from "../api/errors";

interface Props {
  stock: StockSummary;
  onNext: () => void;
}

export default function FactorAnalysis({ stock, onNext }: Props) {
  const [data, setData] = useState<FactorAnalysisType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    getFactorAnalysis(stock.code)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }, [stock.code]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="card">
        <p>{error}</p>
        <button className="primary-button" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return <p>영향요인을 분석하는 중입니다...</p>;

  const hasFactors = data.bullishFactors.length > 0 || data.bearishFactors.length > 0;

  const chartData = [
    ...data.bullishFactors.map((f) => ({ name: f.label, weight: f.weight, type: "up" })),
    ...data.bearishFactors.map((f) => ({ name: f.label, weight: -f.weight, type: "down" })),
  ];
  const chartHeight = Math.max(chartData.length * 56, 100);

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{stock.name} 영향요인</h2>

      {!hasFactors && data.note && (
        <div className="card empty-state">
          <span className="empty-state-icon">🤖</span>
          <p className="empty-state-title">아직 AI 분석이 연결되지 않았어요</p>
          <p className="empty-state-desc">{data.note}</p>
          {data.priceChangePct != null && (
            <span
              className="empty-state-badge"
              style={{
                color:
                  data.priceChangePct > 0
                    ? "var(--color-up)"
                    : data.priceChangePct < 0
                      ? "var(--color-down)"
                      : "var(--color-text-secondary)",
              }}
            >
              {data.priceChangePct > 0 ? "▲" : data.priceChangePct < 0 ? "▼" : "-"}{" "}
              전일 대비 {Math.abs(data.priceChangePct).toFixed(2)}%
            </span>
          )}
        </div>
      )}

      {hasFactors && (
        <div className="card">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" domain={[-1, 1]} hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="weight" barSize={28}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.type === "up" ? "var(--color-up)" : "var(--color-down)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.bullishFactors.length > 0 && (
        <div className="card">
          <h2 style={{ color: "var(--color-up)" }}>상승 요인</h2>
          {data.bullishFactors.map((f) => (
            <p key={f.label}>
              <strong>{f.label}</strong> — {f.description}
            </p>
          ))}
        </div>
      )}

      {data.bearishFactors.length > 0 && (
        <div className="card">
          <h2 style={{ color: "var(--color-down)" }}>하락 요인</h2>
          {data.bearishFactors.map((f) => (
            <p key={f.label}>
              <strong>{f.label}</strong> — {f.description}
            </p>
          ))}
        </div>
      )}

      <button className="primary-button" onClick={onNext}>
        방향성 예측 참여하기
      </button>
    </div>
  );
}
