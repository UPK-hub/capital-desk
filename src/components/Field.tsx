import * as React from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium">{label}</label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

type BaseProps = React.InputHTMLAttributes<HTMLInputElement> & { className?: string };

export function Input(props: BaseProps) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={
        "h-10 w-full rounded-md border bg-white px-3 text-sm outline-none " +
        "focus:ring-2 focus:ring-black/20 disabled:opacity-60 " +
        (className ?? "")
      }
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={
        "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none " +
        "focus:ring-2 focus:ring-black/20 disabled:opacity-60 " +
        (className ?? "")
      }
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={
        "h-10 w-full rounded-md border bg-white px-3 text-sm outline-none " +
        "focus:ring-2 focus:ring-black/20 disabled:opacity-60 " +
        (className ?? "")
      }
    />
  );
}
