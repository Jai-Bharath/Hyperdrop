export default function SkeletonRow() {
  return (
    <div className="flex items-center gap-3.5 px-3.5 py-3 rounded-2xl animate-pulse">
      {/* Avatar skeleton */}
      <div className="h-11 w-11 rounded-2xl bg-surface-light shrink-0" />
      
      {/* Content skeleton */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-28 rounded-md bg-surface-light" />
          <div className="h-2.5 w-8 rounded-md bg-surface-light" />
        </div>
        <div className="h-2.5 w-40 rounded-md bg-surface-light opacity-60" />
      </div>
    </div>
  );
}
