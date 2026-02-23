import type { Variants } from "framer-motion";

export const eases = {
  standard: [0.16, 1, 0.3, 1] as const,
  expoOut: [0.22, 1, 0.36, 1] as const,
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: eases.expoOut },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: 0.22, ease: eases.standard },
  },
};

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: -16 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.26, ease: eases.standard },
  },
  exit: {
    opacity: 0,
    x: -10,
    transition: { duration: 0.18, ease: eases.standard },
  },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: eases.expoOut },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: { duration: 0.14, ease: eases.standard },
  },
};

export const slideInBottom: Variants = {
  initial: { y: "100%" },
  animate: {
    y: 0,
    transition: { duration: 0.3, ease: eases.expoOut },
  },
  exit: {
    y: "100%",
    transition: { duration: 0.24, ease: eases.standard },
  },
};

export const staggerContainer = (stagger = 0.07, delayChildren = 0): Variants => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
});

export const listItem: Variants = {
  initial: { opacity: 0, x: -10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.24, ease: eases.standard },
  },
  exit: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.16, ease: eases.standard },
  },
};

export const bounce: Variants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 520,
      damping: 22,
    },
  },
};

export const rotate: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      duration: 0.95,
      ease: "linear",
      repeat: Infinity,
    },
  },
};

export const routeFade: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: eases.standard },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.18, ease: eases.standard },
  },
};

