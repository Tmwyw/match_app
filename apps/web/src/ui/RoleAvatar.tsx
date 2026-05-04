import { Briefcase, Building2 } from "lucide-react";
import type { Role } from "@tg-app-meet/shared";
import { cn } from "./cn";

type Size = "sm" | "md" | "lg" | "xl";

const containerSize: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
};

const iconSize: Record<Size, number> = {
  sm: 16,
  md: 22,
  lg: 30,
  xl: 44,
};

const roleBg: Record<Role, string> = {
  BUYER: "bg-role-buyer",
  OWNER: "bg-role-owner",
};

export function RoleAvatar({
  role,
  size = "md",
  className,
}: {
  role: Role;
  size?: Size;
  className?: string;
}) {
  const Icon = role === "BUYER" ? Briefcase : Building2;
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center text-white shrink-0",
        containerSize[size],
        roleBg[role],
        className,
      )}
    >
      <Icon size={iconSize[size]} strokeWidth={2.2} />
    </div>
  );
}
