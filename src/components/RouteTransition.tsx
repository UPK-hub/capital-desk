"use client";

import { PageTransition } from "@/components/animations/PageTransition";

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
