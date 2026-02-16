import Link from "next/link";
import { ArrowRight } from "lucide-react";
import * as React from "react";

export interface ModuleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: {
    label: string;
    href: string;
  };
  variant?: "default" | "featured";
}

export function ModuleCard({
  title,
  description,
  icon,
  action,
  variant = "default",
}: ModuleCardProps) {
  const isFeatured = variant === "featured";

  return (
    <Link
      href={action.href}
      className={[
        "group relative block h-full overflow-hidden rounded-[var(--radius-lg)] border border-border/50 bg-card p-6",
        "shadow-[var(--shadow-sm)] transition-all duration-200 ease-out",
        "hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lg)] hover:ring-1 hover:ring-primary/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isFeatured ? "border-primary/20 ring-1 ring-primary/10" : "",
      ].join(" ")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />

      <div className="relative z-[1] flex h-full flex-col gap-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary transition-all duration-200 group-hover:scale-110 group-hover:bg-primary/15">
          {icon}
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        <div className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-primary transition-[gap] duration-200 group-hover:gap-3">
          <span>{action.label}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
