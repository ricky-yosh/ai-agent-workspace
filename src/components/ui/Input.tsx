import { type ReactNode, type InputHTMLAttributes, useId } from "react";
import "./Input.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
}

export function Input({
  label,
  error,
  leadingIcon,
  trailingIcon,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  className,
  id: idProp,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hasError = typeof error === "string" && error.length > 0;

  return (
    <div className={`ui-input${hasError ? " ui-input--error" : ""}${className ? ` ${className}` : ""}`}>
      {label && (
        <label className="ui-input__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="ui-input__wrapper">
        {leadingIcon && <span className="ui-input__icon ui-input__icon--leading">{leadingIcon}</span>}
        <input
          id={id}
          type={type}
          className="ui-input__field"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          {...rest}
        />
        {trailingIcon && <span className="ui-input__icon ui-input__icon--trailing">{trailingIcon}</span>}
      </div>
      {hasError && <span className="ui-input__error">{error}</span>}
    </div>
  );
}
