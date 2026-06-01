import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "rose" | "cream";
  size?: "md" | "lg";
  children: ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, CSSProperties> = {
  primary:   { background: "var(--accent)", color: "#33240c", boxShadow: "0 5px 0 -1px #8c5f1d, 0 9px 16px -8px rgba(140,95,29,0.7)" },
  rose:      { background: "var(--accent-2)", color: "#fff5f0", boxShadow: "0 5px 0 -1px #7e2b22, 0 9px 16px -8px rgba(126,43,34,0.6)" },
  cream:     { background: "var(--cream)", color: "var(--cream-ink)", boxShadow: "0 5px 0 -1px #cdbb97, inset 0 0 0 1px var(--cream-line)" },
  secondary: { background: "var(--surface)", color: "var(--text)", boxShadow: "inset 0 0 0 1.5px var(--line)" },
  ghost:     { background: "transparent", color: "var(--text-dim)" },
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, CSSProperties> = {
  md: { padding: "11px 20px", fontSize: 16 },
  lg: { padding: "15px 26px", fontSize: 19 },
};

export function Button({ variant = "primary", size = "md", style, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        fontFamily: "var(--display)", fontWeight: 700, borderRadius: 999,
        transition: "transform .12s, filter .12s", opacity: rest.disabled ? 0.45 : 1,
        ...variantStyles[variant], ...sizeStyles[size], ...style,
      }}
      onMouseDown={(e) => { rest.onMouseDown?.(e); e.currentTarget.style.transform = "translateY(2px)"; }}
      onMouseUp={(e) => { rest.onMouseUp?.(e); e.currentTarget.style.transform = ""; }}
      onMouseLeave={(e) => { rest.onMouseLeave?.(e); e.currentTarget.style.transform = ""; }}
    >
      {children}
    </button>
  );
}
