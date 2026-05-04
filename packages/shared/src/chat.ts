import { z } from "zod";

export const SendMessageInput = z.object({
  chatId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const ChatMessageDTO = z.object({
  id: z.string(),
  chatId: z.string(),
  senderAnonId: z.string(),
  senderUserId: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessageDTO = z.infer<typeof ChatMessageDTO>;

export const WS_EVENTS = {
  MessageSend: "message:send",
  MessageNew: "message:new",
  ChatRead: "chat:read",
  MessageRejected: "message:rejected",
} as const;
export type WSEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
