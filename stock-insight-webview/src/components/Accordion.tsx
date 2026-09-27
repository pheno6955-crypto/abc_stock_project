import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// 메뉴 제목을 누르면 상세 내용이 펼쳐지는 섹션. 여러 개를 동시에 펼칠 수 있다.
// 내용은 처음 펼칠 때 한 번만 마운트하고 이후엔 숨김/표시만 해서, 다시 열어도 재조회하지 않는다.
export default function Accordion({ icon, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    setOpen((prev) => !prev);
    setMounted(true);
  };

  return (
    <section className={`card accordion${open ? " open" : ""}`}>
      <button type="button" className="accordion-header" aria-expanded={open} onClick={toggle}>
        <span className="accordion-title">
          {icon}
          {title}
        </span>
        <ChevronDown size={20} className="accordion-chevron" />
      </button>
      {mounted && (
        <div className="accordion-body" hidden={!open}>
          {children}
        </div>
      )}
    </section>
  );
}
