// Provider-agnostic types used by the UI. Both the Duffel and demo providers
// normalise their data into these shapes.

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export interface Place {
  code: string; // IATA code
  name: string; // Airport name
  city: string;
  country: string;
  type: "airport" | "city";
}

export interface SearchSlice {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
}

export interface SearchParams {
  slices: SearchSlice[];
  adults: number;
  children: number; // 2-11
  infants: number; // under 2
  cabin: CabinClass;
}

export interface Carrier {
  code: string;
  name: string;
  logo: string;
}

export interface Endpoint {
  code: string;
  name: string;
  city: string;
  terminal?: string | null;
}

export interface Segment {
  id: string;
  origin: Endpoint;
  destination: Endpoint;
  departingAt: string; // local ISO without zone, e.g. 2026-10-20T08:15:00
  arrivingAt: string;
  durationMin: number;
  carrier: Carrier;
  operatingCarrier?: Carrier | null;
  flightNumber: string;
  aircraft: string;
  cabin: string;
  checkedBags: number; // per adult
  carryOnBags: number;
}

export interface Slice {
  id: string;
  origin: Endpoint;
  destination: Endpoint;
  departingAt: string;
  arrivingAt: string;
  durationMin: number;
  stops: number;
  segments: Segment[];
  fareBrand: string | null;
}

export interface Money {
  amount: number; // display currency
  currency: string; // display currency
}

export interface OfferPassenger {
  id: string;
  type: "adult" | "child" | "infant_without_seat";
  age?: number;
}

export interface Conditions {
  refundable: boolean | null;
  refundPenalty: Money | null;
  changeable: boolean | null;
  changePenalty: Money | null;
}

export interface Offer {
  id: string;
  total: Money; // display, includes service fee
  base: Money | null;
  tax: Money | null;
  serviceFee: Money;
  // Exact amount & currency to pay the supplier. Never shown converted.
  supplierAmount: string;
  supplierCurrency: string;
  owner: Carrier;
  slices: Slice[];
  passengers: OfferPassenger[];
  conditions: Conditions;
  expiresAt: string | null;
  requiresDocuments: boolean;
  fareBrand: string;
  itineraryKey: string; // same flights => same key; used to group fare brands
  checkedBags: number;
  carryOnBags: number;
}

export interface ItineraryGroup {
  key: string;
  slices: Slice[];
  owner: Carrier;
  fares: Offer[]; // sorted by price
  cheapest: Offer;
}

export interface BaggageService {
  id: string;
  label: string;
  price: Money;
  supplierAmount: string;
  maxQuantity: number;
  passengerIds: string[];
  segmentIds: string[];
}

export type SeatElementType =
  | "seat"
  | "empty"
  | "exit_row"
  | "lavatory"
  | "galley"
  | "closet"
  | "bassinet"
  | "stairs"
  | "restricted_seat_general";

export interface SeatService {
  id: string;
  passengerId: string;
  price: Money;
  supplierAmount: string;
}

export interface SeatElement {
  type: SeatElementType;
  designator?: string;
  services: SeatService[]; // empty => unavailable
  disclosures?: string[];
}

export interface SeatRow {
  sections: { elements: SeatElement[] }[];
}

export interface SeatMap {
  id: string;
  segmentId: string;
  sliceId: string;
  cabins: { cabinClass: string; aisles: number; rows: SeatRow[] }[];
}

export interface OfferDetails {
  offer: Offer;
  baggage: BaggageService[];
}

export interface PassengerInput {
  id: string; // offer passenger id
  type: OfferPassenger["type"];
  title: "mr" | "ms" | "mrs" | "miss" | "dr";
  gender: "m" | "f";
  givenName: string;
  familyName: string;
  bornOn: string;
  email: string;
  phone: string;
  infantPassengerId?: string;
  passportNumber?: string;
  passportCountry?: string;
  passportExpiry?: string;
}

export interface SelectedService {
  id: string;
  quantity: number;
  supplierAmount: string; // unit amount
  displayAmount: number; // unit amount in display currency
  label: string;
}

export interface CreateOrderInput {
  offerId: string;
  passengers: PassengerInput[];
  services: SelectedService[];
  contact: { email: string; phone: string };
}

export interface Order {
  id: string;
  bookingReference: string;
  status: "confirmed" | "pending";
  createdAt: string;
  total: Money;
  supplierAmount: string;
  supplierCurrency: string;
  slices: Slice[];
  owner: Carrier;
  passengers: { name: string; type: string }[];
  services: { label: string; quantity: number }[];
  contactEmail: string;
  emailSent?: boolean;
  live: boolean;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
