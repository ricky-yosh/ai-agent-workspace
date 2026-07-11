import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import "./Button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, onClick, ...rest },
  ref
) {
  const isDisabled = disabled || loading;
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    `ui-button--${size}`,
    loading ? "ui-button--loading" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      {...rest}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      <span className="ui-button__content">{children}</span>
    </button>
  );
});
