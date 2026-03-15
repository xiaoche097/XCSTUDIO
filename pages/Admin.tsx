import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Users,
  Shield,
  Gauge,
  ArrowUpRight,
  RefreshCw,
  LogOut,
  Search,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../utils/routes";

type Metric = {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
};

type RecentEvent = {
  id: string;
  type: "search" | "extract" | "rehost" | "auth";
  title: string;
  meta: string;
  time: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function Admin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [issuedAt, setIssuedAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (!res.ok || !data?.ok) {
          setAuthed(false);
          setChecking(false);
          navigate(ROUTES.login);
          return;
        }
        setAuthed(true);
        setIssuedAt(Number(data?.issuedAt || 0) || null);
        setChecking(false);
      } catch {
        if (!mounted) return;
        setAuthed(false);
        setChecking(false);
        navigate(ROUTES.login);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const metrics: Metric[] = useMemo(
    () => [
      {
        label: "Active Users",
        value: "—",
        hint: "MVP: no DB yet",
        icon: <Users size={18} className="text-white/70" />,
      },
      {
        label: "Requests (24h)",
        value: "—",
        hint: "wire to analytics",
        icon: <Activity size={18} className="text-white/70" />,
      },
      {
        label: "Success Rate",
        value: "—",
        hint: "track per endpoint",
        icon: <Gauge size={18} className="text-white/70" />,
      },
      {
        label: "Security",
        value: "Admin Only",
        hint: "HttpOnly session",
        icon: <Shield size={18} className="text-white/70" />,
      },
    ],
    [],
  );

  const events: RecentEvent[] = useMemo(() => {
    const now = Date.now();
    const list: RecentEvent[] = [
      {
        id: "e1",
        type: "auth",
        title: "Admin session verified",
        meta: "GET /api/auth/me",
        time: fmtTime(now - 2 * 60 * 1000),
      },
      {
        id: "e2",
        type: "search",
        title: "Research search",
        meta: "POST /api/search",
        time: fmtTime(now - 14 * 60 * 1000),
      },
      {
        id: "e3",
        type: "extract",
        title: "Web extract",
        meta: "POST /api/extract",
        time: fmtTime(now - 22 * 60 * 1000),
      },
      {
        id: "e4",
        type: "rehost",
        title: "Rehost image",
        meta: "POST /api/rehost-image",
        time: fmtTime(now - 39 * 60 * 1000),
      },
    ];

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) || e.meta.toLowerCase().includes(q) || e.type.includes(q as any),
    );
  }, [query]);

  const iconForEvent = (t: RecentEvent["type"]) => {
    if (t === "search") return <Search size={16} className="text-white/70" />;
    if (t === "extract") return <FileText size={16} className="text-white/70" />;
    if (t === "rehost") return <ImageIcon size={16} className="text-white/70" />;
    return <LinkIcon size={16} className="text-white/70" />;
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      navigate(ROUTES.login);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 650);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">
            Admin Console
          </div>
          <div className="mt-2 text-lg font-bold">Checking session…</div>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full w-1/2 bg-white/40"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[38%] -left-[15%] w-[70vw] h-[70vw] rounded-full blur-[140px] opacity-55 bg-gradient-to-br from-cyan-400/25 via-indigo-400/10 to-transparent" />
        <div className="absolute -bottom-[40%] -right-[15%] w-[70vw] h-[70vw] rounded-full blur-[160px] opacity-45 bg-gradient-to-tr from-white/10 via-blue-500/10 to-transparent" />
        <div className="absolute inset-0 noise-bg opacity-40" />
      </div>

      <header className="relative z-10 px-6 lg:px-12 pt-10 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
              <Shield size={14} className="text-cyan-300" />
              <span className="text-[11px] font-semibold tracking-widest uppercase text-white/80">
                Admin Console
              </span>
            </div>
            <h1 className="mt-5 text-3xl lg:text-[44px] leading-tight font-serif font-light tracking-tight">
              System
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                Overview
              </span>
            </h1>
            <p className="mt-3 text-sm text-white/55 max-w-[56ch]">
              这是 SaaS 后台的第一版骨架：会话校验、导航、模块容器与一致的视觉系统。后续接入数据库后即可补齐用户与用量。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className={cn(
                "h-11 px-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center gap-2",
                refreshing && "opacity-80",
              )}
              title="Refresh"
            >
              <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
              <span className="text-sm font-semibold">Refresh</span>
            </button>
            <button
              onClick={logout}
              className="h-11 px-4 rounded-2xl bg-white text-black hover:shadow-[0_0_26px_rgba(255,255,255,0.22)] transition flex items-center gap-2"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="text-sm font-bold">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 lg:px-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-8 rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <div className="p-6 lg:p-8 flex items-center justify-between gap-4 border-b border-white/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">
                  Metrics
                </div>
                <div className="mt-2 text-lg font-bold tracking-tight">Core KPIs</div>
              </div>
              <div className="text-[11px] text-white/40">
                Session issued: {issuedAt ? new Date(issuedAt * 1000).toLocaleString() : "—"}
              </div>
            </div>

            <div className="p-6 lg:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/6 to-transparent p-5 hover:bg-white/7 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.26em] font-bold text-white/45">
                      {m.label}
                    </div>
                    <div className="w-9 h-9 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                      {m.icon}
                    </div>
                  </div>
                  <div className="mt-3 text-2xl font-bold tracking-tight">{m.value}</div>
                  <div className="mt-2 text-[12px] text-white/45">{m.hint}</div>
                </div>
              ))}
            </div>

            <div className="px-6 lg:px-8 pb-6">
              <div className="rounded-3xl border border-white/10 bg-white/4 p-5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold">Next: connect DB + analytics</div>
                  <div className="mt-1 text-[12px] text-white/45">
                    建议用 Supabase: Auth + Postgres + Edge logs。我们可以把 search/extract/rehost 的调用量写到一张 usage 表。
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[12px] font-semibold text-white/70">
                  <span>Plan</span>
                  <ArrowUpRight size={16} />
                </div>
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-4 rounded-[28px] border border-white/10 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">
                  Activity
                </div>
                <div className="mt-2 text-lg font-bold tracking-tight">Recent Events</div>
              </div>
            </div>

            <div className="p-6">
              <label className="text-[11px] font-bold text-white/45 uppercase tracking-[0.22em]">
                Filter
              </label>
              <div className="mt-2 relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events"
                  className="w-full h-11 rounded-2xl bg-black/30 border border-white/10 px-4 pr-10 text-sm text-white placeholder:text-white/25 outline-none focus:ring-4 focus:ring-white/10 focus:border-white/20 transition"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                  <Search size={16} />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-3xl border border-white/10 bg-white/5 hover:bg-white/7 transition p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                          {iconForEvent(e.type)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white/85">{e.title}</div>
                          <div className="mt-1 text-[12px] text-white/45">{e.meta}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-white/35 whitespace-nowrap">{e.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 text-[11px] text-white/35">
                说明：当前活动列表为 UI 占位，后续接入数据库/日志后替换。
              </div>
            </div>
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-12 rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <div className="p-6 lg:p-8 flex items-center justify-between gap-4 border-b border-white/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">Admin</div>
                <div className="mt-2 text-lg font-bold tracking-tight">Management</div>
              </div>
              <div className="text-[11px] text-white/40">Open modules</div>
            </div>
            <div className="p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => navigate(ROUTES.adminUsers)}
                className="text-left rounded-3xl border border-white/10 bg-gradient-to-b from-white/6 to-transparent p-6 hover:bg-white/7 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.26em] font-bold text-white/45">Users</div>
                  <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                    <Users size={18} className="text-white/75" />
                  </div>
                </div>
                <div className="mt-3 text-xl font-bold tracking-tight">User Directory</div>
                <div className="mt-2 text-[12px] text-white/45">Search, status, plan badges (UI skeleton)</div>
              </button>

              <button
                onClick={() => navigate(ROUTES.adminUsage)}
                className="text-left rounded-3xl border border-white/10 bg-gradient-to-b from-white/6 to-transparent p-6 hover:bg-white/7 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.26em] font-bold text-white/45">Usage</div>
                  <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                    <Gauge size={18} className="text-white/75" />
                  </div>
                </div>
                <div className="mt-3 text-xl font-bold tracking-tight">Usage Analytics</div>
                <div className="mt-2 text-[12px] text-white/45">Daily endpoint aggregates (UI skeleton)</div>
              </button>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
