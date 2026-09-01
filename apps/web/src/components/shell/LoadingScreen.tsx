export function LoadingScreen() {
  return (
    <div
      aria-label="Loading AIFANS"
      aria-live="polite"
      className="loading-screen"
      role="status"
    >
      <span aria-hidden="true" className="loading-screen-wordmark">
        AIFANS
      </span>
    </div>
  );
}
