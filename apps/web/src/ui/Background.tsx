/**
 * Static gradient background. Rendered as a fixed div with positive z-index
 * so it's guaranteed to paint regardless of the host webview's stacking
 * quirks. App content sits at z-10 above it. We tried html bg, body::before
 * and negative z-index — Telegram's webview painted black over all of them.
 */
export function Background() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: `
          radial-gradient(ellipse 90% 60% at 20% 0%, rgba(123, 97, 255, 0.55), transparent 60%),
          radial-gradient(ellipse 80% 60% at 100% 100%, rgba(20, 184, 166, 0.40), transparent 60%),
          radial-gradient(ellipse 100% 80% at 50% 100%, rgba(56, 189, 248, 0.22), transparent 70%),
          linear-gradient(180deg, #06080d 0%, #03050a 100%)
        `,
      }}
    />
  );
}
