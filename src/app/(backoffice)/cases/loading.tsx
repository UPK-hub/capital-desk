import { CardSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function CasesLoading() {
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-7 w-40 rounded-md bg-muted" />
          <div className="skeleton-shimmer h-4 w-52 rounded-md bg-muted" />
        </div>
        <div className="skeleton-shimmer h-10 w-28 rounded-full bg-muted" />
      </div>

      <CardSkeleton />

      <TableSkeleton rows={6} />
    </div>
  );
}
