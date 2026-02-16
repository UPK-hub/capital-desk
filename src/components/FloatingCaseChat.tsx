"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CaseChat from "@/components/CaseChat";

export default function FloatingCaseChat({
  caseId,
  currentUserId,
  currentUserName,
}: {
  caseId: string;
  currentUserId: string;
  currentUserName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-[380px] max-w-[90vw] overflow-hidden rounded-3xl border shadow-2xl"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Chat del caso</p>
              <button
                className="rounded-full border px-3 py-1 text-xs"
                type="button"
                onClick={() => setOpen(false)}
                style={{ borderColor: "hsl(var(--border))" }}
              >
                Cerrar
              </button>
            </div>
            <CaseChat
              caseId={caseId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              showHeader={false}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full border shadow-lg"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
        onClick={() => setOpen((prev) => !prev)}
        title="Abrir chat"
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ y: 0, scale: 0.97 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        💬
      </motion.button>
    </div>
  );
}
