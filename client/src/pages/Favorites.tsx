import WorkspaceShell from "@/components/WorkspaceShell";
import PropertyCard from "@/components/PropertyCard";
import MarketplaceEmptyState from "@/components/MarketplaceEmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { normalizeProperty } from "@/lib/marketplace";
import { trpc } from "@/lib/trpc";
import { Heart, Search } from "lucide-react";
import { Link } from "wouter";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError } from "@/lib/appToast";

export default function Favorites() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const favorites = trpc.favorites.list.useQuery(undefined, { enabled: user?.appRole === "student" });
  const removeFavorite = trpc.favorites.set.useMutation({
    onSuccess: () => { void utils.favorites.list.invalidate(); void utils.favorites.ids.invalidate(); },
    onError: error => showActionError(error, actionErrorMessages.profile),
  });
  const cards = (favorites.data ?? []).map(normalizeProperty);

  if (user && user.appRole !== "student") return <WorkspaceShell active="/favorites"><section className="grid min-h-[520px] place-items-center"><div className="max-w-md text-center"><Heart className="mx-auto h-10 w-10 text-[#2563eb]" /><h1 className="mt-5 text-2xl font-black">المفضلة مخصصة للطلاب</h1><p className="mt-3 leading-7 text-[#64748b]">يمكن للطلاب حفظ العقارات ومراجعتها لاحقاً من هذه المساحة.</p></div></section></WorkspaceShell>;

  return <WorkspaceShell active="/favorites"><section><span className="text-xs font-black tracking-[.15em] text-[#2563eb]">اختياراتك</span><h1 className="mt-2 text-3xl font-black">العقارات المحفوظة</h1><p className="mt-2 text-sm leading-7 text-[#6e8295]">ارجع إلى الأماكن التي لفتت انتباهك، ثم راجع تفاصيلها أو أرسل طلب معاينة عندما تكون جاهزاً.</p></section><section className="mt-8">{favorites.isLoading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="overflow-hidden rounded-[23px] border border-[#e2e8f0] bg-white"><div className="h-52 animate-pulse bg-[#f1f5f9]" /><div className="space-y-3 p-5"><div className="h-5 w-3/4 animate-pulse rounded bg-[#f1f5f9]" /><div className="h-4 w-1/2 animate-pulse rounded bg-[#f1f5f9]" /></div></div>)}</div> : cards.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map(property => <PropertyCard key={property.id} property={property} isFavorite onFavoriteToggle={() => removeFavorite.mutate({ propertyId: property.id, saved: false })} favoritePending={removeFavorite.isPending} />)}</div> : <MarketplaceEmptyState icon={Heart} title="لا توجد عقارات مفضلة" description="اضغط رمز القلب على أي إعلان مناسب لتجده هنا لاحقاً." actionLabel="استكشف العقارات" actionHref="/" />}</section></WorkspaceShell>;
}
