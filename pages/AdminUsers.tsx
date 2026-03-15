import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Users, Search, ArrowLeft, Ban, CheckCircle2, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../utils/routes";

type UserRow = {
  id: string;
  email: string;
  plan: "free" | "pro" | "team";
  status: "active" | "disabled";
  createdAt: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (!res.ok || !data?.ok) {
          setChecking(false);
          navigate(ROUTES.login);
          return;
        }
        setChecking(false);
      } catch {
        if (!mounted) return;
        setChecking(false);
        navigate(ROUTES.login);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const rows: UserRow[] = useMemo(
    () => [
      {
        id: "u_001",
        email: "demo@creator.io",
        plan: "pro",
        status: "active",
        createdAt: "2026-03-12",
      },
      {
        id: "u_002",
        email: "trial@studio.dev",
        plan: "free",
        status: "active",
        createdAt: "2026-03-10",
      },
      {
        id: "u_003",
        email: "abuse@spam.example",
        plan: "free",
        status: "disabled",
        createdAt: "2026-03-08",
      },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [rows, query]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">Users</div>
          <div className="mt-2 text-lg font-bold">Checking session…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full blur-[150px] opacity-50 bg-gradient-to-br from-cyan-400/20 via-indigo-400/10 to-transparent" />
        <div className="absolute -bottom-[45%] -right-[15%] w-[75vw] h-[75vw] rounded-full blur-[170px] opacity-40 bg-gradient-to-tr from-white/10 via-blue-500/10 to-transparent" />
        <div className="absolute inset-0 noise-bg opacity-40" />
      </div>

      <header className="relative z-10 px-6 lg:px-12 pt-10 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <button
              onClick={() => navigate(ROUTES.admin)}
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition"
            >
              <ArrowLeft size={18} />
              <span className="text-sm font-semibold">Back</span>
            </button>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
              <Shield size={14} className="text-cyan-300" />
              <span className="text-[11px] font-semibold tracking-widest uppercase text-white/80">Admin · Users</span>
            </div>
            <h1 className="mt-5 text-3xl lg:text-[42px] leading-tight font-serif font-light tracking-tight">
              User
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">Directory</span>
            </h1>
            <p className="mt-3 text-sm text-white/55 max-w-[58ch]">
              这是用户管理的 UI 骨架：搜索、状态、套餐标识。后续接数据库后替换数据源与操作。
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 lg:px-12 pb-20">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.65)] overflow-hidden"
        >
          <div className="p-6 lg:p-8 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                <Users size={18} className="text-white/75" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">Users</div>
                <div className="mt-1 text-lg font-bold tracking-tight">All accounts</div>
              </div>
            </div>

            <div className="relative w-full sm:w-[360px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by email or id"
                className="w-full h-11 rounded-2xl bg-black/30 border border-white/10 px-4 pr-10 text-sm text-white placeholder:text-white/25 outline-none focus:ring-4 focus:ring-white/10 focus:border-white/20 transition"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                <Search size={16} />
              </div>
            </div>
          </div>

          <div className="p-3 lg:p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[760px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.26em] text-white/35">
                    <th className="px-4 py-3 font-bold">User</th>
                    <th className="px-4 py-3 font-bold">Plan</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Created</th>
                    <th className="px-4 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-white/10 hover:bg-white/4 transition">
                      <td className="px-4 py-4">
                        <div className="text-sm font-bold text-white/85">{r.email}</div>
                        <div className="mt-1 text-[12px] text-white/40 font-mono">{r.id}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold",
                            r.plan === "pro" && "border-rose-500/30 bg-rose-500/10 text-rose-200",
                            r.plan === "team" && "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
                            r.plan === "free" && "border-white/10 bg-white/5 text-white/70",
                          )}
                        >
                          {r.plan === "pro" && <Crown size={14} />}
                          {r.plan.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold",
                            r.status === "active"
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 bg-white/5 text-white/55",
                          )}
                        >
                          {r.status === "active" ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-white/55">{r.createdAt}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className="h-10 px-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                          onClick={() => alert("MVP: connect DB to enable actions")}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
