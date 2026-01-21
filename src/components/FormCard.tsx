import * as React from "react";

type Props = {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function FormCard({ title, description, footer, children }: Props) {
  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="border-b p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>

      <div className="p-5 space-y-4">{children}</div>

      {footer ? <div className="border-t p-5">{footer}</div> : null}
    </section>
  );
}
