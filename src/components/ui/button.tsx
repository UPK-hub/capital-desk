import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion } from "framer-motion";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "default" | "outline" | "ghost" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  default:
    "border-transparent text-white bg-gradient-to-r from-[#2f5bc9] to-[#2fa4f4] hover:brightness-105 shadow-sm",
  outline:
    "border-border/80 bg-white text-foreground hover:border-primary/35 hover:bg-primary/5 shadow-[var(--shadow-xs)]",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-muted/50",
  soft: "border-border/70 bg-muted/25 text-foreground hover:bg-muted/40",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "h-10 w-10 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", asChild = false, loading = false, children, ...props },
  ref
) {
  const nativeProps = props as React.ButtonHTMLAttributes<HTMLButtonElement>;
  const disabled = loading || props.disabled;
  const classes = cx(
    "btn-ripple inline-flex items-center justify-center gap-2 rounded-xl border font-semibold transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
    className
  );

  if (asChild) {
    return (
      <Slot className={classes}>
        {children}
      </Slot>
    );
  }

  return (
    <motion.button
      ref={ref}
      className={classes}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      disabled={disabled}
      {...(nativeProps as any)}
    >
      {loading ? (
        <>
          <motion.span
            className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, ease: "linear", repeat: Infinity }}
          />
          Cargando...
        </>
      ) : (
        children
      )}
    </motion.button>
  );
});
