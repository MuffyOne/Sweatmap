import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  extra?: ReactNode;
}

const STORAGE_PREFIX = "section_collapsed_";

function getKey(title: string) {
  return STORAGE_PREFIX + title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function CollapsibleSection({ title, children, defaultOpen = true, extra }: Props) {
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(getKey(title));
    if (stored !== null) return stored === "1";
    return defaultOpen;
  });

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(getKey(title), next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className={`collapsible-section ${open ? "collapsible-section--open" : ""}`}>
      <button className="collapsible-header" onClick={toggle}>
        <span className="collapsible-chevron">{open ? "▼" : "▶"}</span>
        <h3 className="collapsible-title">{title}</h3>
        {extra && <span className="collapsible-extra">{extra}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
