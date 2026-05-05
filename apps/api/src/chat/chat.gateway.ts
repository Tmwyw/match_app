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
  EditMessageInput,
  MarkReadInput,
  type MessageReadPayload,
  type PresencePayload,
  type RevealStatus,
  SendMessageInput,
  type SendMessageAck,
  TypingInput,
  type TypingPayload,
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

/** Server-side typing window. Clients should re-emit chat:typing periodically
 *  while the user is still typing, and stop when they pause. */
const TYPING_WINDOW_MS = 5_000;
/** Per-user debounce on edits (matches the message rate-limit). */
const EDIT_RATE_LIMIT = 20;
const EDIT_RATE_WINDOW_MS = 60_000;

@WebSocketGateway({
  namespace: "chat",
  cors: { origin: corsOrigin, credentials: corsOrigin !== true },
})
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  // userId → set of currently-connected socket ids. A user may have multiple
  // sockets (Mini App reopened in a second tab, reconnects, etc), so we
  // track every socket and only consider the user offline when the set
  // empties. Used by NotificationsService to decide whether to push a DM
  // and by presence fan-out to know transitions.
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
        const wasOffline = this.markOnline(payload.sub, socket.id);
        if (wasOffline) {
          // Only fan out presence on the actual offline→online transition;
          // a second tab opening shouldn't re-spam partners.
          void this.touchAndAnnouncePresence(payload.sub, true).catch(() => {
            /* presence is best-effort */
          });
        }
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
    const wentOffline = this.markOffline(userId, client.id);
    if (wentOffline) {
      void this.touchAndAnnouncePresence(userId, false).catch(() => {
        /* presence is best-effort */
      });
    }
  }

  isOnline(userId: string): boolean {
    const set = this.online.get(userId);
    return !!set && set.size > 0;
  }

  emitRevealUpdated(userId: string, status: RevealStatus): void {
    this.server.to(userRoom(userId)).emit(WsServerEvents.RevealUpdated, status);
  }

  /** True if this socket flipped the user from offline to online. */
  private markOnline(userId: string, socketId: string): boolean {
    let set = this.online.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.online.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  /** True if this disconnect emptied the user's socket set. */
  private markOffline(userId: string, socketId: string): boolean {
    const set = this.online.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.online.delete(userId);
      return true;
    }
    return false;
  }

  private async touchAndAnnouncePresence(
    userId: string,
    online: boolean,
  ): Promise<void> {
    // Stamp lastSeenAt on every transition (online or offline) so partners
    // querying GET /users/:id/presence later see the most recent moment
    // the user was active in the app.
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    });
    const partners = await this.chat.getPartnerIds(userId);
    if (partners.length === 0) return;
    const payload: PresencePayload = {
      userId,
      online,
      lastSeen: now.toISOString(),
    };
    for (const pid of partners) {
      this.server.to(userRoom(pid)).emit(WsServerEvents.Presence, payload);
    }
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
      const code = mapErrorToAck(e);
      return { error: code };
    }
  }

  @SubscribeMessage(WsClientEvents.Edit)
  async onEdit(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<SendMessageAck> {
    const userId = client.data.userId;
    if (!userId) return { error: "UNAUTHORIZED" };

    const parsed = EditMessageInput.safeParse(body);
    if (!parsed.success) return { error: "BAD_REQUEST" };

    if (!checkRateLimit(`ws-edit:${userId}`, EDIT_RATE_LIMIT, EDIT_RATE_WINDOW_MS)) {
      return { error: "RATE_LIMITED" };
    }

    try {
      const ack = await this.chat.editMessage(userId, parsed.data);
      // Broadcast to other participants (sender updates via ack).
      client
        .to(roomFor(parsed.data.chatId))
        .emit(WsServerEvents.MessageEdited, ack.message);
      return ack;
    } catch (e) {
      const code = mapErrorToAck(e);
      return { error: code };
    }
  }

  @SubscribeMessage(WsClientEvents.MarkRead)
  async onMarkRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: true } | { error: string }> {
    const userId = client.data.userId;
    if (!userId) return { error: "UNAUTHORIZED" };

    const parsed = MarkReadInput.safeParse(body);
    if (!parsed.success) return { error: "BAD_REQUEST" };

    try {
      const result = await this.chat.markRead(
        userId,
        parsed.data.chatId,
        parsed.data.messageId,
      );
      if (result) {
        const payload: MessageReadPayload = result;
        // Broadcast to the chat room (including the reader's own other
        // tabs/devices, if any). The sender uses this to flip ✓ → ✓✓; the
        // reader's own UI ignores the event since it already knows.
        this.server
          .to(roomFor(parsed.data.chatId))
          .emit(WsServerEvents.MessageRead, payload);
      }
      return { ok: true };
    } catch (e) {
      return { error: mapErrorToAck(e) };
    }
  }

  @SubscribeMessage(WsClientEvents.Typing)
  async onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) return;
    const parsed = TypingInput.safeParse(body);
    if (!parsed.success) return;

    // Cheap server-side throttle so one chatty client can't flood the room.
    // The frontend already debounces to ~once per 3s.
    if (!checkRateLimit(`ws-typing:${userId}`, 5, 5_000)) return;

    if (!(await this.chat.isParticipant(userId, parsed.data.chatId))) return;

    const payload: TypingPayload = {
      chatId: parsed.data.chatId,
      userId,
      until: new Date(Date.now() + TYPING_WINDOW_MS).toISOString(),
    };
    client.to(roomFor(parsed.data.chatId)).emit(WsServerEvents.Typing, payload);
  }
}

function roomFor(chatId: string): string {
  return `chat:${chatId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function mapErrorToAck(e: unknown): string {
  if (!(e instanceof Error)) return "INTERNAL";
  // GoneException → 410, used for the 15-min edit window.
  if (/EDIT_WINDOW_EXPIRED|gone/i.test(e.message)) return "GONE";
  if (/blocked/i.test(e.message)) return "BLOCKED";
  if (/forbidden|not_your_message/i.test(e.message)) return "FORBIDDEN";
  if (/not_found/i.test(e.message)) return "NOT_FOUND";
  return "INTERNAL";
}
