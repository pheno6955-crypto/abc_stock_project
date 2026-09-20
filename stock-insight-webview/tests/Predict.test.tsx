import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Predict from "../src/pages/Predict";
import * as client from "../src/api/client";
import type { StockSummary } from "../src/types";

const stock: StockSummary = { code: "005930", name: "삼성전자", market: "KOSPI" };

describe("Predict", () => {
  it("submit 버튼은 방향을 선택하기 전까지 비활성화된다", () => {
    render(<Predict stock={stock} onSubmitted={vi.fn()} />);
    expect(screen.getByText("예측 제출")).toBeDisabled();
  });

  it("방향 선택 후 제출하면 submitPrediction을 호출하고 onSubmitted가 실행된다", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    const submitSpy = vi.spyOn(client, "submitPrediction").mockResolvedValue({
      id: "pred-1",
      code: "005930",
      stockName: "삼성전자",
      direction: "UP",
      referencePrice: 260000,
      actualDirection: null,
      isCorrect: null,
      rewardClaimed: false,
      submittedAt: new Date().toISOString(),
      resolvedAt: null,
    });

    render(<Predict stock={stock} onSubmitted={onSubmitted} />);

    await user.click(screen.getByText("상승 ▲"));
    await user.click(screen.getByText("예측 제출"));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(submitSpy).toHaveBeenCalledWith("005930", "삼성전자", "UP");
  });

  it("제출 실패 시 에러 메시지를 보여주고 onSubmitted는 호출하지 않는다", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    vi.spyOn(client, "submitPrediction").mockRejectedValue(new Error("network down"));

    render(<Predict stock={stock} onSubmitted={onSubmitted} />);

    await user.click(screen.getByText("하락 ▼"));
    await user.click(screen.getByText("예측 제출"));

    await waitFor(() =>
      expect(screen.getByText(/오류가 발생했습니다/)).toBeInTheDocument()
    );
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
