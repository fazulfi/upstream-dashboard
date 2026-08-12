export function Skeleton({ w = 120, h = 14, style = {} }) {
  return (
    <div
      aria-hidden="true"
      className="skeleton"
      style={{ width: w, height: h, ...style }}
    />
  );
}

export function SkeletonBlock({ children, loading, rows = 4, skeleton }) {
  if (!loading) return children;
  return (
    <div role="status" aria-label="Loading" className="skeleton-wrap">
      {skeleton || (
        Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-row">
            <Skeleton w="60%" h={13} />
            <Skeleton w="30%" h={13} />
          </div>
        ))
      )}
    </div>
  );
}
