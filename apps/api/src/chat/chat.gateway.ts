import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  type RevealStatus,
  SendMessageInput,
  type SendMessageAck,
  WsClientEvents,
  WsServerEvents,
} from "@tg-app-meet/shared";
import { Server, Socket } from "socket.io";
import { checkRateLimit } from "../common/rate-limit";
import { env } from "../env";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma.service";
import { ChatService } from "./chat.service";

type AuthedSocket = Socket & {
  data: { userId?: string };
};

const corsOrigin = env.WEB_ORIGIN === "*" ? true : env.WEB_ORIGIN;

@WebSocketGateway({
  namespace: "chat",
  cors: { origin: corsOrigin, credentials: corsOrigin !== true },
})
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  // userId → set of currently-connected socket ids. A user may have multiple
  // sockets (Mini App reopened in a second tab, reconnects, etc), so we
  // track every socket and only consider the user offline when the set
  // empties. Used by NotificationsService to decide whether to push a DM.
  private readonly online = new Map<string, Set<string>>();

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    // Auth middleware runs BEFORE the client receives `connect`. Rejecting here
    // surfaces as `connect_error` on the client — exactly what we want for
    // missing/invalid JWT.
    server.use(async (socket: AuthedSocket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error("UNAUTHORIZED"));
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
        if (!payload?.sub) return next(new Error("UNAUTHORIZED"));

        // Mirror the REST guard: refuse banned/deleted accounts at the
        // handshake. Otherwise a banned user could keep their existing
        // socket open and continue chatting until disconnect.
        const status = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, deletedAt: true, bannedAt: true },
        });
        if (!status) return next(new Error("UNAUTHORIZED"));
        if (status.deletedAt) return next(new Error("ACCOUNT_DELETED"));
        if (status.bannedAt) return next(new Error("BANNED"));

        socket.data.userId = payload.sub;
        // Per-user room: lets the server push events (e.g. reveal:updated)
        // to a specific user regardless of which chat room they joined.
        await socket.join(userRoom(payload.sub));
        this.markOnline(payload.sub, socket.id);
        next();
      } catch (e) {
        this.logger.warn(
          `[chat] ws auth failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
        next(new Error("UNAUTHORIZED"));
      }
    });
  }

  handleDisconnect(client: AuthedSocket): void {
    const userId = client.data.userId;
    if (!userId) return;
    this.markOffline(userId, client.id);
  }

  isOnline(userId: string): boolean {
    const set = this.online.get(userId);
    return !!set && set.size > 0;
  }

  emitRevealUpdated(userId: string, status: RevealStatus): void {
    this.server.to(userRoom(userId)).emit(WsServerEvents.RevealUpdated, status);
  }

  private markOnline(userId: string, socketId: string): void {
    let set = this.online.get(userId);
    if (!set) {
      set = new Set();
      this.online.set(userId, set);
    }
    set.add(socketId);
  }

  private markOffline(userId: string, socketId: string): void {
    const set = this.online.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.online.delete(userId);
  }

  @SubscribeMessage(WsClientEvents.Join)
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId?: string },
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId || !body?.chatId) {
      client.emit(WsServerEvents.Error, { code: "BAD_REQUEST", message: "no chatId" });
      return;
    }
    const ok = await this.chat.isParticipant(userId, body.chatId);
    if (!ok) {
      client.emit(WsServerEvents.Error, {
        code: "FORBIDDEN",
        message: "not a participant",
      });
      return;
    }
    await client.join(roomFor(body.chatId));
    client.emit(WsServerEvents.Joined, { chatId: body.chatId });
  }

  @SubscribeMessage(WsClientEvents.Leave)
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId?: string },
  ): Promise<void> {
    if (body?.chatId) await client.leave(roomFor(body.chatId));
  }

  @SubscribeMessage(WsClientEvents.Send)
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<SendMessageAck> {
    const userId = client.data.userId;
    if (!userId) return { error: "UNAUTHORIZED" };

    const parsed = SendMessageInput.safeParse(body);
    if (!parsed.success) return { error: "BAD_REQUEST" };

    if (!checkRateLimit(`ws-msg:${userId}`, 20, 60_000)) {
      return { error: "RATE_LIMITED" };
    }

    try {
      const { recipientId, ...ack } = await this.chat.sendMessage(
        userId,
        parsed.data,
      );
      // Broadcast to others in the room; sender already gets the message via ack.
      client
        .to(roomFor(parsed.data.chatId))
        .emit(WsServerEvents.MessageNew, ack.message);

      // Push DM only when the recipient has no live socket. Fire-and-forget:
      // the bot API call shouldn't block the sender's ack.
      if (!this.isOnline(recipientId)) {
        void this.notifications
          .notifyMessage(
            recipientId,
            ack.message.senderAnonId,
            parsed.data.chatId,
            ack.message.content,
          )
          .catch(() => {
            /* swallowed inside the service too — keep belt+braces */
          });
      }

      return ack;
    } catch (e) {
      const code =
        e instanceof Error && /forbidden/i.test(e.message)
          ? "FORBIDDEN"
          : "INTERNAL";
      return { error: code };
    }
  }
}

function roomFor(chatId: string): string {
  return `chat:${chatId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}
