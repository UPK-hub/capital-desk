import { CardSkeleton } from "@/components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <div className="page-loading-shell">
      <div className="page-loading-bar" />
      <div className="page-loading-grid space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
