import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";

export function useAuth() {
  return useSupabaseAuth();
}
