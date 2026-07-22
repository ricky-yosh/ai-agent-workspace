import { forwardRef, type TextareaHTMLAttributes, useId } from "react";
import "./Textarea.css";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({
  label,
  error,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id: idProp,
  ...rest
}, ref) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hasError = typeof error === "string" && error.length > 0;

  return (
    <div className={`ui-textarea${hasError ? " ui-textarea--error" : ""}${className ? ` ${className}` : ""}`}>
      {label && (
        <label className="ui-textarea__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="ui-textarea__wrapper">
        <textarea
          ref={ref}
          id={id}
          className="ui-textarea__field"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          {...rest}
        />
      </div>
      {hasError && <span className="ui-textarea__error">{error}</span>}
    </div>
  );
});
