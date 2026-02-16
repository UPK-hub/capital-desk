import * as React from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Fieldset({
  legend,
  children,
  className,
}: {
  legend: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cx(
        "rounded-lg border-2 border-border bg-card p-6",
        className
      )}
    >
      <legend className="-ml-2 px-2 text-sm font-semibold text-foreground">{legend}</legend>
      <div className="mt-4 space-y-4">{children}</div>
    </fieldset>
  );
}

