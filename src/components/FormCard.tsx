import * as React from "react";

type Props = {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function FormCard({ title, description, footer, children }: Props) {
  return (
    <section className="sts-card">
      <div className="border-b border-[var(--border-subtle)] bg-muted/30 p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>

      <div className="space-y-4 p-5">{children}</div>

      {footer ? <div className="border-t border-[var(--border-subtle)] bg-muted/20 p-5">{footer}</div> : null}
    </section>
  );
}
