import { haversineMeters, metersToMiles } from "./geo";
import type { LatLng, RegionCode } from "./types";
import * as Location from "expo-location";
import { inferCountryFromCoords } from "./location";

export type NearbyPartsStore = {
  id: string;
  name: string;
  address: string;
  distanceLabel: string;
  latitude: number;
  longitude: number;
};

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
};

export async function fetchNearbyPartsStores(
  userCoords: LatLng,
  region: RegionCode,
  radiusMeters = 7000,
): Promise<NearbyPartsStore[]> {
  const query = `
[out:json][timeout:25];
(
  nwr(around:${radiusMeters},${userCoords.latitude},${userCoords.longitude})["shop"="car_parts"];
  nwr(around:${radiusMeters},${userCoords.latitude},${userCoords.longitude})["shop"="tyres"];
  nwr(around:${radiusMeters},${userCoords.latitude},${userCoords.longitude})["shop"="motorcycle"];
);
out center tags 50;
`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  const tryLookup = async (endpoint: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      // Overpass expects POST form-encoded body: data=<query>
      const body = new URLSearchParams({ data: query.trim() }).toString();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Nearby lookup failed (${res.status})`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response | null = null;
  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      res = await tryLookup(endpoint);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!res) {
    // Keep UX graceful on flaky networks/timeouts.
    if (lastError instanceof Error && lastError.name === "AbortError") return [];
    throw lastError instanceof Error ? lastError : new Error("Nearby lookup failed");
  }

  try {
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const elements = data.elements ?? [];
    const mapped = elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (typeof lat !== "number" || typeof lon !== "number") return null;
        const pointRegion = inferCountryFromCoords({ latitude: lat, longitude: lon });
        if (pointRegion && pointRegion !== region) return null;
        const name = el.tags?.name?.trim() || "Auto Parts Store";
        const tagAddress = [
          [el.tags?.["addr:housenumber"], el.tags?.["addr:street"]].filter(Boolean).join(" "),
          el.tags?.["addr:city"],
          el.tags?.["addr:state"],
        ].filter(Boolean).join(", ");
        const meters = haversineMeters(userCoords, { latitude: lat, longitude: lon });
        const distanceLabel =
          region === "MX"
            ? `${(meters / 1000).toFixed(1)} km`
            : `${metersToMiles(meters).toFixed(1)} mi`;
        return {
          id: String(el.id),
          name,
          address: tagAddress || "Address unavailable",
          distanceLabel,
          latitude: lat,
          longitude: lon,
          meters,
        };
      })
      .filter(Boolean) as Array<NearbyPartsStore & { meters: number }>;

    const uniqueByName = new Map<string, NearbyPartsStore & { meters: number }>();
    for (const row of mapped) {
      const key = `${row.name.toLowerCase()}|${row.address.toLowerCase()}`;
      const existing = uniqueByName.get(key);
      if (!existing || row.meters < existing.meters) uniqueByName.set(key, row);
    }

    const nearby = [...uniqueByName.values()]
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 15)
      .map(({ meters: _meters, ...rest }) => rest);

    await Promise.all(
      nearby.map(async (store) => {
        try {
          const reverse = await Location.reverseGeocodeAsync({
            latitude: store.latitude,
            longitude: store.longitude,
          });
          const r = reverse[0];
          if (!r) {
            store.address = store.address === "Address unavailable" ? "Near your location" : store.address;
            return;
          }
          const resolved = [
            [r.streetNumber, r.street].filter(Boolean).join(" "),
            r.city ?? r.subregion,
            r.region,
          ]
            .filter(Boolean)
            .join(", ");
          if (resolved) {
            store.address = resolved;
          } else if (store.address === "Address unavailable") {
            store.address = "Near your location";
          }
        } catch {
          // Keep existing address if any; only set fallback when empty.
          if (store.address === "Address unavailable") {
            store.address = "Near your location";
          }
        }
      }),
    );

    return nearby;
  } catch {
    throw new Error("Nearby lookup parse failed");
  }
}
