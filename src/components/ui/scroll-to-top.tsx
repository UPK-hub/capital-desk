"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = document.querySelector(".main-scroll");
    if (!container) return;

    function onScroll() {
      setVisible((container as HTMLElement).scrollTop > 300);
    }

    container.addEventListener("scroll", onScroll);
    onScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, []);

  function handleScrollTop() {
    const container = document.querySelector(".main-scroll");
    if (!container) return;
    (container as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.85, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleScrollTop}
          className="sts-btn-primary fixed bottom-24 right-6 z-40 h-11 w-11 rounded-full p-0 shadow-[var(--shadow-lg)]"
          aria-label="Volver arriba"
          title="Volver arriba"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
