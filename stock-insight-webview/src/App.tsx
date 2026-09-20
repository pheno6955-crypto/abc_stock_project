import { useState } from "react";
import type { PredictionResult, StockSummary } from "./types";
import Home from "./pages/Home";
import StockSearch from "./pages/StockSearch";
import Report from "./pages/Report";
import FactorAnalysis from "./pages/FactorAnalysis";
import Predict from "./pages/Predict";
import Result from "./pages/Result";
import MyHistory from "./pages/MyHistory";
import "./App.css";

type Screen = "search" | "report" | "factors" | "predict" | "result";
type Tab = "home" | "insight" | "history";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<Screen>("search");
  const [selectedStock, setSelectedStock] = useState<StockSummary | null>(null);
  const [lastResult, setLastResult] = useState<PredictionResult | null>(null);

  const reset = () => {
    setSelectedStock(null);
    setLastResult(null);
    setScreen("search");
  };

  const goToInsight = () => {
    reset();
    setTab("insight");
  };

  const renderInsightFlow = () => {
    if (!selectedStock) {
      return (
        <StockSearch
          onSelect={(stock) => {
            setSelectedStock(stock);
            setScreen("report");
          }}
        />
      );
    }
    if (screen === "report") {
      return <Report stock={selectedStock} onNext={() => setScreen("factors")} />;
    }
    if (screen === "factors") {
      return <FactorAnalysis stock={selectedStock} onNext={() => setScreen("predict")} />;
    }
    if (screen === "predict") {
      return (
        <Predict
          stock={selectedStock}
          onSubmitted={(result) => {
            setLastResult(result);
            setScreen("result");
          }}
        />
      );
    }
    if (screen === "result" && lastResult) {
      return <Result result={lastResult} onDone={reset} />;
    }
    return null;
  };

  const renderBody = () => {
    if (tab === "home") return <Home onStart={goToInsight} onViewHistory={() => setTab("history")} />;
    if (tab === "insight") return renderInsightFlow();
    return <MyHistory />;
  };

  const title = tab === "home" ? "AI 종목 인사이트" : "종목 인사이트";

  return (
    <div className="app">
      <header className="app-header">
        <h1>{title}</h1>
        {tab === "insight" && selectedStock && screen !== "search" && (
          <button
            style={{ border: "none", background: "none", color: "var(--color-text-secondary)" }}
            onClick={reset}
          >
            처음으로
          </button>
        )}
      </header>
      <div className="app-body">{renderBody()}</div>
      <nav className="bottom-nav">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          홈
        </button>
        <button className={tab === "insight" ? "active" : ""} onClick={goToInsight}>
          종목 인사이트
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          내 예측 이력
        </button>
      </nav>
    </div>
  );
}
