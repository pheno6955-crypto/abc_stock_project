import { Landmark } from "lucide-react";
import type { PredictionResult } from "../types";
import { nhBridge } from "../bridge/nhBridge";

// 실제 상품 캠페인 페이지가 정해지기 전까지의 임시 연결 대상 (농협은행 공식 인터넷뱅킹 홈).
// 이후 실제 펀드/ETF 상품 URL이 정해지면 이 상수만 교체하면 됨.
const NH_FALLBACK_URL = "https://banking.nonghyup.com";

interface Props {
  result: PredictionResult;
  onDone: () => void;
}

export default function Result({ result, onDone }: Props) {
  const handleOpenProducts = () => {
    // 네이티브 앱(NHBridge)이 있으면 앱 내 화면으로, 없으면(웹 환경) 농협은행 공식 사이트를 새 탭으로 연다.
    const opened = nhBridge.openScreen("fund-catalog");
    if (!opened) {
      window.open(NH_FALLBACK_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div>
      <div className="card" style={{ textAlign: "center" }}>
        <h2>예측이 제출되었습니다</h2>
        <p>
          {result.stockName} 내일 방향: <strong>{result.direction === "UP" ? "상승 ▲" : "하락 ▼"}</strong>
        </p>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          제출 시점 기준가 {result.referencePrice.toLocaleString()}원
        </p>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          결과는 다음 거래일 종가 확정 후 반영되며, 적중 시 리워드가 자동 지급됩니다.
        </p>
        <span className="reward-badge">적중 시 올원캔디 지급 예정</span>
      </div>

      <div className="card cross-sell-card">
        <Landmark size={20} />
        <div>
          <p className="cross-sell-title">투자에 관심이 생기셨나요?</p>
          <p className="cross-sell-desc">
            NH의 펀드·ETF 상품을 살펴보거나, 자산관리 상담을 받아볼 수 있어요. (이 종목·예측
            결과와는 무관한 일반 안내예요)
          </p>
          <button className="secondary-button" onClick={handleOpenProducts}>
            NH 상품 살펴보기
          </button>
        </div>
      </div>

      <button className="primary-button" onClick={onDone}>
        종목 검색으로 돌아가기
      </button>
    </div>
  );
}
