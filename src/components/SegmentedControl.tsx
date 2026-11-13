import { clsx } from "clsx";
import styles from "./SegmentedControl.module.css";

interface Props<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  renderLabel?: (value: T) => string;
  className?: string;
  ariaLabel?: string;
}

/** Compact single-container toggle, for page-level filters (as opposed to PeriodToggle's separate pills). */
export function SegmentedControl<T extends string>({ options, selected, onSelect, renderLabel, className, ariaLabel }: Props<T>) {
  return (
    <div className={clsx(styles.control, className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={clsx(styles.segment, selected === o && styles.active)}
          aria-pressed={selected === o}
          onClick={() => onSelect(o)}
        >
          {renderLabel ? renderLabel(o) : o}
        </button>
      ))}
    </div>
  );
}
