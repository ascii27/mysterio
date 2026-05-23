import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  children: ReactNode;
}

const variantStyles = {
  primary: { background: "var(--accent)", color: "#1a1530" },
  secondary: { background: "var(--surface-2)", color: "var(--text)" },
  ghost: { background: "transparent", color: "var(--text-dim)" },
};

const sizeStyles = {
  md: { padding: "10px 16px", fontSize: 16, borderRadius: "var(--radius)" },
  lg: { padding: "16px 28px", fontSize: 20, borderRadius: "var(--radius)" },
};

export function Button({ variant = "primary", size = "md", style, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        fontWeight: 700,
        opacity: rest.disabled ? 0.5 : 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
