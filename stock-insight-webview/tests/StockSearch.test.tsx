import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StockSearch from "../src/pages/StockSearch";
import * as client from "../src/api/client";

describe("StockSearch", () => {
  beforeEach(() => {
    vi.spyOn(client, "getCategories").mockResolvedValue([
      { id: 278, label: "반도체" },
      { id: 273, label: "자동차" },
    ]);
  });

  it("검색 결과를 목록으로 보여주고 클릭하면 onSelect가 호출된다", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    vi.spyOn(client, "searchStocks").mockResolvedValue([
      { code: "005930", name: "삼성전자", market: "KOSPI" },
    ]);

    render(<StockSearch onSelect={onSelect} />);

    await waitFor(() => expect(screen.getByText("삼성전자")).toBeInTheDocument());
    await user.click(screen.getByText("삼성전자"));

    expect(onSelect).toHaveBeenCalledWith({ code: "005930", name: "삼성전자", market: "KOSPI" });
  });

  it("검색 실패 시 에러 메시지를 보여준다", async () => {
    vi.spyOn(client, "searchStocks").mockRejectedValue(new Error("network down"));

    render(<StockSearch onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("종목을 불러오지 못했습니다.")).toBeInTheDocument()
    );
  });

  it("업종 칩을 누르면 해당 업종의 종목을 불러온다", async () => {
    const user = userEvent.setup();
    vi.spyOn(client, "searchStocks").mockResolvedValue([
      { code: "005930", name: "삼성전자", market: "KOSPI" },
    ]);
    vi.spyOn(client, "getCategoryStocks").mockResolvedValue([
      { code: "005930", name: "삼성전자", market: "KOSPI", marketValue: 15200000 },
    ]);

    render(<StockSearch onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("반도체")).toBeInTheDocument());
    await user.click(screen.getByText("반도체"));

    await waitFor(() => expect(screen.getByText(/시총 1520.0조원/)).toBeInTheDocument());
    expect(client.getCategoryStocks).toHaveBeenCalledWith(278);
  });
});
