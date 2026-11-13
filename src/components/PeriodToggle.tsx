import { clsx } from "clsx";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./PeriodToggle.module.css";

interface Props<T extends string> {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  renderLabel?: (value: T) => string;
  inline?: boolean;
  className?: string;
}

/** Section-level toggle. Uses the same segmented style as the page-level sport filter. */
export function PeriodToggle<T extends string>({ options, selected, onSelect, renderLabel, inline, className }: Props<T>) {
  return (
    <SegmentedControl
      options={options}
      selected={selected}
      onSelect={onSelect}
      renderLabel={renderLabel}
      className={clsx(inline ? styles.inline : styles.spaced, className)}
    />
  );
}
