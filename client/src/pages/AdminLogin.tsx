import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useIsAdmin } from "@/hooks/use-is-admin";

// Unlinked admin sign-in. Admin accounts are provisioned with
// scripts/create-admin.ts; there is no signup. Cookies are per-domain, so
// sign in once on each of the three sites.
export default function AdminLogin() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshSession = () => qc.invalidateQueries();

  const login = useMutation({
    mutationFn: () => apiRequest({ endpoint: "/api/auth/login", method: "POST", data: { username, password } }),
    onSuccess: () => { setPassword(""); setError(null); refreshSession(); },
    onError: (e) => setError(e instanceof ApiError && e.body?.message ? e.body.message : "Sign-in failed"),
  });

  const logout = useMutation({
    mutationFn: () => apiRequest({ endpoint: "/api/auth/logout", method: "POST" }),
    onSuccess: refreshSession,
  });

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      <main className="container mx-auto px-4 py-16 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 border-2 border-black bg-[#FEABDA]">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold text-black mb-4">ADMIN</h1>
            {isAdmin ? (
              <div className="space-y-4">
                <p className="text-black">You're signed in as an admin on this site.</p>
                <div className="flex gap-3">
                  <Link href="/">
                    <Button className="bg-black text-white hover:bg-black/90 rounded-full px-6">Back to feed</Button>
                  </Link>
                  <Button variant="outline" className="rounded-full border-black" onClick={() => logout.mutate()} disabled={logout.isPending}>
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); login.mutate(); }}>
                <div>
                  <Label htmlFor="admin-username" className="text-black">Username</Label>
                  <Input id="admin-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-white border-black" />
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-black">Password</Label>
                  <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-white border-black" />
                </div>
                {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
                <Button type="submit" className="bg-black text-white hover:bg-black/90 rounded-full px-6" disabled={login.isPending || !username || !password}>
                  {login.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
