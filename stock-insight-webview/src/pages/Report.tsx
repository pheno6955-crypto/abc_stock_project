import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Lightbulb, Sparkles, Target, TrendingUp } from "lucide-react";
import type { StockReport, StockSummary } from "../types";
import { getStockReport, getFactorAnalysis } from "../api/client";
import { getErrorMessage } from "../api/errors";
import ReportChat from "../components/ReportChat";
import Skeleton from "../components/Skeleton";
import { relativeTime } from "../utils/time";

interface Props {
  stock: StockSummary;
  onNext: () => void;
}

export default function Report({ stock, onNext }: Props) {
  const [report, setReport] = useState<StockReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedCodeRef = useRef<string | null>(null);

  const load = useCallback(() => {
    loadedCodeRef.current = stock.code;
    setError(null);
    getStockReport(stock.code)
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err)));
    // 사용자가 리포트를 읽는 동안 다음 화면(영향요인 분석)도 미리 백그라운드에서 준비해둔다.
    // 실패해도 여기선 신경 쓰지 않음 — 실제 표시/에러 처리는 그 화면에 진입했을 때 다시 함.
    getFactorAnalysis(stock.code).catch(() => {});
  }, [stock.code]);

  useEffect(() => {
    // 이미 로드된 종목이면 스킵
    if (loadedCodeRef.current === stock.code) return;
    load();
  }, [stock.code, load]);

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

  if (!report) {
    return (
      <div>
        <div className="ai-loading-status">
          <Bot size={16} />
          <span>AI가 뉴스를 읽고 리포트를 정리하고 있어요</span>
          <span className="ai-loading-dots">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </span>
        </div>
        <Skeleton width="40%" height={20} />
        <div className="card" style={{ marginTop: "var(--space-md)" }}>
          <Skeleton width="30%" height={16} />
          <div style={{ marginTop: "var(--space-md)" }}>
            <div className="skeleton-row">
              <Skeleton width={24} height={24} />
              <Skeleton width="90%" />
            </div>
            <div className="skeleton-row">
              <Skeleton width={24} height={24} />
              <Skeleton width="75%" />
            </div>
            <div className="skeleton-row">
              <Skeleton width={24} height={24} />
              <Skeleton width="60%" />
            </div>
          </div>
        </div>
        <div className="card">
          <Skeleton width="25%" height={16} />
          <div style={{ marginTop: "var(--space-md)" }}>
            <div style={{ marginBottom: "var(--space-xs)" }}>
              <Skeleton width="100%" height={38} />
            </div>
            <div style={{ marginBottom: "var(--space-xs)" }}>
              <Skeleton width="100%" height={38} />
            </div>
            <Skeleton width="100%" height={38} />
          </div>
        </div>
      </div>
    );
  }

  console.log("[Report] Summary text:", report.summary);
  const sentences = report.summary
    .split(/[.。!?]+/)
    .filter(s => s.trim().length > 0);
  console.log("[Report] Split sentences:", sentences);

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{stock.name}</h2>
      <div className="card summary-card">
        <h2 className="card-title">
          <Bot size={18} /> AI 요약
        </h2>
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
        <h2 className="card-title">
          <Target size={18} /> 핵심 이슈
        </h2>
        <div className="key-issues-list">
          {report.sources.map((issue) => (
            <a
              key={issue.url}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="key-issue-row"
              title={issue.title}
            >
              <span className="key-issue-row-title">{issue.title}</span>
              <span className="key-issue-row-time">{relativeTime(issue.publishedAt)}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="card investment-points-card">
        <h2 className="card-title">
          <Lightbulb size={18} /> 투자 포인트
        </h2>
        <div className="investment-points-grid">
          {report.investmentPoints.map((point, idx) => (
            <div key={point} className="investment-point-item">
              <span className="point-icon">
                {idx === 0 ? <TrendingUp size={18} /> : <Sparkles size={18} />}
              </span>
              <p className="point-text">{point}</p>
            </div>
          ))}
        </div>
      </div>
      <ReportChat code={stock.code} stockName={stock.name} />

      <button className="primary-button" onClick={onNext}>
        주가 영향요인 분석 보기
      </button>
    </div>
  );
}
