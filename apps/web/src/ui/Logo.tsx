import { useTheme } from "../theme";
import { cn } from "./cn";

type Props = {
  /** Visual height of the horizontal logo, in px. The wrapper auto-sizes
   *  width via the image's natural aspect (~1.87–1.89× height). */
  size?: number;
  /** Subtle cyan drop-shadow for hero placement. */
  glow?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
};

/**
 * Brand mark. Two source PNGs:
 *
 *   /logo.png        — dark-theme variant. Supplied portrait (525×979),
 *                      reads horizontally only after CSS rotate(90deg).
 *                      Aspect after rotation: 979/525 ≈ 1.87.
 *
 *   /logo-light.png  — light-theme variant (1278×676). Already
 *                      horizontal, no rotation, slightly different
 *                      colour treatment that reads on white bg.
 *                      Aspect: 1278/676 ≈ 1.89.
 *
 * The two ratios are close enough (~1%) that we can use one wrapper-
 * sizing constant — visual jitter on theme toggle is imperceptible.
 */
const VISUAL_W_OVER_H = 1.88;

export function Logo({ size = 96, glow = false, className }: Props) {
  const [theme] = useTheme();
  const w = Math.round(size * VISUAL_W_OVER_H);
  const isDark = theme === "dark";
  const src = isDark ? "/logo.png" : "/logo-light.png";
  return (
    <div
      className={cn("relative inline-block", className)}
      style={{ width: w, height: size }}
      aria-label="CREO Metrics"
      role="img"
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "absolute top-1/2 left-1/2 select-none",
          glow && "drop-shadow-[0_8px_24px_rgba(47,182,255,0.45)]",
        )}
        style={
          isDark
            ? {
                // Dark variant ships portrait — rotate 90° so it reads
                // horizontally. Pre-rotation height = post-rotation width
                // = wrapper.width; `width: auto` lets the PNG's natural
                // aspect drive the visible height after rotation.
                height: w,
                width: "auto",
                transform: "translate(-50%, -50%) rotate(90deg)",
                transformOrigin: "center",
              }
            : {
                // Light variant is already horizontal — just centre + scale.
                width: w,
                height: "auto",
                transform: "translate(-50%, -50%)",
                transformOrigin: "center",
              }
        }
      />
    </div>
  );
}
