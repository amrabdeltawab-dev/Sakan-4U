import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { showAppError } from "@/lib/appToast";

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: error => showAppError(error) }),
  mutationCache: new MutationCache({ onError: error => showAppError(error) }),
});
const trpcClient = trpc.createClient({
  links: [httpBatchLink({
    url: "/api/trpc",
    transformer: superjson,
    async headers() {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
  })],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <SupabaseAuthProvider><App /></SupabaseAuthProvider>
    </QueryClientProvider>
  </trpc.Provider>,
);
