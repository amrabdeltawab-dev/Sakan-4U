import type { PropertyView } from "@/lib/marketplace";

export type GenderFilter = "" | "male" | "female" | "anyone";

export function parseDistanceMinutes(value?: string | null) {
  if (!value) return null;
  const western = value.match(/\d+/)?.[0];
  if (western) return Number(western);
  const eastern = value.match(/[٠-٩]+/)?.[0];
  return eastern ? Number(eastern.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))) : null;
}

export function matchesPropertyFilters(property: Pick<PropertyView, "genderPreference" | "distanceToCampus">, gender: GenderFilter, distanceMax: string) {
  const matchesGender = !gender || property.genderPreference === gender;
  const distance = parseDistanceMinutes(property.distanceToCampus);
  const matchesDistance = !distanceMax || (distance !== null && distance <= Number(distanceMax));
  return matchesGender && matchesDistance;
}
