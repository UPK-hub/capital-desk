export default function CasesLoading() {
  return (
    <div className="grid gap-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-md bg-muted" />
          <div className="h-4 w-52 rounded-md bg-muted" />
        </div>
        <div className="h-10 w-28 rounded-full bg-muted" />
      </div>

      <div className="sts-card p-5">
        <div className="grid gap-2.5 md:grid-cols-5">
          <div className="h-10 rounded-xl bg-muted md:col-span-2" />
          <div className="h-10 rounded-xl bg-muted" />
          <div className="h-10 rounded-xl bg-muted" />
          <div className="h-10 rounded-xl bg-muted" />
        </div>
      </div>

      <div className="sts-card overflow-hidden">
        <div className="h-12 border-b bg-muted/50" />
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-16 border-b last:border-0 bg-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
