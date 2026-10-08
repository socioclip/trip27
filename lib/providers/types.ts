import type { CreateOrderInput, Offer, OfferDetails, Order, Place, SearchParams, SeatMap } from "../types";

export interface FlightProvider {
  name: "duffel" | "demo";
  live: boolean;
  searchPlaces(query: string): Promise<Place[]>;
  search(params: SearchParams): Promise<Offer[]>;
  getOffer(offerId: string): Promise<OfferDetails>;
  getSeatMaps(offerId: string): Promise<SeatMap[]>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;
}
