import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(() => {
    setError(null);
    setReport(null);
    getStockReport(stock.code)
      .then(setReport)
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

  if (!report) return <p>AI 리포트를 생성하는 중입니다...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20 }}>{stock.name}</h2>
      <div className="card">
        <h2>AI 요약</h2>
        <p>{report.summary}</p>
      </div>
      <div className="card">
        <h2>핵심 이슈</h2>
        <div className="tag-list">
          {report.keyIssues.map((issue) => (
            <span key={issue} className="tag">
              {issue}
            </span>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>투자 포인트</h2>
        <div className="tag-list">
          {report.investmentPoints.map((point) => (
            <span key={point} className="tag">
              {point}
            </span>
          ))}
        </div>
      </div>
      <button className="primary-button" onClick={onNext}>
        주가 영향요인 분석 보기
      </button>
    </div>
  );
}
