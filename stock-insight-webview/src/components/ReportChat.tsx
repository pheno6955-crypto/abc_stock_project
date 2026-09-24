import { useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import type { ChatMessage } from "../types";
import { chatAboutStock } from "../api/client";
import { getErrorMessage } from "../api/errors";

interface Props {
  code: string;
  stockName: string;
}

const QUICK_REPLIES = ["PER이 뭐야?", "이 뉴스가 왜 중요해?", "리포트 한줄로 요약해줘"];

function ChatAvatar() {
  return (
    <div className="chat-avatar">
      <Bot size={16} />
    </div>
  );
}

export default function ReportChat({ code, stockName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    scrollToBottom();
    try {
      const reply = await chatAboutStock(code, next);
      setMessages([...next, { role: "assistant", content: reply }]);
      scrollToBottom();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)}>
        <span className="chat-fab-avatar">
          <Sparkles size={16} />
        </span>
        이 리포트에 대해 물어보기
      </button>
    );
  }

  return (
    <div className="card chat-panel">
      <div className="chat-header">
        <ChatAvatar />
        <div className="chat-header-text">
          <span>{stockName} 리포트 도우미</span>
          <span className="chat-header-sub">궁금한 건 편하게 물어보세요</span>
        </div>
        <button className="chat-close" onClick={() => setOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>리포트 내용이나 용어가 궁금하면 물어보세요.</p>
            <div className="chat-quick-replies">
              {QUICK_REPLIES.map((q) => (
                <button key={q} className="chat-quick-reply" onClick={() => send(q)} disabled={sending}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble-row ${m.role}`}>
            {m.role === "assistant" && <ChatAvatar />}
            <div className={`chat-bubble ${m.role}`}>{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="chat-bubble-row assistant">
            <ChatAvatar />
            <div className="chat-bubble assistant chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          </div>
        )}
      </div>

      {error && <p style={{ color: "var(--color-up)", fontSize: 13 }}>{error}</p>}

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="궁금한 점을 물어보세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button className="chat-send" onClick={() => send()} disabled={sending || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
      <p className="disclaimer" style={{ marginTop: "var(--space-sm)" }}>
        매수·매도 추천이나 투자 자문은 제공하지 않아요. 참고용 설명만 드립니다.
      </p>
    </div>
  );
}
