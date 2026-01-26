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
      <div className="border-b border-zinc-200/70 p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>

      <div className="p-5 space-y-4">{children}</div>

      {footer ? <div className="border-t border-zinc-200/70 p-5">{footer}</div> : null}
    </section>
  );
}
