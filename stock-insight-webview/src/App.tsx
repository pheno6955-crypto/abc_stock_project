import { useLayoutEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import ollieMascot from "./assets/ollie-mascot.png";
import type { PredictionResult, StockSummary } from "./types";
import Home from "./pages/Home";
import StockSearch from "./pages/StockSearch";
import Report from "./pages/Report";
import Predict from "./pages/Predict";
import Result from "./pages/Result";
import MyHistory from "./pages/MyHistory";
import Rankings from "./pages/Rankings";
import "./App.css";

type Screen = "search" | "report" | "predict" | "result";
type Tab = "home" | "insight" | "history" | "rankings";

// 종목 인사이트 안의 화면 진행 순서. 뒤로가기는 이 순서를 한 칸씩 거슬러 올라간다.
const SCREEN_ORDER: Screen[] = ["search", "report", "predict", "result"];

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<Screen>("search");
  const [selectedStock, setSelectedStock] = useState<StockSummary | null>(null);
  const [lastResult, setLastResult] = useState<PredictionResult | null>(null);

  // 탭/화면이 바뀌면 이전 화면의 스크롤 위치가 남지 않도록 맨 위로 이동
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [tab, screen, selectedStock?.code]);

  const reset = () => {
    setSelectedStock(null);
    setLastResult(null);
    setScreen("search");
  };

  const goToInsight = () => {
    reset();
    setTab("insight");
  };

  // 종목 인사이트 화면 하나를 뒤로 이동 (검색 화면으로 돌아가면 선택된 종목도 비운다)
  const goBack = () => {
    const idx = SCREEN_ORDER.indexOf(screen);
    if (idx <= 0) return;
    const prevScreen = SCREEN_ORDER[idx - 1];
    if (prevScreen === "search") setSelectedStock(null);
    setScreen(prevScreen);
  };
  const canGoBack = tab === "insight" && screen !== "search";

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
      return <Report stock={selectedStock} onNext={() => setScreen("predict")} />;
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
    if (tab === "home") return <Home onStart={goToInsight} />;
    if (tab === "insight") return renderInsightFlow();
    if (tab === "rankings") return <Rankings />;
    return <MyHistory />;
  };

  // 앱 이름의 "올리"는 올리 포인트/올리 버튼과 같은 빨강, "내리"는 내리 포인트/내리 버튼과 같은
  // 파랑으로 맞춰서, 로고만 보고도 상승·하락 두 방향을 다루는 서비스라는 게 바로 보이게 한다.
  const title = (
    <>
      NH <span style={{ color: "var(--color-up)" }}>올리</span>
      <span style={{ color: "var(--color-down)" }}>내리</span>
    </>
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          {canGoBack && (
            <button className="header-back-button" onClick={goBack} aria-label="뒤로가기">
              <ChevronLeft size={22} />
            </button>
          )}
          <img src={ollieMascot} alt="" className="header-mascot" />
          <h1>{title}</h1>
        </div>
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
        <button className={tab === "rankings" ? "active" : ""} onClick={() => setTab("rankings")}>
          랭킹
        </button>
      </nav>
    </div>
  );
}
