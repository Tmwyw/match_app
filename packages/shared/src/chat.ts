import { z } from "zod";

export const ChatMessage = z.object({
  id: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  senderAnonId: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const SendMessageInput = z.object({
  chatId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

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

export const WsServerEvents = {
  MessageNew: "message:new",
  Joined: "chat:joined",
  Error: "chat:error",
} as const;

export const WsClientEvents = {
  Join: "chat:join",
  Leave: "chat:leave",
  Send: "message:send",
} as const;

export type WsServerEvent =
  (typeof WsServerEvents)[keyof typeof WsServerEvents];
export type WsClientEvent =
  (typeof WsClientEvents)[keyof typeof WsClientEvents];
