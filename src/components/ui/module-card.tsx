"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

export interface ModuleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: {
    label: string;
    href: string;
  };
  variant?: "default" | "featured";
  tone?: "backoffice" | "tecnico" | "videos" | "planner" | "sts" | "tm" | "admin";
  count?: number;
  subtitle?: string;
}

function toneStyles(tone: NonNullable<ModuleCardProps["tone"]>) {
  switch (tone) {
    case "backoffice":
      return {
        iconBg: "bg-red-100",
        iconColor: "text-red-500",
        panelBg: "bg-red-50/40",
        button: "from-[#2f5bc9] to-[#2fa4f4]",
      };
    case "tecnico":
      return {
        iconBg: "bg-violet-100",
        iconColor: "text-violet-600",
        panelBg: "bg-violet-50/50",
        button: "from-[#5963d5] to-[#6f7cf6]",
      };
    case "videos":
      return {
        iconBg: "bg-purple-100",
        iconColor: "text-purple-600",
        panelBg: "bg-purple-50/50",
        button: "from-[#5963d5] to-[#6f7cf6]",
      };
    case "planner":
      return {
        iconBg: "bg-cyan-100",
        iconColor: "text-cyan-600",
        panelBg: "bg-cyan-50/50",
        button: "from-[#1da4c8] to-[#33c5da]",
      };
    case "sts":
      return {
        iconBg: "bg-orange-100",
        iconColor: "text-orange-500",
        panelBg: "bg-orange-50/40",
        button: "from-[#f18b5d] to-[#f3a15d]",
      };
    case "tm":
      return {
        iconBg: "bg-blue-100",
        iconColor: "text-blue-600",
        panelBg: "bg-blue-50/45",
        button: "from-[#2f5bc9] to-[#2f8ce8]",
      };
    case "admin":
    default:
      return {
        iconBg: "bg-indigo-100",
        iconColor: "text-indigo-600",
        panelBg: "bg-indigo-50/45",
        button: "from-[#5963d5] to-[#6f7cf6]",
      };
  }
}

export function ModuleCard({
  title,
  description,
  icon,
  action,
  variant = "default",
  tone = "admin",
  count,
  subtitle,
}: ModuleCardProps) {
  const styles = toneStyles(tone);
  const featured = variant === "featured";
  const isTm = tone === "tm";

  return (
    <motion.article
      className={[
        "group relative h-full overflow-hidden rounded-2xl border border-border/60 p-6",
        "bg-white shadow-[var(--shadow-card)] transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]",
        styles.panelBg,
        featured ? "ring-1 ring-primary/15" : "",
      ].join(" ")}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative z-[1] flex h-full flex-col">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconColor}`}>
            {isTm ? (
              <Image
                src="/resources/TM_Logo.png"
                alt="TM"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
            ) : (
              icon
            )}
          </div>
          {typeof count === "number" ? (
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white">{count}</span>
          ) : null}
        </div>

        <h3 className="text-[1.9rem] font-bold leading-tight text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{description}</p>
        {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-700">{subtitle}</p> : null}

        <div className="mt-5 border-t border-border/55 pt-3">
          <motion.div whileTap={{ scale: 0.98 }}>
            <Link
              href={action.href}
              className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${styles.button} text-base font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-105`}
            >
              {action.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </motion.article>
  );
}
