"use client";

import { ReactLenis } from "@studio-freight/react-lenis";

const ENABLE_LENIS = process.env.NEXT_PUBLIC_ENABLE_LENIS === "true";

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  if (!ENABLE_LENIS) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.15,
        smoothWheel: true,
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}

