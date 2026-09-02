import {Logo} from '@aifans/ui'

export function LoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading AIFANS"
      aria-live="polite"
      className="loading-screen"
      role="status"
    >
      <Logo className="loading-screen-mark" showWordmark={false} />
    </div>
  );
}
