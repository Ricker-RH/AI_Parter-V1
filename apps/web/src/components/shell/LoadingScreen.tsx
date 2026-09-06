import {BrandLoader} from './BrandLoader'

export function LoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading AIFANS"
      aria-live="polite"
      className="loading-screen"
      role="status"
    >
      <BrandLoader decorative />
    </div>
  );
}
