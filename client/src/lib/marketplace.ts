export type Amenity = "واي فاي" | "تكييف" | "غسالة" | "ثلاجة" | "مطبخ" | "سخان مياه";

export type PropertyView = {
  id: string;
  title: string;
  type: string;
  area: string;
  governorate: string;
  monthlyPrice: number;
  rentType: "full" | "bed";
  totalBeds: number | null;
  availableBeds: number | null;
  bedrooms: number;
  bathrooms: number;
  capacity: number;
  genderSuitability: "male" | "female" | "mixed";
  genderPreference: "male" | "female" | "anyone";
  distanceToCampus: string | null;
  utilitiesIncluded: string[];
  videoUrl: string | null;
  furnished: boolean;
  amenities: Amenity[];
  availabilityStatus: "AVAILABLE" | "RESERVED" | "RENTED" | "HIDDEN";
  verificationStatus: "VERIFIED" | "PENDING" | "NEEDS_CHANGES" | "REJECTED";
  description: string;
  image: string;
  images?: string[];
  approximateLocation: string;
  publicLat: number;
  publicLng: number;
  verifiedFacts?: string[];
  isDemo?: boolean;
};

export const amenityOptions: Amenity[] = ["واي فاي", "تكييف", "غسالة", "ثلاجة", "مطبخ", "سخان مياه"];

export const propertyTypeLabels: Record<string, string> = {
  apartment: "شقة كاملة",
  studio: "استوديو",
  room: "غرفة خاصة",
  shared_room: "غرفة مشتركة",
};

export const rentTypeLabels: Record<PropertyView["rentType"], string> = { full: "تأجير كامل", bed: "مشترك (بالسرير)" };
export const rentPriceLabels: Record<PropertyView["rentType"], string> = { full: "جنيه/شهرياً", bed: "جنيه/سرير شهرياً" };

export const suitabilityLabels: Record<PropertyView["genderSuitability"], string> = {
  male: "للطلاب",
  female: "للطالبات",
  mixed: "مناسب للجميع",
};

export function formatEgp(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

export function normalizeProperty(item: any): PropertyView {
  const media = item.media ?? [];
  const visibleMedia = media.filter((entry: any) => Boolean(entry.url));
  const primary = visibleMedia.find((entry: any) => entry.isPrimary)?.url ?? visibleMedia[0]?.url ?? "";
  let amenities: Amenity[] = [];
  try { amenities = Array.isArray(item.amenities) ? item.amenities : JSON.parse(item.amenities ?? "[]"); } catch { amenities = []; }
  return {
    id: String(item.id), title: item.title, type: item.propertyType, area: item.area, governorate: item.governorate, monthlyPrice: item.monthlyPrice, rentType: item.rentType === "bed" ? "bed" : "full", totalBeds: item.rentType === "bed" && Number.isFinite(Number(item.totalBeds)) ? Number(item.totalBeds) : null, availableBeds: item.rentType === "bed" && Number.isFinite(Number(item.availableBeds)) ? Number(item.availableBeds) : null,
    bedrooms: item.bedrooms, bathrooms: item.bathrooms, capacity: item.capacity, genderSuitability: item.genderSuitability, genderPreference: item.genderPreference ?? (item.genderSuitability === "mixed" ? "anyone" : item.genderSuitability), distanceToCampus: item.distanceToCampus ?? null, utilitiesIncluded: Array.isArray(item.utilitiesIncluded) ? item.utilitiesIncluded : [], videoUrl: item.videoUrl ?? null, furnished: item.furnished,
    amenities, availabilityStatus: String(item.availabilityStatus ?? "available").toUpperCase() as PropertyView["availabilityStatus"], verificationStatus: String(item.verificationStatus ?? "pending").toUpperCase() as PropertyView["verificationStatus"], description: item.description, image: primary,
    images: visibleMedia.map((entry: any) => entry.url), approximateLocation: item.approximateLocation ?? item.area,
    publicLat: Number(item.publicLat ?? 29.074), publicLng: Number(item.publicLng ?? 31.098),
    verifiedFacts: [item.ownerIdentityVerified && "هوية المالك", item.locationVerified && "الموقع التقريبي", item.availabilityVerified && "التوفر الحالي"].filter(Boolean) as string[],
  };
}
