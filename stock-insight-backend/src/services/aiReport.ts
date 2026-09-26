import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, FactorAnalysis, StockReport } from "../types.js";
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

function buildFactorPrompt(
  stockName: string,
  news: { title: string; body: string }[],
  priceChangePct: number
): string {
  const articles = news
    .map((n, i) => `[기사 ${i + 1}] ${n.title}\n${n.body}`)
    .join("\n\n");
  return `"${stockName}"의 전일 대비 등락률은 ${priceChangePct}%입니다. 아래는 관련 최근 실제 뉴스 기사입니다.

${articles || "(관련 뉴스 없음)"}

위 뉴스에서 실제로 언급된 사실에 근거해 이 종목의 주가에 영향을 줄 수 있는 상승/하락 요인을 뽑아내세요.
뉴스에 없는 내용을 일반론으로 지어내지 말고, 뉴스 기사 자체가 부족하면 그 사실을 반영해 요인 개수를 줄이세요.
아래 JSON 스키마로만 응답하고, 설명 문장 없이 JSON만 출력하세요.

{
  "bullishFactors": [{"label": "요인명", "weight": 0.0~1.0, "description": "해당 뉴스에 근거한 설명"}],
  "bearishFactors": [{"label": "요인명", "weight": 0.0~1.0, "description": "해당 뉴스에 근거한 설명"}]
}`;
}

async function askClaude(prompt: string): Promise<unknown> {
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");
  const message = await client.messages.create(
    {
      model: "claude-sonnet-5",
      max_tokens: 4096,
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

const CHAT_HISTORY_LIMIT = 8;

// AI 미설정(mock) 상태에서도 답할 수 있는 기본 금융 용어 사전.
const GLOSSARY: { pattern: RegExp; term: string; definition: string }[] = [
  {
    pattern: /\bper\b|주가수익비율/i,
    term: "PER",
    definition:
      "주가를 주당순이익(EPS)으로 나눈 값이에요. 지금 주가가 회사가 버는 이익 대비 몇 배인지 보여주는 지표라서, 숫자가 낮을수록 이익 대비 저평가됐다고 해석하는 경우가 많아요.",
  },
  {
    pattern: /\bpbr\b|주가순자산비율/i,
    term: "PBR",
    definition:
      "주가를 주당순자산(회사가 가진 자산 - 부채)으로 나눈 값이에요. 1보다 낮으면 회사가 가진 순자산보다 주가가 싸게 거래되고 있다는 뜻이에요.",
  },
  {
    pattern: /\beps\b|주당순이익/i,
    term: "EPS",
    definition: "회사의 당기순이익을 전체 발행 주식 수로 나눈 값이에요. 주식 한 주가 벌어들인 이익이 얼마인지 보여줘요.",
  },
  {
    pattern: /\broe\b|자기자본이익률/i,
    term: "ROE",
    definition:
      "회사가 자기 자본(주주 돈)을 가지고 얼마나 효율적으로 이익을 냈는지 보여주는 비율이에요. 높을수록 자본을 효율적으로 굴려서 돈을 벌고 있다는 뜻이에요.",
  },
  {
    pattern: /영업이익/,
    term: "영업이익",
    definition: "회사가 본업(제품·서비스 판매)으로 벌어들인 이익이에요. 매출에서 원가와 판매·관리비를 뺀 금액이에요.",
  },
  {
    pattern: /순이익|당기순이익/,
    term: "순이익",
    definition: "영업이익에서 이자, 세금 등 모든 비용을 다 뺀 최종 이익이에요. 회사가 실제로 손에 쥔 돈이라고 보면 돼요.",
  },
  {
    pattern: /시가총액|시총/,
    term: "시가총액",
    definition: "현재 주가에 전체 발행 주식 수를 곱한 값이에요. 시장이 그 회사 전체 가치를 얼마로 평가하고 있는지 보여줘요.",
  },
  {
    pattern: /배당수익률|배당률/,
    term: "배당수익률",
    definition: "주가 대비 1년간 받는 배당금의 비율이에요. 예를 들어 주가 10만원에 배당금 3천원이면 배당수익률은 3%예요.",
  },
  {
    pattern: /코스피|코스닥.*(차이|뭐)|kospi|kosdaq/i,
    term: "코스피 vs 코스닥",
    definition:
      "코스피는 삼성전자 같은 대형·우량 기업 위주의 시장이고, 코스닥은 상대적으로 중소형·성장 기업 위주의 시장이에요. 상장 기준과 규모가 달라요.",
  },
  {
    pattern: /등락률/,
    term: "등락률",
    definition: "전날 종가 대비 오늘 주가가 몇 % 오르거나 내렸는지를 나타낸 값이에요.",
  },
];

function findGlossaryAnswer(question: string): string | null {
  const match = GLOSSARY.find((entry) => entry.pattern.test(question));
  return match ? `[${match.term}] ${match.definition}` : null;
}

const NO_AI_GUIDE_REPLY =
  "AI가 설정되어 있지 않아 자유로운 질문에는 답하기 어려워요. 다만 PER, PBR, EPS, ROE, 영업이익, 순이익, 시가총액, 배당수익률, 코스피/코스닥, 등락률 같은 기본 용어는 지금도 물어보실 수 있어요. (실제 서비스에서는 리포트 내용에 대해서도 자유롭게 물어보실 수 있어요)";

// 매수/매도 유도로 읽힐 수 있는 표현이 응답에 섞이면 안전한 안내 문구로 강제 대체한다.
// (프롬프트 가드레일과 별개로 두는 최후 방어선)
const INVESTMENT_ADVICE_PATTERN =
  /매수\s*추천|매도\s*추천|투자\s*권유|지금\s*사세요|지금\s*파세요|사는\s*게\s*좋|파는\s*게\s*좋/;
const SAFE_FALLBACK_REPLY =
  "죄송해요, 저는 매수·매도 추천이나 투자 자문을 드릴 수 없어요. 리포트에 나온 내용을 쉽게 풀어드리거나 용어를 설명해드리는 건 도와드릴 수 있어요.";

function buildChatSystemPrompt(
  stockName: string,
  news: { title: string; body: string }[],
  priceChangePct: number
): string {
  const articles = news.map((n, i) => `[기사 ${i + 1}] ${n.title}\n${n.body}`).join("\n\n");
  return `당신은 은행 앱 안에 있는 "${stockName}" 종목 리포트 설명 도우미입니다.
사용자는 이미 화면에서 아래 뉴스·등락률 기반 리포트를 봤고, 그 내용에 대해 질문합니다.

[역할 범위 - 이것만 하세요]
- 리포트/뉴스 내용 설명, 금융 용어 풀이, 서비스 이용 방법 안내

[절대 하지 말아야 할 것]
- 매수/매도 추천, 특정 종목 추천, "사세요/파세요" 같은 표현
- 미래 주가에 대한 확정적 예측 ("오를 거예요" 등)
- 투자 여부에 대한 직접적인 조언
- 위 질문을 받으면 "저는 투자 자문을 드릴 수 없어요"라고 정중히 답하고, 대신 리포트 설명이나 방향성 예측 참여 기능을 안내하세요.

답변은 2~4문장으로 짧고 쉽게, 초보 투자자도 이해할 수 있게 답하세요.

[전일 대비 등락률]
${priceChangePct}%

[참고 뉴스]
${articles || "(관련 뉴스 없음)"}`;
}

export async function chatAboutStock(
  code: string,
  stockName: string,
  history: ChatMessage[]
): Promise<string> {
  if (!client) {
    const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
    return findGlossaryAnswer(lastUserMessage) ?? NO_AI_GUIDE_REPLY;
  }

  const [news, priceChangePct] = await Promise.all([safeGetNews(code), safeGetPriceChange(code)]);
  const trimmedHistory = history.slice(-CHAT_HISTORY_LIMIT);

  const message = await client.messages.create(
    {
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: buildChatSystemPrompt(stockName, news, priceChangePct),
      messages: trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    },
    { timeout: 15000 }
  );
  const text = message.content.find((block) => block.type === "text");
  const reply = text && text.type === "text" ? text.text : "";

  if (!reply || INVESTMENT_ADVICE_PATTERN.test(reply)) {
    return SAFE_FALLBACK_REPLY;
  }
  return reply;
}

// 같은 종목을 짧은 시간 안에 여러 번(다른 사용자 포함) 조회해도 매번 AI를 다시 부르지 않도록,
// 종목 코드 기준으로 결과를 잠깐 재사용한다. 뉴스/가격이 그 사이 크게 안 바뀐다는 전제.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

// data가 아니라 promise 자체를 캐싱해서, 첫 요청이 아직 끝나기 전에 두 번째 요청(예: 프리페치와
// 실제 화면 진입이 거의 동시에 들어오는 경우)이 와도 같은 진행 중인 요청을 같이 기다리게 한다
// (그렇지 않으면 둘 다 "캐시 없음"으로 보고 Claude를 2번 호출하게 됨).
function withCache<T>(
  cache: Map<string, { promise: Promise<T>; cachedAt: number }>,
  key: string,
  label: string,
  compute: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[aiReport] cache hit for ${label} ${key}`);
    return cached.promise;
  }
  const promise = compute();
  cache.set(key, { promise, cachedAt: Date.now() });
  promise.catch(() => cache.delete(key)); // 실패하면 다음 요청이 재시도할 수 있게 캐시에서 제거
  return promise;
}

const reportCache = new Map<string, { promise: Promise<StockReport>; cachedAt: number }>();
const factorCache = new Map<string, { promise: Promise<FactorAnalysis>; cachedAt: number }>();

export async function generateReport(code: string, stockName: string): Promise<StockReport> {
  return withCache(reportCache, code, "report", async () => {
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
  });
}

export async function generateFactorAnalysis(code: string, stockName: string): Promise<FactorAnalysis> {
  return withCache(factorCache, code, "factors", async () => {
    console.log(`[aiReport] generateFactorAnalysis called for ${code} (${stockName})`);
    const [news, priceChangePct] = await Promise.all([safeGetNews(code), safeGetPriceChange(code)]);

    if (!client) return extractiveFactors(code, priceChangePct);

    try {
      console.log(`[aiReport] Calling Claude API for factors...`);
      const parsed = (await askClaude(buildFactorPrompt(stockName, news, priceChangePct))) as Omit<
        FactorAnalysis,
        "code" | "priceChangePct"
      >;
      console.log(`[aiReport] Claude API success for factors ${code}`);
      return { code, priceChangePct, ...parsed };
    } catch (err) {
      console.warn(`[aiReport] falling back to extractive factors for ${code}:`, (err as Error).message);
      return extractiveFactors(code, priceChangePct);
    }
  });
}
