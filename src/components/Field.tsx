"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="mb-0 text-sm font-medium text-foreground">{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

type BaseProps = React.InputHTMLAttributes<HTMLInputElement> & { className?: string };

export function Input(props: BaseProps) {
  const { className, ...rest } = props;
  return <UiInput {...rest} className={"h-10 " + (className ?? "")} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  const { className, ...rest } = props;
  return <UiTextarea {...rest} className={className} />;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string };

export const Select = React.forwardRef<HTMLInputElement | HTMLSelectElement, SelectProps>(
  function Select(props, forwardedRef) {
    const {
      className,
      children,
      disabled,
      onChange,
      onBlur,
      value,
      defaultValue,
      name,
      required,
      multiple,
      size,
      ...rest
    } = props;

    const isNative = Boolean(multiple || (size ?? 0) > 1);

    type SelectOption = { value: string; label: string; disabled?: boolean };

    function optionLabel(rawLabel: React.ReactNode, fallback: string) {
      if (typeof rawLabel === "string" || typeof rawLabel === "number") return String(rawLabel);
      if (Array.isArray(rawLabel)) {
        const joined = rawLabel
          .map((item) => (typeof item === "string" || typeof item === "number" ? String(item) : ""))
          .join("")
          .trim();
        return joined || fallback;
      }
      return fallback;
    }

    const options = React.useMemo<SelectOption[]>(() => {
      const parsed: SelectOption[] = [];
      React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type !== "option") return;
        const rawValue = (child.props as any).value;
        const val = rawValue == null ? "" : String(rawValue);
        const label = optionLabel((child.props as any).children, val || "Selecciona");
        parsed.push({ value: val, label, disabled: Boolean((child.props as any).disabled) });
      });
      return parsed;
    }, [children]);

    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(() =>
      defaultValue == null ? "" : String(defaultValue)
    );
    const [open, setOpen] = React.useState(false);
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const mirrorRef = React.useRef<HTMLSelectElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | undefined>(undefined);

    const selectedValue = controlled ? String(value ?? "") : internalValue;
    const selectedOption =
      options.find((o) => o.value === selectedValue) ??
      options.find((o) => o.value === "") ??
      options[0] ??
      null;

    function updateMenuPosition() {
      if (!triggerRef.current || typeof window === "undefined") return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const estimatedHeight = Math.min(320, Math.max(120, options.length * 38 + 16));
      const margin = 8;
      const spaceBelow = viewportH - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;

      const width = Math.min(rect.width, viewportW - margin * 2);
      let left = rect.left;
      if (left + width > viewportW - margin) left = viewportW - width - margin;
      if (left < margin) left = margin;

      let top = rect.bottom + 4;
      if (openUp) {
        top = Math.max(margin, rect.top - Math.min(estimatedHeight, spaceAbove) - 4);
      }

      setMenuStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 9999,
      });
    }

    React.useEffect(() => {
      function handleOutsideClick(e: MouseEvent) {
        const target = e.target as Node;
        if (wrapRef.current?.contains(target)) return;
        if (menuRef.current?.contains(target)) return;
        if (!wrapRef.current) return;
        setOpen(false);
      }
      function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
      }
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEsc);
      return () => {
        document.removeEventListener("mousedown", handleOutsideClick);
        document.removeEventListener("keydown", handleEsc);
      };
    }, []);

    React.useEffect(() => {
      if (!controlled) return;
      setInternalValue(String(value ?? ""));
    }, [controlled, value]);

    React.useEffect(() => {
      if (controlled) return;
      const domValue = mirrorRef.current?.value;
      if (typeof domValue === "string" && domValue !== internalValue) {
        setInternalValue(domValue);
      }
    }, [controlled, internalValue, options.length]);

    React.useEffect(() => {
      if (!open) return;

      updateMenuPosition();

      function handleScrollOrResize() {
        updateMenuPosition();
      }

      window.addEventListener("resize", handleScrollOrResize);
      window.addEventListener("scroll", handleScrollOrResize, true);
      return () => {
        window.removeEventListener("resize", handleScrollOrResize);
        window.removeEventListener("scroll", handleScrollOrResize, true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, options.length]);

    function bindMirrorRef(node: HTMLSelectElement | null) {
      mirrorRef.current = node;
      if (!forwardedRef) return;
      if (typeof forwardedRef === "function") {
        forwardedRef(node as HTMLSelectElement & HTMLInputElement);
        return;
      }
      (forwardedRef as React.MutableRefObject<HTMLInputElement | HTMLSelectElement | null>).current = node;
    }

    if (isNative) {
      return (
        <select
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          ref={forwardedRef as React.Ref<HTMLSelectElement>}
          name={name}
          required={required}
          multiple={multiple}
          size={size}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          className={
            "app-field-control h-10 w-full text-sm disabled:cursor-not-allowed disabled:opacity-55 " +
            (className ?? "")
          }
        >
          {children}
        </select>
      );
    }

    function emit(nextValue: string) {
      if (!controlled) setInternalValue(nextValue);
      onChange?.({ target: { value: nextValue, name: name ?? "" } } as React.ChangeEvent<HTMLSelectElement>);
      onBlur?.({ target: { value: nextValue, name: name ?? "" } } as React.FocusEvent<HTMLSelectElement>);
    }

    return (
      <div className="app-select-wrap relative" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={
            "app-field-control flex h-10 w-full items-center justify-between gap-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-55 " +
            (className ?? "")
          }
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate text-left">{selectedOption?.label ?? "Selecciona"}</span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <select
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          ref={bindMirrorRef}
          name={name}
          required={required}
          disabled={disabled}
          value={selectedValue}
          onChange={(e) => emit(String(e.target.value))}
          onBlur={onBlur}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        >
          {children}
        </select>

        {open && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={menuRef}
                style={menuStyle}
                className="dropdown-content overflow-hidden rounded-lg border border-border/70 bg-card shadow-[var(--shadow-lg)]"
                role="listbox"
              >
                <div className="max-h-72 overflow-auto p-1.5">
                  {options.map((opt) => (
                    <button
                      key={`${name ?? "select"}-${opt.value}-${opt.label}`}
                      type="button"
                      disabled={disabled || opt.disabled}
                      onClick={() => {
                        if (opt.disabled) return;
                        emit(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full rounded-md border px-2.5 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        selectedValue === opt.value
                          ? "border-border/60 bg-muted/70 font-semibold text-foreground"
                          : "border-transparent text-foreground hover:border-border/40 hover:bg-muted/50"
                      } ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      role="option"
                      aria-selected={selectedValue === opt.value}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
    );
  }
);

Select.displayName = "Select";
