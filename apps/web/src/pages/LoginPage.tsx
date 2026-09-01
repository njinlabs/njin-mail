import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { login } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { data: session } = useSession();

  useEffect(() => {
    if (session) navigate("/mail", { replace: true });
  }, [session, navigate]);

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["session"], data);
      navigate("/mail", { replace: true });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Mail Client</h1>
          <p className="text-sm text-slate-500">Masuk ke akun email Anda</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@domain.com"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/10 placeholder:text-slate-400 focus:border-slate-400 focus:ring-4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Kata Sandi
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/10 focus:border-slate-400 focus:ring-4"
            />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600">Gagal masuk. Silakan coba lagi.</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
