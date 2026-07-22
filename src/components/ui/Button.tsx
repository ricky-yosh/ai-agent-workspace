import { forwardRef, type ReactNode, type ButtonHTMLAttributes, type ElementType } from "react";
import "./Button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  children: ReactNode;
  /** Render the button as a different element (e.g. framer-motion's `motion.button`). */
  as?: ElementType;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, onClick, as: Component = "button", ...rest },
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

  if (Component === "button") {
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
  }

  return (
    <Component
      ref={ref}
      className={classes}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      {...(rest as Record<string, unknown>)}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      <span className="ui-button__content">{children}</span>
    </Component>
  );
});
