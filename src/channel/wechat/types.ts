export interface BaseInfo {
  channel_version?: string;
}

export const MessageType = {
  NONE: 0,
  USER: 1,
  BOT: 2
} as const;

export const MessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2
} as const;

export const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5
} as const;

export const TypingStatus = {
  TYPING: 1,
  CANCEL: 2
} as const;

export interface TextItem {
  text?: string | undefined;
}

export interface VoiceItem {
  text?: string | undefined;
}

export interface RefMessage {
  message_item?: MessageItem | undefined;
  title?: string | undefined;
}

export interface MessageItem {
  type?: number | undefined;
  text_item?: TextItem | undefined;
  voice_item?: VoiceItem | undefined;
  ref_msg?: RefMessage | undefined;
}

export interface WeChatMessage {
  message_id?: number | undefined;
  from_user_id?: string | undefined;
  to_user_id?: string | undefined;
  client_id?: string | undefined;
  create_time_ms?: number | undefined;
  session_id?: string | undefined;
  message_type?: number | undefined;
  message_state?: number | undefined;
  item_list?: MessageItem[] | undefined;
  context_token?: string | undefined;
}

export interface GetUpdatesReq {
  get_updates_buf?: string | undefined;
}

export interface GetUpdatesResp {
  ret?: number | undefined;
  errcode?: number | undefined;
  errmsg?: string | undefined;
  msgs?: WeChatMessage[] | undefined;
  get_updates_buf?: string | undefined;
  longpolling_timeout_ms?: number | undefined;
}

export interface SendMessageReq {
  msg?: WeChatMessage | undefined;
}

export interface GetConfigResp {
  ret?: number | undefined;
  errmsg?: string | undefined;
  typing_ticket?: string | undefined;
}

export interface SendTypingReq {
  ilink_user_id?: string | undefined;
  typing_ticket?: string | undefined;
  status?: number | undefined;
}

export interface QrCodeResponse {
  qrcode?: string | undefined;
  qrcode_img_content?: string | undefined;
}

export interface QrStatusResponse {
  status?: "wait" | "scaned" | "confirmed" | "expired" | "scaned_but_redirect" | undefined;
  bot_token?: string | undefined;
  ilink_bot_id?: string | undefined;
  baseurl?: string | undefined;
  ilink_user_id?: string | undefined;
  redirect_host?: string | undefined;
}
