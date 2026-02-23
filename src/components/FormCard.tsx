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
      <div className="border-b border-border/60 bg-white p-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
        </div>
      </div>

      <div className="space-y-5 p-6">{children}</div>

      {footer ? <div className="border-t border-border/55 bg-slate-50/55 p-6">{footer}</div> : null}
    </section>
  );
}
