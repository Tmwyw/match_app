import { cn } from "./cn";

type Props = {
  /** Tailwind sizing — caller controls the box; the image scales to fit. */
  className?: string;
  /** Subtle drop-shadow for hero placement. */
  glow?: boolean;
};

/**
 * Static brand mark. Source PNG is in /public/logo.png (served at /logo.png
 * by the prod nginx and by Vite in dev). No SVG version yet — the logo is
 * a 3D rendered piece, so a flat re-vectorisation would lose the shading.
 */
export function Logo({ className, glow = false }: Props) {
  return (
    <img
      src="/logo.png"
      alt="CREO Metrics"
      draggable={false}
      className={cn(
        "select-none object-contain",
        glow && "drop-shadow-[0_8px_24px_rgba(47,182,255,0.45)]",
        className,
      )}
    />
  );
}
