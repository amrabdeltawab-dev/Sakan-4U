import { Bath, BedDouble, ChevronLeft, ChevronRight, Heart, MapPin, ReceiptText, Share2, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "@/lib/appToast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { formatEgp, propertyTypeLabels, rentPriceLabels, suitabilityLabels, type PropertyView } from "@/lib/marketplace";

async function copyPropertyLink(property: PropertyView) {
  const url = new URL(`/property/${property.id}`, window.location.origin).toString();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(input);
      if (!copied) throw new Error("Clipboard copy was not available");
    }
    toast.success("تم نسخ الرابط بنجاح", { position: "bottom-center" });
  } catch {
    toast.error("تعذر نسخ الرابط الآن. حاول مرة أخرى.", { position: "bottom-center" });
  }
}

async function sharePropertyLink(property: PropertyView) {
  const url = new URL(`/property/${property.id}`, window.location.origin).toString();
  const text = `${property.title} على Sakan 4U — ${formatEgp(property.monthlyPrice)} ${rentPriceLabels[property.rentType]}`;
  if (!navigator.share) return copyPropertyLink(property);
  try {
    await navigator.share({ title: property.title, text, url });
  } catch (error) {
    if ((error as DOMException)?.name !== "AbortError") await copyPropertyLink(property);
  }
}

export default function PropertyCard({ property, isFavorite = false, onFavoriteToggle, favoritePending = false, isCompared = false, onCompareToggle, compareDisabled = false }: { property: PropertyView; isFavorite?: boolean; onFavoriteToggle?: () => void; favoritePending?: boolean; isCompared?: boolean; onCompareToggle?: () => void; compareDisabled?: boolean }) {
  const [, setLocation] = useLocation();
  const images = property.images?.filter(Boolean).length ? property.images.filter(Boolean) : [property.image].filter(Boolean);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [activeImage, setActiveImage] = useState(0);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    if (!carouselApi) return;
    const syncActiveImage = () => setActiveImage(carouselApi.selectedScrollSnap());
    syncActiveImage();
    carouselApi.on("select", syncActiveImage);
    carouselApi.on("reInit", syncActiveImage);
    return () => {
      carouselApi.off("select", syncActiveImage);
      carouselApi.off("reInit", syncActiveImage);
    };
  }, [carouselApi]);

  const openProperty = () => setLocation(`/property/${property.id}`);
  const stopCardNavigation = (event: React.SyntheticEvent) => event.stopPropagation();
  return <article role="link" tabIndex={0} aria-label={`عرض تفاصيل ${property.title}`} onClick={openProperty} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProperty(); } }} className="group relative w-full max-w-[320px] cursor-pointer justify-self-start overflow-hidden rounded-2xl border border-transparent bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#dbeafe] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2">
    <div className="relative aspect-[16/9] overflow-hidden bg-[#eff6ff]">
      <Carousel setApi={setCarouselApi} opts={{ direction: "rtl", loop: hasMultipleImages }} className="h-full w-full touch-pan-y">
        <CarouselContent className="-ml-0 h-full">
          {images.map((image, index) => <CarouselItem key={`${image}-${index}`} className="h-full pl-0"><img src={image} alt={index === 0 ? property.title : `${property.title} — صورة ${index + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></CarouselItem>)}
        </CarouselContent>
      </Carousel>
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2"><Badge className="gap-1 rounded-full border-0 bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-bold text-[#059669]"><ShieldCheck className="h-3.5 w-3.5" />تم التحقق</Badge>{property.rentType === "bed" && <Badge className="rounded-full border-0 bg-[#eff6ff] px-2.5 py-1 text-[11px] font-extrabold text-[#1d4ed8]">مشترك (بالسرير)</Badge>}{property.availabilityStatus === "RESERVED" && <Badge className="rounded-full border-0 bg-[#fff0df] px-2.5 py-1 text-[11px] font-extrabold text-[#9a5b08]">محجوزة لمعاينة قادمة</Badge>}</div>
      {hasMultipleImages && <><button type="button" aria-label="الصورة السابقة" onClick={event => { stopCardNavigation(event); carouselApi?.scrollPrev(); }} className="absolute left-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-[#475569] shadow-sm backdrop-blur transition hover:bg-white hover:text-[#2563eb]"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="الصورة التالية" onClick={event => { stopCardNavigation(event); carouselApi?.scrollNext(); }} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-white/90 text-[#475569] shadow-sm backdrop-blur transition hover:bg-white hover:text-[#2563eb]"><ChevronRight className="h-4 w-4" /></button><div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#0f172a]/50 px-2 py-1 backdrop-blur" aria-label={`الصورة ${activeImage + 1} من ${images.length}`}>{images.map((_, index) => <button key={index} type="button" aria-label={`عرض الصورة ${index + 1}`} aria-current={index === activeImage} onClick={event => { stopCardNavigation(event); carouselApi?.scrollTo(index); }} className={`h-1.5 rounded-full transition-all ${index === activeImage ? "w-4 bg-white" : "w-1.5 bg-white/55 hover:bg-white"}`} />)}</div></>}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[#0f172a]/80 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">{propertyTypeLabels[property.type] ?? property.type}</div>
    </div>
    {onCompareToggle && <label className="absolute left-3 top-3 z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/70 bg-white/95 px-2.5 py-1.5 text-[11px] font-extrabold text-[#334155] shadow-sm backdrop-blur" onClick={stopCardNavigation}><Checkbox checked={isCompared} disabled={compareDisabled && !isCompared} onCheckedChange={() => onCompareToggle()} aria-label={`مقارنة ${property.title}`} />مقارنة</label>}
    <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><h3 className="line-clamp-2 min-h-11 text-base font-extrabold leading-6 text-[#0f172a]">{property.title}</h3><span className="shrink-0 rounded-lg bg-[#eff6ff] px-2 py-1 text-[10px] font-bold text-[#1d4ed8]">{suitabilityLabels[property.genderSuitability]}</span></div><div className="flex items-baseline gap-1.5"><b className="text-xl font-black text-[#059669]">{formatEgp(property.monthlyPrice)}</b><span className="text-xs font-semibold text-[#475569]">{rentPriceLabels[property.rentType]}</span></div><p className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#2563eb]" />{property.area}، {property.governorate}</p><div className="grid grid-cols-3 gap-2 border-t border-[#e2e8f0] pt-3 text-xs font-bold text-[#475569]"><span className="flex items-center gap-1 whitespace-nowrap"><BedDouble className="h-4 w-4 text-[#2563eb]" />{property.bedrooms} غرف</span><span className="flex items-center gap-1 whitespace-nowrap"><Bath className="h-4 w-4 text-[#2563eb]" />{property.bathrooms} حمام</span><span className={`flex items-center gap-1 whitespace-nowrap ${property.rentType === "bed" && property.availableBeds === 1 ? "text-red-600" : ""}`}><UsersRound className={`h-4 w-4 ${property.rentType === "bed" && property.availableBeds === 1 ? "text-red-600" : "text-[#2563eb]"}`} />{property.rentType === "bed" ? property.availableBeds === 1 ? "سرير واحد متبقي!" : `${property.availableBeds ?? 0} أسرة متاحة` : property.capacity}</span></div><div className="flex flex-wrap gap-1.5" aria-label="معلومات إضافية عن العقار">{property.distanceToCampus && <Badge variant="outline" className="gap-1 rounded-full border-[#bfdbfe] bg-[#eff6ff] px-2 py-1 text-[11px] font-bold text-[#1d4ed8]"><MapPin className="h-3 w-3" />{property.distanceToCampus}</Badge>}{property.utilitiesIncluded.length > 0 && <Badge variant="outline" className="gap-1 rounded-full border-[#bbf7d0] bg-[#f0fdf4] px-2 py-1 text-[11px] font-bold text-[#15803d]"><ReceiptText className="h-3 w-3" />{property.utilitiesIncluded.length === 1 ? `يشمل ${property.utilitiesIncluded[0]}` : `يشمل ${property.utilitiesIncluded.length} مرافق`}</Badge>}<Badge variant="outline" className="rounded-full border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-[11px] font-bold text-[#475569]">{property.genderPreference === "male" ? "للشباب" : property.genderPreference === "female" ? "للطالبات" : "مناسب للجميع"}</Badge></div></div>
    <div className="absolute right-3 top-3 flex items-center gap-2">{onFavoriteToggle && <button type="button" aria-label={isFavorite ? "إزالة من المفضلة" : "حفظ في المفضلة"} aria-pressed={isFavorite} disabled={favoritePending} onClick={event => { event.preventDefault(); stopCardNavigation(event); onFavoriteToggle(); }} className={`grid h-10 w-10 place-items-center rounded-full border shadow-sm backdrop-blur transition ${isFavorite ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-white/70 bg-white/90 text-[#475569] hover:text-[#2563eb]"} disabled:cursor-wait disabled:opacity-60`}><Heart className={`h-4.5 w-4.5 ${isFavorite ? "fill-current" : ""}`} /></button>}<button type="button" aria-label="مشاركة العقار" onClick={event => { stopCardNavigation(event); void sharePropertyLink(property); }} className="grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/90 text-[#475569] shadow-sm backdrop-blur transition hover:text-[#2563eb]"><Share2 className="h-4.5 w-4.5" /></button></div>
  </article>;
}
