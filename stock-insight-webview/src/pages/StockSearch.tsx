import { Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StockCategory, StockSummary } from "../types";
import { getCategories, getCategoryStocks, getRecentSearchPrices, searchStocks } from "../api/client";
import { getErrorMessage } from "../api/errors";
import { displayStockName } from "../utils/stockName";
import { addRecentSearch, clearRecentSearches, getRecentSearches } from "../utils/recentSearches";

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

  // 최근 검색: 이 기기에 저장해둔 종목 목록(가격 제외)에, 보여줄 때마다 최신 가격을 다시 붙인다.
  const [showingRecent, setShowingRecent] = useState(false);
  const [recentStocks, setRecentStocks] = useState<StockSummary[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [hasRecentSaved, setHasRecentSaved] = useState(() => getRecentSearches().length > 0);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const openRecent = () => {
    setActiveCategory(null);
    setShowingRecent(true);
    const saved = getRecentSearches();
    if (saved.length === 0) {
      setRecentStocks([]);
      return;
    }
    setRecentLoading(true);
    setRecentError(null);
    getRecentSearchPrices(saved)
      .then((stocks) => {
        setRecentStocks(stocks);
        setRecentLoading(false);
      })
      .catch((err) => {
        setRecentError(getErrorMessage(err, "최근 검색 종목을 불러오지 못했습니다."));
        setRecentLoading(false);
      });
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentStocks([]);
    setHasRecentSaved(false);
  };

  // 검색어를 빠르게 입력/삭제하면 요청들이 보낸 순서와 다르게 응답이 돌아올 수 있다.
  // 오래된 요청의 응답이 늦게 도착해 최신 검색어(query) 결과를 덮어쓰지 않도록,
  // 응답이 올 때 "이 응답을 요청한 시점의 검색어"가 여전히 최신인지 확인한다.
  const latestQueryRef = useRef(query);
  latestQueryRef.current = query;

  useEffect(() => {
    const requestedQuery = query;
    searchStocks(requestedQuery)
      .then((r) => {
        if (latestQueryRef.current !== requestedQuery) return; // 그 사이 검색어가 바뀜 -> 폐기
        setResults(r);
        setError(null);
      })
      .catch((err) => {
        if (latestQueryRef.current !== requestedQuery) return;
        setError(getErrorMessage(err, "종목을 불러오지 못했습니다."));
      });
  }, [query]);

  const selectCategory = (category: StockCategory) => {
    setShowingRecent(false);
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

  const handleSelect = (stock: StockSummary) => {
    setHasRecentSaved(true);
    addRecentSearch(stock);
    onSelect(stock);
  };

  const showingSearch = query.trim().length > 0;
  const showingPopular = !showingSearch && !showingRecent && activeCategory === null;
  const listToShow = showingSearch
    ? results
    : showingRecent
      ? recentStocks
      : showingPopular
        ? results
        : categoryStocks;

  return (
    <div>
      <input
        className="search-input"
        placeholder="종목명 또는 코드 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!showingSearch && categories.length > 0 && (
        <div className="category-chip-scroll">
          <div className="category-chip-row">
            <button
              className={`category-chip ${!showingRecent && activeCategory === null ? "active" : ""}`}
              onClick={() => {
                setShowingRecent(false);
                setActiveCategory(null);
              }}
            >
              인기 종목
            </button>
            <button
              className={`category-chip ${showingRecent ? "active" : ""}`}
              onClick={openRecent}
            >
              <Clock size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              최근 검색
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
        </div>
      )}

      {!showingSearch && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-sm)",
          }}
        >
          <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
            {showingRecent
              ? "최근에 살펴본 종목이에요."
              : activeCategory
                ? activeCategory.label === "ETF"
                  ? "시가총액 상위 ETF"
                  : `${activeCategory.label} 업종 시가총액 상위 종목`
                : "지금 많이 찾는 종목이에요. 원하는 업종을 눌러보거나 검색해보세요."}
          </p>
          {showingRecent && hasRecentSaved && (
            <button
              className="clear-recent-button"
              onClick={handleClearRecent}
              aria-label="최근 검색 기록 전체 삭제"
            >
              <X size={12} /> 전체 삭제
            </button>
          )}
        </div>
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
      {recentError && showingRecent && (
        <p style={{ color: "var(--color-up)", fontSize: 13, marginBottom: "var(--space-md)" }}>
          {recentError}
        </p>
      )}
      {categoryLoading && !showingSearch && activeCategory && <p>불러오는 중...</p>}
      {recentLoading && showingRecent && <p>불러오는 중...</p>}

      {showingRecent && !recentLoading && !recentError && recentStocks.length === 0 && (
        <div className="card empty-state">
          <span className="empty-state-icon">
            <Clock size={32} />
          </span>
          <p className="empty-state-title">아직 최근 검색한 종목이 없어요</p>
          <p className="empty-state-desc">종목을 살펴보면 여기에 기록돼요.</p>
        </div>
      )}

      {(showingSearch || showingPopular || (showingRecent && !recentLoading) || (!showingRecent && !categoryLoading)) && (
        <div>
          {listToShow.map((stock) => (
            <div key={stock.code} className="stock-list-item" onClick={() => handleSelect(stock)}>
              <div>
                <div>{displayStockName(stock.name, stock.code)}</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                  {formatMarketValue(stock.marketValue) ?? `${stock.market} · ${stock.code}`}
                </div>
              </div>
              <PriceBadge stock={stock} />
            </div>
          ))}
        </div>
      )}

      {/* 아주 좁은 화면(약 340px 이하)에서는 전체 문구가 두 줄로 넘어가, 짧은 버전으로 바꿔치기한다. */}
      <p className="disclaimer disclaimer-full">
        AI 참고용 콘텐츠로, 투자 자문·권유가 아니며 책임은 본인에게 있어요.
      </p>
      <p className="disclaimer disclaimer-short">AI 참고용 콘텐츠이며 투자 자문·권유가 아니에요.</p>
    </div>
  );
}
