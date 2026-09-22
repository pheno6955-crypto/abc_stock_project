import Anthropic from "@anthropic-ai/sdk";
import type { FactorAnalysis, StockReport } from "../types.js";
import { getStockNews, getStockPrice } from "./naverFinance.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const hasRealKey = !!apiKey && !apiKey.includes("xxxx");
const client = hasRealKey ? new Anthropic({ apiKey }) : null;

console.log("[aiReport] API Key loaded:", hasRealKey ? "✓" : "✗");
if (!hasRealKey) console.log("[aiReport] Reason:", apiKey ? "Contains 'xxxx'" : "Not set");

function buildReportPrompt(
  stockName: string,
  news: { title: string; body: string }[],
  priceChangePct: number
): string {
  const articles = news
    .map((n, i) => `[기사 ${i + 1}] ${n.title}\n${n.body}`)
    .join("\n\n");
  return `당신은 금융 콘텐츠 작성자입니다. 아래는 "${stockName}"에 대한 최근 실제 뉴스 기사와 전일 대비 등락률입니다.
이 자료에 근거해서만 참고용 종목 리포트를 아래 JSON 스키마로만 응답하세요. 근거 없는 내용을 지어내지 마세요.
설명 문장 없이 JSON만 출력하세요.

전일 대비 등락률: ${priceChangePct}%

${articles || "(관련 뉴스 없음)"}

{
  "summary": "위 뉴스에 근거한 2~3문장 요약",
  "keyIssues": ["뉴스에서 도출한 핵심 이슈 최대 5개"],
  "investmentPoints": ["뉴스에 근거한 투자 참고 포인트 최대 2개"]
}`;
}

function buildFactorPrompt(stockName: string, priceChangePct: number): string {
  return `"${stockName}"의 전일 대비 등락률은 ${priceChangePct}%입니다.
이 종목의 주가에 영향을 줄 수 있는 일반적인 상승/하락 요인을 아래 JSON 스키마로만 응답하세요.
설명 문장 없이 JSON만 출력하세요.

{
  "bullishFactors": [{"label": "요인명", "weight": 0.0~1.0, "description": "설명"}],
  "bearishFactors": [{"label": "요인명", "weight": 0.0~1.0, "description": "설명"}]
}`;
}

async function askClaude(prompt: string): Promise<unknown> {
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");
  const message = await client.messages.create(
    {
      model: "claude-sonnet-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: 15000 }
  );
  const text = message.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("No text response from model");

  let jsonStr = text.text.trim();
  // 마크다운 코드 블록 제거 (```json ... ```)
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr);
}

async function safeGetNews(code: string): Promise<{ title: string; body: string; url: string; publishedAt: string }[]> {
  try {
    return await getStockNews(code);
  } catch (err) {
    console.warn(`[aiReport] news fetch failed for ${code}:`, (err as Error).message);
    return [];
  }
}

async function safeGetPriceChange(code: string): Promise<number> {
  try {
    const price = await getStockPrice(code);
    return price.fluctuationsRatio;
  } catch (err) {
    console.warn(`[aiReport] price fetch failed for ${code}:`, (err as Error).message);
    return 0;
  }
}

function extractiveReport(stockName: string, code: string, news: { title: string; body: string; url: string; publishedAt: string }[]): StockReport {
  const summaryText = news.length > 0
    ? news.slice(0, 3)
        .map(n => {
          const text = n.body.replace(/\n/g, ' ').trim();
          // 마침표 뒤에 공백이 있는 경우만 문장 끝으로 인식 (1.21% 같은 숫자는 제외)
          const firstSentence = text.match(/^.*?[.!?]\s/);
          if (firstSentence) return firstSentence[0].trim();
          // 마침표가 없으면 첫 번째 느낌표/물음표 찾기
          const altSentence = text.match(/^.*?[!?]/);
          return altSentence ? altSentence[0].trim() : text.substring(0, 150).trim() + '.';
        })
        .join(' ')
    : `${stockName}에 대한 최근 뉴스를 가져오지 못했습니다.`;

  return {
    code,
    generatedAt: new Date().toISOString(),
    summary: summaryText,
    keyIssues: news.slice(0, 5).map((n) => ({ title: n.title, url: n.url })),
    investmentPoints: [],
    sources: news.map((n) => ({ title: n.title, url: n.url, publishedAt: n.publishedAt })),
  };
}

function extractiveFactors(code: string, priceChangePct: number): FactorAnalysis {
  // 가격 등락률 자체를 "요인"으로 포장하는 건 순환논리이므로(오른 이유가 "올라서"가 됨),
  // AI 미설정 시에는 요인 목록을 억지로 만들지 않고 그 사실을 note로, 등락률은 별도 필드로 안내한다.
  return {
    code,
    bullishFactors: [],
    bearishFactors: [],
    note: "AI가 설정되어 있지 않아 상세 영향요인 분석은 제공할 수 없습니다.",
    priceChangePct,
  };
}

export async function generateReport(code: string, stockName: string): Promise<StockReport> {
  console.log(`[aiReport] generateReport called for ${code} (${stockName})`);
  const [news, priceChangePct] = await Promise.all([safeGetNews(code), safeGetPriceChange(code)]);
  console.log(`[aiReport] Fetched ${news.length} news articles, price change: ${priceChangePct}%`);

  if (!client) {
    console.log(`[aiReport] No client, using extractive report`);
    return extractiveReport(stockName, code, news);
  }

  try {
    console.log(`[aiReport] Calling Claude API...`);
    const parsed = (await askClaude(buildReportPrompt(stockName, news, priceChangePct))) as {
      summary: string;
      keyIssues: string[];
      investmentPoints: string[];
    };
    console.log(`[aiReport] Claude API success for ${code}`);
    return {
      code,
      generatedAt: new Date().toISOString(),
      summary: parsed.summary,
      keyIssues: news.slice(0, 5).map((n) => ({ title: n.title, url: n.url })),
      investmentPoints: parsed.investmentPoints,
      sources: news.map((n) => ({ title: n.title, url: n.url, publishedAt: n.publishedAt })),
    };
  } catch (err) {
    console.warn(`[aiReport] falling back to extractive report for ${code}:`, (err as Error).message);
    return extractiveReport(stockName, code, news);
  }
}

export async function generateFactorAnalysis(code: string, stockName: string): Promise<FactorAnalysis> {
  const priceChangePct = await safeGetPriceChange(code);

  if (!client) return extractiveFactors(code, priceChangePct);

  try {
    const parsed = (await askClaude(buildFactorPrompt(stockName, priceChangePct))) as Omit<
      FactorAnalysis,
      "code"
    >;
    return { code, ...parsed };
  } catch (err) {
    console.warn(`[aiReport] falling back to extractive factors for ${code}:`, (err as Error).message);
    return extractiveFactors(code, priceChangePct);
  }
}
