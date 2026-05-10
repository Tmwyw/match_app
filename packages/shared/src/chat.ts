import { z } from "zod";

export const ChatMessage = z.object({
  id: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  senderAnonId: z.string(),
  /** Sender's chosen displayName, or null if not set. UI prefers this over
   *  senderAnonId. Joined fresh from User per fetch (same as anonId). */
  senderDisplayName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  readAt: z.string().nullable(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const SendMessageInput = z.object({
  chatId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const EditMessageInput = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
export type EditMessageInput = z.infer<typeof EditMessageInput>;

export const MarkReadInput = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
});
export type MarkReadInput = z.infer<typeof MarkReadInput>;

export const TypingInput = z.object({
  chatId: z.string().min(1),
});
export type TypingInput = z.infer<typeof TypingInput>;

export const SendMessageResult = z.object({
  message: ChatMessage,
  filtered: z.boolean(),
});
export type SendMessageResult = z.infer<typeof SendMessageResult>;

export const SendMessageError = z.object({
  error: z.string(),
});
export type SendMessageError = z.infer<typeof SendMessageError>;

export const SendMessageAck = z.union([SendMessageResult, SendMessageError]);
export type SendMessageAck = z.infer<typeof SendMessageAck>;

export const ChatHistoryResponse = z.object({
  messages: z.array(ChatMessage),
  hasMore: z.boolean(),
});
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponse>;

// Server → client realtime payloads.
export const TypingPayload = z.object({
  chatId: z.string(),
  userId: z.string(),
  /** ISO timestamp — show "печатает..." until this moment. */
  until: z.string(),
});
export type TypingPayload = z.infer<typeof TypingPayload>;

export const PresencePayload = z.object({
  userId: z.string(),
  online: z.boolean(),
  lastSeen: z.string().nullable(),
});
export type PresencePayload = z.infer<typeof PresencePayload>;

export const PresenceResponse = z.object({
  online: z.boolean(),
  lastSeen: z.string().nullable(),
});
export type PresenceResponse = z.infer<typeof PresenceResponse>;

/**
 * Batched read-receipt payload. We mark all unread inbound messages
 * up-to-and-including `messageId` as read in one round-trip, so the
 * server emits a single event with the affected ids and the common
 * timestamp instead of N separate events.
 */
export const MessageReadPayload = z.object({
  chatId: z.string(),
  messageIds: z.array(z.string()),
  readAt: z.string(),
});
export type MessageReadPayload = z.infer<typeof MessageReadPayload>;

export const WsServerEvents = {
  MessageNew: "message:new",
  MessageEdited: "message:edited",
  MessageRead: "message:read",
  Typing: "chat:typing",
  Presence: "user:presence",
  Joined: "chat:joined",
  Error: "chat:error",
  RevealUpdated: "reveal:updated",
  /** Fired into the recipient's user-room when someone LIKE-swipes them
   *  without producing a mutual match yet. Lets the FE bump the
   *  inbound-likes badge instantly instead of waiting for the next
   *  60-second poll of /me/likes/count. */
  LikesIncoming: "likes:incoming",
} as const;

export const WsClientEvents = {
  Join: "chat:join",
  Leave: "chat:leave",
  Send: "message:send",
  Edit: "message:edit",
  MarkRead: "message:read",
  Typing: "chat:typing",
} as const;

export type WsServerEvent =
  (typeof WsServerEvents)[keyof typeof WsServerEvents];
export type WsClientEvent =
  (typeof WsClientEvents)[keyof typeof WsClientEvents];
