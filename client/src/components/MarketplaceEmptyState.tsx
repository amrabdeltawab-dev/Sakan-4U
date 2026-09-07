import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type MarketplaceEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

export default function MarketplaceEmptyState({ icon: Icon, title, description, actionLabel, actionHref, onAction, className = "" }: MarketplaceEmptyStateProps) {
  const action = actionLabel && actionHref ? <Button asChild className="h-11 rounded-xl bg-[#2563eb] px-5 font-extrabold text-white hover:bg-[#1d4ed8]"><Link href={actionHref}>{actionLabel}<ArrowLeft className="mr-2 h-4 w-4" /></Link></Button> : actionLabel && onAction ? <Button type="button" onClick={onAction} className="h-11 rounded-xl bg-[#2563eb] px-5 font-extrabold text-white hover:bg-[#1d4ed8]">{actionLabel}<ArrowLeft className="mr-2 h-4 w-4" /></Button> : null;
  return <Empty dir="rtl" className={`min-h-[300px] border-[#ccd6e0] bg-white shadow-[0_10px_28px_rgba(16,42,67,.035)] ${className}`}><EmptyHeader><EmptyMedia variant="icon" className="h-14 w-14 rounded-2xl bg-[#eff6ff] text-[#2563eb]"><Icon className="h-7 w-7" /></EmptyMedia><EmptyTitle className="mt-2 font-black text-[#0f172a]">{title}</EmptyTitle><EmptyDescription className="mt-1 max-w-sm leading-7 text-[#64748b]">{description}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>;
}
