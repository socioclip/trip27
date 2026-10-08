import type { Place } from "./types";

// Compact airport list used for demo mode and as the instant suggestions list.
// [code, airport name, city, country, lat, lon, utcOffsetHours]
type Row = [string, string, string, string, number, number, number];

const ROWS: Row[] = [
  ["DXB", "Dubai International", "Dubai", "United Arab Emirates", 25.253, 55.365, 4],
  ["DWC", "Al Maktoum International", "Dubai", "United Arab Emirates", 24.896, 55.161, 4],
  ["AUH", "Zayed International", "Abu Dhabi", "United Arab Emirates", 24.433, 54.651, 4],
  ["SHJ", "Sharjah International", "Sharjah", "United Arab Emirates", 25.329, 55.517, 4],
  ["RKT", "Ras Al Khaimah International", "Ras Al Khaimah", "United Arab Emirates", 25.613, 55.939, 4],
  ["RUH", "King Khalid International", "Riyadh", "Saudi Arabia", 24.958, 46.699, 3],
  ["JED", "King Abdulaziz International", "Jeddah", "Saudi Arabia", 21.68, 39.157, 3],
  ["DMM", "King Fahd International", "Dammam", "Saudi Arabia", 26.471, 49.798, 3],
  ["MED", "Prince Mohammad bin Abdulaziz", "Madinah", "Saudi Arabia", 24.553, 39.705, 3],
  ["DOH", "Hamad International", "Doha", "Qatar", 25.273, 51.608, 3],
  ["BAH", "Bahrain International", "Manama", "Bahrain", 26.271, 50.634, 3],
  ["KWI", "Kuwait International", "Kuwait City", "Kuwait", 29.227, 47.969, 3],
  ["MCT", "Muscat International", "Muscat", "Oman", 23.593, 58.284, 4],
  ["AMM", "Queen Alia International", "Amman", "Jordan", 31.723, 35.993, 3],
  ["BEY", "Beirut–Rafic Hariri International", "Beirut", "Lebanon", 33.821, 35.488, 3],
  ["CAI", "Cairo International", "Cairo", "Egypt", 30.122, 31.406, 3],
  ["HRG", "Hurghada International", "Hurghada", "Egypt", 27.178, 33.799, 3],
  ["CMN", "Mohammed V International", "Casablanca", "Morocco", 33.367, -7.59, 1],
  ["RAK", "Marrakesh Menara", "Marrakesh", "Morocco", 31.607, -8.036, 1],
  ["IST", "Istanbul Airport", "Istanbul", "Türkiye", 41.275, 28.752, 3],
  ["SAW", "Sabiha Gökçen International", "Istanbul", "Türkiye", 40.898, 29.309, 3],
  ["AYT", "Antalya Airport", "Antalya", "Türkiye", 36.898, 30.8, 3],
  ["TBS", "Tbilisi International", "Tbilisi", "Georgia", 41.669, 44.955, 4],
  ["GYD", "Heydar Aliyev International", "Baku", "Azerbaijan", 40.467, 50.047, 4],
  ["LHR", "Heathrow", "London", "United Kingdom", 51.47, -0.454, 0],
  ["LGW", "Gatwick", "London", "United Kingdom", 51.153, -0.182, 0],
  ["MAN", "Manchester Airport", "Manchester", "United Kingdom", 53.354, -2.275, 0],
  ["CDG", "Charles de Gaulle", "Paris", "France", 49.01, 2.548, 1],
  ["AMS", "Schiphol", "Amsterdam", "Netherlands", 52.31, 4.768, 1],
  ["FRA", "Frankfurt Airport", "Frankfurt", "Germany", 50.038, 8.562, 1],
  ["MUC", "Munich Airport", "Munich", "Germany", 48.354, 11.786, 1],
  ["ZRH", "Zurich Airport", "Zurich", "Switzerland", 47.465, 8.549, 1],
  ["GVA", "Geneva Airport", "Geneva", "Switzerland", 46.238, 6.109, 1],
  ["VIE", "Vienna International", "Vienna", "Austria", 48.11, 16.57, 1],
  ["FCO", "Leonardo da Vinci–Fiumicino", "Rome", "Italy", 41.8, 12.239, 1],
  ["MXP", "Milan Malpensa", "Milan", "Italy", 45.63, 8.723, 1],
  ["MAD", "Adolfo Suárez Madrid–Barajas", "Madrid", "Spain", 40.472, -3.561, 1],
  ["BCN", "Josep Tarradellas Barcelona–El Prat", "Barcelona", "Spain", 41.297, 2.078, 1],
  ["ATH", "Athens International", "Athens", "Greece", 37.936, 23.947, 2],
  ["PRG", "Václav Havel Airport", "Prague", "Czechia", 50.101, 14.26, 1],
  ["JFK", "John F. Kennedy International", "New York", "United States", 40.641, -73.778, -5],
  ["EWR", "Newark Liberty International", "New York", "United States", 40.69, -74.174, -5],
  ["IAD", "Washington Dulles International", "Washington", "United States", 38.953, -77.456, -5],
  ["ORD", "O'Hare International", "Chicago", "United States", 41.978, -87.905, -6],
  ["LAX", "Los Angeles International", "Los Angeles", "United States", 33.942, -118.408, -8],
  ["SFO", "San Francisco International", "San Francisco", "United States", 37.621, -122.379, -8],
  ["YYZ", "Toronto Pearson", "Toronto", "Canada", 43.677, -79.625, -5],
  ["BOM", "Chhatrapati Shivaji Maharaj International", "Mumbai", "India", 19.09, 72.866, 5.5],
  ["DEL", "Indira Gandhi International", "Delhi", "India", 28.556, 77.1, 5.5],
  ["BLR", "Kempegowda International", "Bengaluru", "India", 13.199, 77.706, 5.5],
  ["HYD", "Rajiv Gandhi International", "Hyderabad", "India", 17.24, 78.429, 5.5],
  ["COK", "Cochin International", "Kochi", "India", 10.152, 76.402, 5.5],
  ["MAA", "Chennai International", "Chennai", "India", 12.99, 80.169, 5.5],
  ["KHI", "Jinnah International", "Karachi", "Pakistan", 24.906, 67.161, 5],
  ["LHE", "Allama Iqbal International", "Lahore", "Pakistan", 31.522, 74.404, 5],
  ["ISB", "Islamabad International", "Islamabad", "Pakistan", 33.549, 72.826, 5],
  ["DAC", "Hazrat Shahjalal International", "Dhaka", "Bangladesh", 23.843, 90.398, 6],
  ["CMB", "Bandaranaike International", "Colombo", "Sri Lanka", 7.181, 79.884, 5.5],
  ["MLE", "Velana International", "Malé", "Maldives", 4.192, 73.529, 5],
  ["KTM", "Tribhuvan International", "Kathmandu", "Nepal", 27.697, 85.359, 5.75],
  ["BKK", "Suvarnabhumi", "Bangkok", "Thailand", 13.69, 100.75, 7],
  ["HKT", "Phuket International", "Phuket", "Thailand", 8.113, 98.317, 7],
  ["KUL", "Kuala Lumpur International", "Kuala Lumpur", "Malaysia", 2.746, 101.71, 8],
  ["SIN", "Changi", "Singapore", "Singapore", 1.364, 103.991, 8],
  ["CGK", "Soekarno–Hatta International", "Jakarta", "Indonesia", -6.126, 106.656, 7],
  ["DPS", "Ngurah Rai International", "Bali", "Indonesia", -8.748, 115.167, 8],
  ["MNL", "Ninoy Aquino International", "Manila", "Philippines", 14.509, 121.02, 8],
  ["HKG", "Hong Kong International", "Hong Kong", "Hong Kong", 22.308, 113.918, 8],
  ["PEK", "Beijing Capital International", "Beijing", "China", 40.08, 116.585, 8],
  ["PVG", "Shanghai Pudong International", "Shanghai", "China", 31.144, 121.808, 8],
  ["ICN", "Incheon International", "Seoul", "South Korea", 37.46, 126.441, 9],
  ["NRT", "Narita International", "Tokyo", "Japan", 35.772, 140.393, 9],
  ["HND", "Haneda", "Tokyo", "Japan", 35.549, 139.78, 9],
  ["SYD", "Sydney Kingsford Smith", "Sydney", "Australia", -33.94, 151.175, 10],
  ["MEL", "Melbourne Airport", "Melbourne", "Australia", -37.669, 144.841, 10],
  ["NBO", "Jomo Kenyatta International", "Nairobi", "Kenya", -1.319, 36.928, 3],
  ["ADD", "Bole International", "Addis Ababa", "Ethiopia", 8.978, 38.799, 3],
  ["JNB", "O. R. Tambo International", "Johannesburg", "South Africa", -26.139, 28.246, 2],
  ["LOS", "Murtala Muhammed International", "Lagos", "Nigeria", 6.577, 3.321, 1],
  ["ZNZ", "Abeid Amani Karume International", "Zanzibar", "Tanzania", -6.222, 39.225, 3],
];

export interface AirportGeo {
  code: string;
  lat: number;
  lon: number;
  tz: number;
}

export const AIRPORTS: (Place & { lat: number; lon: number; tz: number })[] = ROWS.map(
  ([code, name, city, country, lat, lon, tz]) => ({ code, name, city, country, type: "airport", lat, lon, tz })
);

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

// Metro/city codes that cover several airports.
export const CITY_CODES: Record<string, { city: string; country: string; airports: string[] }> = {
  LON: { city: "London", country: "United Kingdom", airports: ["LHR", "LGW"] },
  NYC: { city: "New York", country: "United States", airports: ["JFK", "EWR"] },
  TYO: { city: "Tokyo", country: "Japan", airports: ["HND", "NRT"] },
};

export function airport(code: string) {
  return BY_CODE.get(code.toUpperCase());
}

export function searchLocalAirports(q: string, limit = 8): Place[] {
  const s = q.trim().toLowerCase();
  if (!s) return POPULAR.map((c) => BY_CODE.get(c)!).filter(Boolean).slice(0, limit);
  const scored: { p: Place; score: number }[] = [];
  for (const a of AIRPORTS) {
    let score = 0;
    if (a.code.toLowerCase() === s) score = 100;
    else if (a.city.toLowerCase().startsWith(s)) score = 80;
    else if (a.name.toLowerCase().startsWith(s)) score = 60;
    else if (a.city.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)) score = 40;
    else if (a.country.toLowerCase().startsWith(s)) score = 30;
    if (score) scored.push({ p: { code: a.code, name: a.name, city: a.city, country: a.country, type: "airport" }, score });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export const POPULAR = ["DXB", "AUH", "SHJ", "RUH", "JED", "DOH", "CAI", "IST", "LHR", "BOM", "KHI", "BKK"];

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
