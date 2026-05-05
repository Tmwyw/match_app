import { Heart } from "lucide-react";
import type { Role } from "@tg-app-meet/shared";
import { Button } from "./Button";
import { RoleAvatar } from "./RoleAvatar";

type Props = {
  myRole: Role;
  otherRole: Role;
  otherAnonId: string;
  onChat: () => void;
  onContinue: () => void;
};

export function MatchOverlay({
  myRole,
  otherRole,
  otherAnonId,
  onChat,
  onContinue,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="rounded-card glass-strong glass-highlight p-6 max-w-sm w-full text-center flex flex-col gap-5 shadow-action">
        <div className="flex items-center justify-center gap-4">
          <RoleAvatar role={myRole} size="lg" />
          <Heart className="text-accent" size={32} fill="currentColor" />
          <RoleAvatar role={otherRole} size="lg" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">It's a match!</h2>
          <p className="text-tg-hint text-sm">
            Вы оба лайкнули друг друга. Дальше — анонимный чат с {otherAnonId}.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={onChat} fullWidth>
            Перейти в чат
          </Button>
          <Button variant="secondary" onClick={onContinue} fullWidth>
            Продолжить искать
          </Button>
        </div>
      </div>
    </div>
  );
}
