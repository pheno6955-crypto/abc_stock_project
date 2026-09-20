import { useEffect, useState } from "react";
import type { StockCategory, StockSummary } from "../types";
import { getCategories, getCategoryStocks, searchStocks } from "../api/client";
import { getErrorMessage } from "../api/errors";

interface Props {
  onSelect: (stock: StockSummary) => void;
}

function formatMarketValue(v?: number): string | null {
  if (v == null) return null;
  const eok = v / 10000; // 억원 -> 조원
  return eok >= 1 ? `시총 ${eok.toFixed(1)}조원` : `시총 ${v.toLocaleString()}억원`;
}

function PriceBadge({ stock }: { stock: StockSummary }) {
  if (stock.closePrice == null) return null;
  const ratio = stock.fluctuationsRatio ?? 0;
  const direction = ratio > 0 ? "up" : ratio < 0 ? "down" : "flat";
  const color =
    direction === "up"
      ? "var(--color-up)"
      : direction === "down"
        ? "var(--color-down)"
        : "var(--color-text-secondary)";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "-";
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{stock.closePrice.toLocaleString()}원</div>
      {stock.fluctuationsRatio != null && (
        <div style={{ fontSize: 12, color }}>
          {arrow} {Math.abs(ratio).toFixed(2)}%
        </div>
      )}
    </div>
  );
}

export default function StockSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<StockCategory | null>(null);
  const [categoryStocks, setCategoryStocks] = useState<StockSummary[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    searchStocks(query)
      .then((r) => {
        setResults(r);
        setError(null);
      })
      .catch((err) => setError(getErrorMessage(err, "종목을 불러오지 못했습니다.")));
  }, [query]);

  const selectCategory = (category: StockCategory) => {
    setActiveCategory(category);
    setCategoryLoading(true);
    setCategoryError(null);
    getCategoryStocks(category.id)
      .then((stocks) => {
        setCategoryStocks(stocks);
        setCategoryLoading(false);
      })
      .catch((err) => {
        setCategoryError(getErrorMessage(err, "업종 종목을 불러오지 못했습니다."));
        setCategoryLoading(false);
      });
  };

  const showingSearch = query.trim().length > 0;
  const showingPopular = !showingSearch && activeCategory === null;
  const listToShow = showingSearch || showingPopular ? results : categoryStocks;

  return (
    <div>
      <input
        className="search-input"
        placeholder="종목명 또는 코드 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!showingSearch && categories.length > 0 && (
        <div className="category-chip-row">
          <button
            className={`category-chip ${activeCategory === null ? "active" : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            인기 종목
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`category-chip ${activeCategory?.id === c.id ? "active" : ""}`}
              onClick={() => selectCategory(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {!showingSearch && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "0 0 var(--space-sm) 0" }}>
          {activeCategory
            ? `${activeCategory.label} 업종 시가총액 상위 종목`
            : "지금 많이 찾는 종목이에요. 원하는 업종을 눌러보거나 검색해보세요."}
        </p>
      )}

      {error && (showingSearch || showingPopular) && (
        <p style={{ color: "var(--color-up)", fontSize: 13, marginBottom: "var(--space-md)" }}>
          {error}
        </p>
      )}
      {categoryError && !showingSearch && activeCategory && (
        <p style={{ color: "var(--color-up)", fontSize: 13, marginBottom: "var(--space-md)" }}>
          {categoryError}
        </p>
      )}
      {categoryLoading && !showingSearch && activeCategory && <p>불러오는 중...</p>}

      {(showingSearch || showingPopular || !categoryLoading) && (
        <div>
          {listToShow.map((stock) => (
            <div key={stock.code} className="stock-list-item" onClick={() => onSelect(stock)}>
              <div>
                <div>{stock.name}</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                  {formatMarketValue(stock.marketValue) ?? `${stock.market} · ${stock.code}`}
                </div>
              </div>
              <PriceBadge stock={stock} />
            </div>
          ))}
        </div>
      )}

      <p className="disclaimer">
        본 서비스는 AI가 생성한 참고용 정보와 비투자성 예측 콘텐츠를 제공하며,
        투자 자문이나 매매 권유가 아닙니다. 투자 결정은 본인 판단과 책임 하에 이루어져야 합니다.
      </p>
    </div>
  );
}
