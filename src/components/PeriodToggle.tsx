import { clsx } from "clsx";
import styles from "./PeriodToggle.module.css";

interface Props<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  renderLabel?: (value: T) => string;
  inline?: boolean;
  className?: string;
}

export function PeriodToggle<T extends string>({
  options,
  selected,
  onSelect,
  renderLabel,
  inline,
  className,
}: Props<T>) {
  return (
    <div className={clsx("period-toggle", inline && styles.inline, className)}>
      {options.map((o) => (
        <button key={o} className={selected === o ? "active" : ""} onClick={() => onSelect(o)}>
          {renderLabel ? renderLabel(o) : o}
        </button>
      ))}
    </div>
  );
}
