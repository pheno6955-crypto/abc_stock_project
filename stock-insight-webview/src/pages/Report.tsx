import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Bot, Lightbulb, MessageCircle, Scale, Sparkles, Target, TrendingUp } from "lucide-react";
import type { StockReport, StockSummary } from "../types";
import { getStockReport } from "../api/client";
import { getErrorMessage } from "../api/errors";
import Accordion from "../components/Accordion";
import ReportChat from "../components/ReportChat";
import Skeleton from "../components/Skeleton";
import FactorAnalysis from "./FactorAnalysis";
import InvestmentMetrics from "./InvestmentMetrics";
import { relativeTime } from "../utils/time";
import { displayStockName } from "../utils/stockName";

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
    setReport(null);
    // "주가 영향요인 분석" 메뉴(FactorAnalysis)가 이제 항상 함께 렌더링되어 자기 데이터를
    // 직접 불러오므로, 예전에 여기서 하던 별도 프리페치 호출은 중복이라 없앴다
    // (같은 요청을 두 번 보내던 걸 한 번으로 줄임 — 백엔드 캐시로 AI는 어차피 1번만 호출됐지만
    // 프론트→백엔드 왕복 자체는 불필요하게 2번이었음).
    getStockReport(stock.code)
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err)));
  }, [stock.code]);

  useEffect(() => {
    // 이미 로드된 종목이면 스킵
    if (loadedCodeRef.current === stock.code) return;
    load();
  }, [stock.code, load]);

  // "AI 분석"/"핵심 이슈"/"투자 포인트" 메뉴만 report 데이터가 필요하다. 이 셋의 로딩/에러 상태를
  // 메뉴(아코디언) 안쪽에서만 보여주고, 그 외 메뉴(영향요인 분석/투자 지표/챗봇)는 자기 데이터를
  // 따로 불러오므로 report와 무관하게 항상 그대로 있게 한다.
  // → 예전에는 report가 없으면 화면 전체를 다른 레이아웃(스켈레톤)으로 통째로 바꿔치기했는데,
  //   그러다 report만 먼저 도착하면 아코디언 틀이 갑자기 나타나면서 그 안의 "영향요인 분석" 로딩
  //   문구 위치가 화면에서 훌쩍 아래로 밀려 보이는 문제가 있었다 (사용자 리포트로 확인).
  const renderReportSection = (content: (r: StockReport) => React.ReactNode) => {
    if (error) {
      return (
        <div>
          <p style={{ color: "var(--color-up)" }}>{error}</p>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {error.includes("404") ? "존재하지 않는 종목이에요" : "AI 리포트를 만들 수 없어요"}
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
          <Skeleton width="100%" height={56} />
        </div>
      );
    }
    return content(report);
  };

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{displayStockName(stock.name, stock.code)}</h2>

      {/* 메뉴를 눌러 상세 내용을 펼쳐 보는 구조 (화면 길이 최소화). 주가 영향요인 분석만 기본으로 펼쳐 둔다.
          각 메뉴는 자기 데이터를 독립적으로 불러오고, 로딩/에러 상태도 그 메뉴 안에서만 보여준다. */}
      <Accordion icon={<Scale size={18} />} title="주가 영향요인 분석" defaultOpen>
        <FactorAnalysis stock={stock} />
      </Accordion>

      <Accordion icon={<BarChart3 size={18} />} title="투자 지표">
        <InvestmentMetrics stock={stock} />
      </Accordion>

      <Accordion icon={<Bot size={18} />} title="AI 분석">
        {renderReportSection((r) => {
          const summarySentences = r.summary
            .split(/(?<=[가-힣다했며])[.。!?]+\s+(?=[가-힣])/)
            .filter((s) => s.trim().length > 5)
            .slice(0, 3);
          return (
            <div className="summary-items">
              {summarySentences.map((sentence, idx) => {
                const trimmed = sentence.trim();
                const withPeriod = /[.!?]$/.test(trimmed) ? trimmed : trimmed + ".";
                return (
                  <div key={idx} className="summary-item">
                    <span className="summary-number">{idx + 1}</span>
                    <p className="summary-text">{withPeriod}</p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Accordion>

      <Accordion icon={<Target size={18} />} title="핵심 이슈">
        {renderReportSection((r) =>
          r.sources.length > 0 ? (
            <div className="key-issues-list">
              {r.sources.map((issue) => (
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
          ) : (
            <p className="empty-state-desc">이 종목과 관련된 최신 뉴스를 찾지 못했어요.</p>
          )
        )}
      </Accordion>

      <Accordion icon={<Lightbulb size={18} />} title="투자 포인트">
        {renderReportSection((r) =>
          r.investmentPoints.length > 0 ? (
            <div className="investment-points-grid">
              {r.investmentPoints.map((point, idx) => (
                <div key={point} className="investment-point-item">
                  <span className="point-icon">
                    {idx === 0 ? <TrendingUp size={18} /> : <Sparkles size={18} />}
                  </span>
                  <p className="point-text">{point}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state-desc">아직 정리된 투자 포인트가 없어요.</p>
          )
        )}
      </Accordion>

      <Accordion icon={<MessageCircle size={18} />} title="챗봇에게 물어보기">
        <ReportChat code={stock.code} />
      </Accordion>

      <button className="primary-button" onClick={onNext}>
        올리? 내리? 내일의 방향예측!
      </button>
    </div>
  );
}
