export type PublicMapPoint = {
  publicLat: number;
  publicLng: number;
};

export const publicMapFallbackCopy = {
  loadingTitle: "جارٍ تجهيز خريطة المنطقة التقريبية",
  unavailableTitle: "الخريطة التفاعلية غير متاحة حالياً",
  unavailableDescription: "لن يظهر عنوان العقار أو موقعه الدقيق، ويمكن متابعة تفاصيل الإعلان بأمان.",
} as const;

function isValidPublicCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function isValidPublicMapPoint(point: PublicMapPoint) {
  return isValidPublicCoordinate(Number(point.publicLat), Number(point.publicLng));
}
