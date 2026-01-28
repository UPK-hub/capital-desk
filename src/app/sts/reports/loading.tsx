export default function LoadingStsReports() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-52 skeleton" />
          <div className="h-4 w-40 skeleton" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-40 skeleton" />
          <div className="h-8 w-28 skeleton" />
          <div className="h-8 w-28 skeleton" />
        </div>
      </div>

      <div className="report-grid">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="report-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 skeleton" />
                <div className="h-3 w-28 skeleton" />
              </div>
              <div className="h-8 w-28 skeleton" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="h-12 w-32 skeleton" />
              <div className="h-12 w-24 skeleton" />
            </div>
            <div className="h-40 w-full skeleton" />
          </div>
        ))}
      </div>

      <div className="report-grid">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={idx} className="report-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 skeleton" />
                <div className="h-3 w-28 skeleton" />
              </div>
              <div className="h-8 w-28 skeleton" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, row) => (
                <div key={row} className="h-10 w-full skeleton" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="report-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-52 skeleton" />
            <div className="h-3 w-28 skeleton" />
          </div>
          <div className="h-8 w-28 skeleton" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="h-10 w-full skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}
