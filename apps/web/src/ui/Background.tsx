/**
 * Static gradient background. Rendered as a fixed div with positive z-index
 * so it's guaranteed to paint regardless of the host webview's stacking
 * quirks. App content sits at z-10 above it. We tried html bg, body::before
 * and negative z-index — Telegram's webview painted black over all of them.
 *
 * Gradient stops live in CSS vars so they auto-swap with the light/dark
 * theme. See `.app-bg-gradient` in styles.css.
 */
export function Background() {
  return (
    <div
      aria-hidden
      className="app-bg-gradient"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
