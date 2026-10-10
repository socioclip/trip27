import type { CreateOrderInput, Offer, OfferDetails, Order, Place, SearchParams, SeatMap } from "../types";

export interface FlightProvider {
  name: "duffel" | "demo" | "jinko";
  live: boolean;
  searchPlaces(query: string): Promise<Place[]>;
  search(params: SearchParams): Promise<Offer[]>;
  getOffer(offerId: string): Promise<OfferDetails>;
  getSeatMaps(offerId: string): Promise<SeatMap[]>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;
  /** All orders whose contact email matches (lower-cased), newest first. */
  listOrders(email: string): Promise<Order[]>;
}
