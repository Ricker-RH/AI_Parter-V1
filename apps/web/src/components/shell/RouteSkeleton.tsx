export type RouteSkeletonVariant = "feed" | "list" | "detail";

const cardCounts: Record<RouteSkeletonVariant, number> = {
  feed: 3,
  list: 5,
  detail: 1,
};

function SkeletonCard({ variant }: { variant: RouteSkeletonVariant }) {
  return (
    <div aria-hidden="true" className="route-skeleton-card">
      <div className="route-skeleton-avatar" />
      <div className="route-skeleton-card-content">
        <div className="route-skeleton-line route-skeleton-line--short" />
        <div className="route-skeleton-line" />
        <div className="route-skeleton-line route-skeleton-line--medium" />
        {variant === "detail" ? <div className="route-skeleton-media" /> : null}
      </div>
    </div>
  );
}

export function RouteSkeleton({ variant }: { variant: RouteSkeletonVariant }) {
  return (
    <main
      aria-busy="true"
      aria-label={`Loading ${variant}`}
      className={`route-skeleton route-skeleton--${variant}`}
      role="status"
    >
      <div aria-hidden="true" className="route-skeleton-header">
        <div className="route-skeleton-line route-skeleton-line--title" />
        <div className="route-skeleton-line route-skeleton-line--short" />
      </div>
      <div className="route-skeleton-content">
        {Array.from({ length: cardCounts[variant] }, (_, index) => (
          <SkeletonCard key={index} variant={variant} />
        ))}
      </div>
    </main>
  );
}
