import { useState, useCallback, useLayoutEffect, useEffect, useRef } from "react";
import "./SegmentedControl.css";

export interface SegmentedControlProps {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function SegmentedControl({ options, value, onChange, ariaLabel, disabled = false }: SegmentedControlProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pillReadyRef = useRef(false);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  const measurePill = useCallback(() => {
    const el = optionRefs.current.get(value);
    if (!el || !barRef.current) {
      setPillStyle(null);
      return;
    }
    setPillStyle({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);

  useLayoutEffect(() => {
    measurePill();
    if (!pillReadyRef.current) {
      const raf = requestAnimationFrame(() => {
        pillReadyRef.current = true;
        if (pillRef.current) {
          pillRef.current.setAttribute("data-ready", "true");
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [value, measurePill]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => measurePill());
    ro.observe(bar);
    return () => ro.disconnect();
  }, [measurePill]);

  return (
    <div
      className="ui-segmented-control"
      ref={barRef}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {pillStyle && (
        <div
          ref={pillRef}
          className="ui-segmented-control__pill"
          style={{ left: pillStyle.left, width: pillStyle.width }}
        />
      )}
      {options.map((option) => (
        <div
          key={option.value}
          ref={(el) => {
            if (el) optionRefs.current.set(option.value, el);
            else optionRefs.current.delete(option.value);
          }}
          className={`ui-segmented-control__option${value === option.value ? " ui-segmented-control__option--active" : ""}${disabled ? " ui-segmented-control__option--disabled" : ""}`}
          role="radio"
          aria-checked={value === option.value}
          tabIndex={disabled ? -1 : 0}
          onClick={() => {
            if (!disabled) onChange(option.value);
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(option.value);
            }
          }}
        >
          {option.label}
        </div>
      ))}
    </div>
  );
}
