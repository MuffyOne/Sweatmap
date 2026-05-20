import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  extra?: ReactNode;
}

export function CollapsibleSection({ title, children, defaultOpen = true, extra }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    setOpen((prev) => !prev);
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
