import { useQuery } from "@tanstack/react-query";

// Drives UI visibility only. Every admin action is authorized server-side;
// hiding a control here is a convenience, not a permission.
export function useIsAdmin(): boolean {
  const { data } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });
  return data?.isAdmin === true;
}
