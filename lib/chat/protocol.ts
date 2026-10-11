// Wire format between the chat widget and /api/chat. Shared by client and server.
//
// The server is stateless: the browser keeps the conversation (Claude message
// history) and the fares the assistant has shown, and sends both back with each
// new message. Fares are referred to by short refs (F1, F2, …) so the model never
// has to carry long supplier offer IDs in its context.

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Offer } from "../types";

export type ChatMessage = MessageParam;

/** What a fare ref points at: the supplier offer ID and the search it came from (for checkout). */
export interface ChatRef {
  id: string;
  qs: string;
}

export interface FareOption {
  ref: string;
  brand: string;
  price: Offer["total"];
  checkedBags: number;
  refundable: boolean | null;
}

/** One itinerary shown as a card in the chat. */
export interface OfferCard {
  ref: string; // ref of the cheapest fare
  offer: Offer; // cheapest fare
  fares: FareOption[]; // every fare option on this itinerary, cheapest first
  qs: string;
  travellers: number;
}

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "status"; text: string }
  | { type: "offers"; cards: OfferCard[]; refs: Record<string, ChatRef>; total: number; searchUrl: string; mode: string }
  | { type: "refs"; refs: Record<string, ChatRef> }
  | { type: "checkout"; ref: string; url: string; offer: Offer; partner: boolean }
  | { type: "done"; messages: ChatMessage[] }
  | { type: "error"; message: string };

export interface ChatRequest {
  history: ChatMessage[];
  message: string;
  refs: Record<string, ChatRef>;
}

export const MAX_USER_MESSAGE = 1500;
