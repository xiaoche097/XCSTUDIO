import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowLeft, BarChart3, Activity, Search, FileText, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../utils/routes";

type UsageRow = {
  id: string;
  day: string;
  endpoint: "search" | "extract" | "rehost-image";
  requests: number;
  successRate: string;
  p95Ms: number;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminUsage() {
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

  const rows: UsageRow[] = useMemo(
    () => [
      { id: "d1", day: "2026-03-15", endpoint: "search", requests: 128, successRate: "98.4%", p95Ms: 980 },
      { id: "d2", day: "2026-03-15", endpoint: "extract", requests: 64, successRate: "93.7%", p95Ms: 2200 },
      { id: "d3", day: "2026-03-15", endpoint: "rehost-image", requests: 41, successRate: "99.2%", p95Ms: 540 },
      { id: "d4", day: "2026-03-14", endpoint: "search", requests: 310, successRate: "97.1%", p95Ms: 1100 },
      { id: "d5", day: "2026-03-14", endpoint: "extract", requests: 122, successRate: "92.0%", p95Ms: 2600 },
      { id: "d6", day: "2026-03-14", endpoint: "rehost-image", requests: 88, successRate: "98.9%", p95Ms: 620 },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.day.includes(q) || r.endpoint.toLowerCase().includes(q) || String(r.requests).includes(q),
    );
  }, [rows, query]);

  const iconForEndpoint = (e: UsageRow["endpoint"]) => {
    if (e === "search") return <Search size={16} className="text-white/70" />;
    if (e === "extract") return <FileText size={16} className="text-white/70" />;
    return <ImageIcon size={16} className="text-white/70" />;
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">用量统计</div>
          <div className="mt-2 text-lg font-bold">正在验证会话…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[42%] -left-[20%] w-[70vw] h-[70vw] rounded-full blur-[150px] opacity-50 bg-gradient-to-br from-cyan-400/20 via-indigo-400/10 to-transparent" />
        <div className="absolute -bottom-[45%] -right-[15%] w-[75vw] h-[75vw] rounded-full blur-[170px] opacity-40 bg-gradient-to-tr from-white/10 via-blue-500/10 to-transparent" />
        <div className="absolute inset-0 noise-bg opacity-40" />
      </div>

      <header className="relative z-10 px-6 lg:px-12 pt-10 pb-6">
        <button
          onClick={() => navigate(ROUTES.admin)}
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-semibold">返回</span>
        </button>

        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
          <Shield size={14} className="text-cyan-300" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-white/80">管理 · 用量统计</span>
        </div>
        <h1 className="mt-5 text-3xl lg:text-[42px] leading-tight font-serif font-light tracking-tight">
          用量
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">统计</span>
        </h1>
        <p className="mt-3 text-sm text-white/55 max-w-[62ch]">
          这是用量统计 UI 的第一版骨架：按天/端点聚合的表格与基础筛选。后续接入 DB/日志后替换为真实数据。
        </p>
      </header>

      <main className="relative z-10 px-6 lg:px-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-8 rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <div className="p-6 lg:p-8 border-b border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <BarChart3 size={18} className="text-white/75" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">按日</div>
                  <div className="mt-1 text-lg font-bold tracking-tight">接口使用情况</div>
                </div>
              </div>

              <div className="relative w-[260px] hidden sm:block">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="筛选"
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
                      <th className="px-4 py-3 font-bold">日期</th>
                      <th className="px-4 py-3 font-bold">接口地址</th>
                      <th className="px-4 py-3 font-bold">请求总数</th>
                      <th className="px-4 py-3 font-bold">成功率</th>
                      <th className="px-4 py-3 font-bold">P95 延迟 (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t border-white/10 hover:bg-white/4 transition">
                        <td className="px-4 py-4 text-[12px] text-white/70 font-mono">{r.day}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/80">
                            {iconForEndpoint(r.endpoint)}
                            {r.endpoint}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-white/85">{r.requests}</td>
                        <td className="px-4 py-4 text-[12px] text-white/70">{r.successRate}</td>
                        <td className="px-4 py-4 text-[12px] text-white/70">{r.p95Ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <Activity size={18} className="text-white/75" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-bold">备注建议</div>
                  <div className="mt-1 text-lg font-bold tracking-tight">日志记录指南</div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-bold">建议记录事件</div>
                <div className="mt-2 text-[12px] text-white/45 leading-relaxed">
                  建议在每个 Vercel Function 里记录: userId, endpoint, model/provider, latency, status, tokens(如果有)。
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-bold">数据源方案</div>
                <div className="mt-2 text-[12px] text-white/45 leading-relaxed">
                  方案 A: Postgres usage 表；方案 B: Vercel Logs + 导出；方案 C: ClickHouse。
                </div>
              </div>

              <button
                type="button"
                className="w-full h-12 rounded-2xl bg-white text-black font-bold hover:shadow-[0_0_26px_rgba(255,255,255,0.22)] transition"
                onClick={() => alert("下一步：实现基于数据库的用量分析接口")}
              >
                接入真实分析系统
              </button>
            </div>
          </motion.aside>
        </div>
      </main>
    </div>
  );
}
