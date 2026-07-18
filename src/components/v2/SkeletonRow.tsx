export default function SkeletonRow() {
  return (
    <div className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-border bg-surface-default/60 relative overflow-hidden select-none animate-pulse">
      {/* Avatar skeleton */}
      <div className="h-11 w-11 rounded-2xl bg-surface-light shrink-0" />

      {/* Info skeleton */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-28 rounded bg-surface-light" />
          <div className="h-2 w-16 rounded bg-surface-light" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-40 rounded bg-surface-light" />
          <div className="h-4 w-4 rounded-full bg-surface-light" />
        </div>
      </div>
    </div>
  );
}
