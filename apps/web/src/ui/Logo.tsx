import { cn } from "./cn";

type Props = {
  /** Visual height of the horizontal logo, in px. The wrapper auto-sizes
   *  width via the image's natural aspect (979:525 → ~1.87× height). */
  size?: number;
  /** Subtle cyan drop-shadow for hero placement. */
  glow?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
};

/** Native PNG aspect ratio after rotating −90° to read horizontally. */
const VISUAL_W_OVER_H = 979 / 525;

/**
 * Static brand mark. Source PNG (public/logo.png) was supplied by the user
 * in portrait orientation (525×979). The CREO METRICS lockup reads
 * horizontally only after a −90° rotation, so we rotate via CSS instead
 * of asking for a re-export.
 *
 * Rotated bounding box:
 *   inner img is sized portrait (height = wrapper width). After CSS
 *   rotate(-90deg), the visual occupies wrapper.width × wrapper.height.
 *   The wrapper itself is positioned in normal flow.
 */
export function Logo({ size = 96, glow = false, className }: Props) {
  const w = Math.round(size * VISUAL_W_OVER_H);
  return (
    <div
      className={cn("relative inline-block", className)}
      style={{ width: w, height: size }}
      aria-label="CREO Metrics"
      role="img"
    >
      <img
        src="/logo.png"
        alt=""
        draggable={false}
        className={cn(
          "absolute top-1/2 left-1/2 select-none",
          glow && "drop-shadow-[0_8px_24px_rgba(47,182,255,0.45)]",
        )}
        style={{
          // pre-rotation height = post-rotation width = wrapper.width;
          // width:auto preserves the PNG's natural aspect, which after
          // rotation gives wrapper.height visible.
          height: w,
          width: "auto",
          transform: "translate(-50%, -50%) rotate(90deg)",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}
