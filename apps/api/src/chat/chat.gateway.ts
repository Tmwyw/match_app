import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
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
import { env } from "../env";
import { ChatService } from "./chat.service";

type AuthedSocket = Socket & {
  data: { userId?: string };
};

const corsOrigin = env.WEB_ORIGIN === "*" ? true : env.WEB_ORIGIN;

@WebSocketGateway({
  namespace: "chat",
  cors: { origin: corsOrigin, credentials: corsOrigin !== true },
})
export class ChatGateway implements OnGatewayInit {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
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
        socket.data.userId = payload.sub;
        // Per-user room: lets the server push events (e.g. reveal:updated)
        // to a specific user regardless of which chat room they joined.
        await socket.join(userRoom(payload.sub));
        next();
      } catch (e) {
        this.logger.warn(
          `[chat] ws auth failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
        next(new Error("UNAUTHORIZED"));
      }
    });
  }

  emitRevealUpdated(userId: string, status: RevealStatus): void {
    this.server.to(userRoom(userId)).emit(WsServerEvents.RevealUpdated, status);
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

    try {
      const result = await this.chat.sendMessage(userId, parsed.data);
      // Broadcast to others in the room; sender already gets the message via ack.
      client
        .to(roomFor(parsed.data.chatId))
        .emit(WsServerEvents.MessageNew, result.message);
      return result;
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
