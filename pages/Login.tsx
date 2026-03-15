import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../utils/routes";

type LoginStatus = "idle" | "loading" | "error";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toRequestId() {
  return `login_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const canSubmit = password.trim().length >= 6 && status !== "loading";

  const accent = useMemo(() => {
    const p = password.trim().length;
    if (p >= 14) return "from-emerald-400/25 via-cyan-400/10 to-transparent";
    if (p >= 10) return "from-cyan-400/25 via-blue-400/10 to-transparent";
    return "from-blue-400/20 via-slate-400/10 to-transparent";
  }, [password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setStatus("loading");
    const requestId = toRequestId();
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setErrorMsg(String(data?.error || "login_failed"));
        return;
      }

      setStatus("idle");
      navigate(ROUTES.dashboard);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "network_error");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white selection:bg-white/20 selection:text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className={cn("absolute -top-[30%] -left-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-60", `bg-gradient-to-br ${accent}`)} />
        <div className="absolute -bottom-[35%] -right-[15%] w-[70vw] h-[70vw] rounded-full blur-[140px] opacity-50 bg-gradient-to-tr from-white/10 via-indigo-500/10 to-transparent" />
        <div className="absolute inset-0 noise-bg opacity-40" />
      </div>

      <header className="relative z-10 h-20 px-6 lg:px-12 flex items-center justify-between">
        <button
          onClick={() => navigate(ROUTES.landing)}
          className="flex items-center gap-3 group"
          title="Back"
        >
          <div className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-bold text-xs tracking-tighter">
            XC
          </div>
          <span className="font-bold text-lg tracking-wide text-white/90 group-hover:text-white transition-colors hidden sm:block">
            XcAISTUDIO
          </span>
        </button>

        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-white/40">
          <Shield size={14} />
          Admin Access
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 pt-10 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[980px]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
            <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.55)] overflow-hidden">
              <div className="p-8 lg:p-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-6">
                  <LockKeyhole size={14} className="text-cyan-300" />
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-white/80">
                    Secure Console
                  </span>
                </div>

                <h1 className="text-3xl lg:text-[42px] leading-tight font-serif font-light tracking-tight">
                  登录到
                  <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                    管理后台
                  </span>
                </h1>
                <p className="mt-4 text-sm text-white/55 leading-relaxed max-w-[46ch]">
                  用于启用 Vercel Functions 后端能力与敏感配置。当前为管理员口令模式（MVP）。
                </p>

                <div className="mt-10 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                      Session
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white/85">HttpOnly Cookie</div>
                    <div className="mt-1 text-xs text-white/45">7 days rolling</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                      Scope
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white/85">/api/*</div>
                    <div className="mt-1 text-xs text-white/45">Server-only</div>
                  </div>
                </div>
              </div>

              <div className="px-8 lg:px-10 py-6 border-t border-white/10 bg-gradient-to-r from-white/5 to-transparent">
                <div className="text-[11px] text-white/45">
                  Tip: 把口令放在 Vercel Environment Variables 里，不要写进前端。
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
              <form onSubmit={submit} className="p-8 lg:p-10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-white/45 uppercase tracking-[0.28em] font-bold">
                      Authenticate
                    </div>
                    <div className="mt-2 text-xl font-bold tracking-tight">Admin Login</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                    <Shield size={18} className="text-white/70" />
                  </div>
                </div>

                <div className="mt-10">
                  <label className="text-[11px] font-bold text-white/45 uppercase tracking-[0.22em]">
                    Password
                  </label>
                  <div className="mt-2 relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter admin password"
                      className="w-full h-12 rounded-2xl bg-black/30 border border-white/10 px-4 pr-12 text-sm text-white placeholder:text-white/25 outline-none focus:ring-4 focus:ring-white/10 focus:border-white/20 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 -translate-y-1/2 right-2 w-9 h-9 rounded-xl flex items-center justify-center text-white/45 hover:text-white hover:bg-white/10 transition"
                      title={showPassword ? "Hide" : "Show"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-white/35">
                    仅用于后台管理（建议 12+ 位，随机口令）。
                  </div>
                </div>

                {status === "error" && (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                    {errorMsg || "login_failed"}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={cn(
                    "mt-8 w-full h-12 rounded-2xl font-bold text-[14px] transition-all active:scale-[0.99] flex items-center justify-center gap-2",
                    canSubmit
                      ? "bg-white text-black hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]"
                      : "bg-white/15 text-white/35 cursor-not-allowed",
                  )}
                >
                  <span>{status === "loading" ? "Signing in..." : "登录"}</span>
                  <ArrowRight size={18} />
                </button>

                <div className="mt-6 flex items-center justify-between text-[11px] text-white/35">
                  <span>XC-STUDIO Serverless Backend</span>
                  <span>Vercel Functions</span>
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
