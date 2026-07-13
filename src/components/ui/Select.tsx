import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import "./Select.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "children"> {
  label?: string;
  error?: string;
  options: readonly SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  variant?: "default" | "minimal";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({
  label,
  error,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id: idProp,
  variant = "default",
  ...rest
}, ref) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hasError = typeof error === "string" && error.length > 0;

  const optionsElements = (
    <>
      {placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </>
  );

  if (variant === "minimal") {
    return (
      <select
        ref={ref}
        id={id}
        className={`ui-select__field ui-select__field--minimal${className ? ` ${className}` : ""}`}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        {...rest}
      >
        {optionsElements}
      </select>
    );
  }

  return (
    <div className={`ui-select${hasError ? " ui-select--error" : ""}${className ? ` ${className}` : ""}`}>
      {label && (
        <label className="ui-select__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="ui-select__wrapper">
        <select
          ref={ref}
          id={id}
          className="ui-select__field"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          {...rest}
        >
          {optionsElements}
        </select>
        <span className="ui-select__chevron" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {hasError && <span className="ui-select__error">{error}</span>}
    </div>
  );
});
