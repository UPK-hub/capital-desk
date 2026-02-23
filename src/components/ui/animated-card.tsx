"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
  type CardContentProps,
  type CardDescriptionProps,
  type CardFooterProps,
  type CardHeaderProps,
  type CardTitleProps,
} from "@/components/ui/card";
import { fadeInUp } from "@/lib/animations";

export function AnimatedCard({
  children,
  delay = 0,
  ...props
}: CardProps & { delay?: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ delay }}
    >
      <Card className="card-hover" {...props}>
        {children}
      </Card>
    </motion.div>
  );
}

export function AnimatedCardHeader(props: CardHeaderProps) {
  return <CardHeader {...props} />;
}

export function AnimatedCardTitle(props: CardTitleProps) {
  return <CardTitle {...props} />;
}

export function AnimatedCardDescription(props: CardDescriptionProps) {
  return <CardDescription {...props} />;
}

export function AnimatedCardContent(props: CardContentProps) {
  return <CardContent {...props} />;
}

export function AnimatedCardFooter(props: CardFooterProps) {
  return <CardFooter {...props} />;
}

