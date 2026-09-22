import { useEffect, useRef, useState } from "react";
import type { StockReport, StockSummary } from "../types";
import { getStockReport } from "../api/client";
import { getErrorMessage } from "../api/errors";

interface Props {
  stock: StockSummary;
  onNext: () => void;
}

export default function Report({ stock, onNext }: Props) {
  const [report, setReport] = useState<StockReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    // 이미 로드된 종목이면 스킵
    if (loadedCodeRef.current === stock.code) return;

    loadedCodeRef.current = stock.code;
    setError(null);
    getStockReport(stock.code)
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err)));
  }, [stock.code]);

  if (error) {
    console.error("[Report] Error:", error);
    return (
      <div className="card">
        <p style={{ color: "var(--color-up)" }}>{error}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {error.includes("404") ? "존재하지 않는 종목입니다" : "AI 리포트를 생성할 수 없습니다"}
        </p>
        <button className="primary-button" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!report) return <p>AI 리포트를 생성하는 중입니다...</p>;

  console.log("[Report] Summary text:", report.summary);
  const sentences = report.summary
    .split(/[.。!?]+/)
    .filter(s => s.trim().length > 0);
  console.log("[Report] Split sentences:", sentences);

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{stock.name}</h2>
      <div className="card summary-card">
        <h2>🤖 AI 요약</h2>
        <div className="summary-items">
          {report.summary
            .split(/(?<=[가-힣다했며])[.。!?]+\s+(?=[가-힣])/)
            .filter(s => s.trim().length > 5)
            .slice(0, 3)
            .map((sentence, idx) => {
              const trimmed = sentence.trim();
              const withPeriod = /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.';
              return (
                <div key={idx} className="summary-item">
                  <span className="summary-number">{idx + 1}</span>
                  <p className="summary-text">{withPeriod}</p>
                </div>
              );
            })}
        </div>
      </div>
      <div className="card key-issues-card">
        <h2>🎯 핵심 이슈</h2>
        <div className="key-issues-grid">
          {report.keyIssues.map((issue) => (
            <a
              key={issue.url}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="key-issue-tag"
              title={issue.title}
            >
              {issue.title}
            </a>
          ))}
        </div>
      </div>
      <div className="card investment-points-card">
        <h2>💡 투자 포인트</h2>
        <div className="investment-points-grid">
          {report.investmentPoints.map((point, idx) => (
            <div key={point} className="investment-point-item">
              <span className="point-icon">{idx === 0 ? "📈" : "⭐"}</span>
              <p className="point-text">{point}</p>
            </div>
          ))}
        </div>
      </div>
      <button className="primary-button" onClick={onNext}>
        주가 영향요인 분석 보기
      </button>
    </div>
  );
}
