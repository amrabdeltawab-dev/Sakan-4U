import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingButton({ loading = false, loadingLabel = "جارٍ التنفيذ...", children, disabled, ...props }: React.ComponentProps<typeof Button> & { loading?: boolean; loadingLabel?: React.ReactNode }) {
  return (
    <Button {...props} disabled={loading || disabled} aria-busy={loading || undefined}>
      {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{loadingLabel}</> : children}
    </Button>
  );
}
