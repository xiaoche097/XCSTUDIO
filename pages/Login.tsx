import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Eye, EyeOff, UserCircle2, ArrowLeft } from "lucide-react";
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
    if (p >= 14) return "from-indigo-400/30 via-purple-400/10 to-transparent";
    if (p >= 10) return "from-purple-400/30 via-pink-400/10 to-transparent";
    return "from-pink-400/25 via-rose-400/10 to-transparent";
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
        setErrorMsg(String(data?.error || "登录验证失败，请核对密码"));
        return;
      }

      setStatus("idle");
      navigate(ROUTES.dashboard);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg("网络连接异常，请稍后重试");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-rose-500/30 selection:text-white relative overflow-hidden font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={cn("absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-40 transition-all duration-1000", `bg-gradient-to-br ${accent}`)} />
        <div className="absolute -bottom-[30%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[140px] opacity-30 bg-gradient-to-tr from-indigo-500/20 via-rose-500/10 to-transparent" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none noise-bg" />
      </div>

      <header className="relative z-10 h-20 px-6 lg:px-12 flex items-center justify-between">
        <button
          onClick={() => navigate(ROUTES.landing)}
          className="flex items-center gap-2.5 group text-white/60 hover:text-white transition-all"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">返回首页</span>
        </button>

        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate(ROUTES.landing)}>
          <div className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-bold text-xs tracking-tighter">
            XC
          </div>
          <span className="font-bold text-lg tracking-wide hidden sm:block">XcAISTUDIO</span>
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 pt-10 pb-20 min-h-[calc(100vh-80px)]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[1000px]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Content Column */}
            <div className="lg:col-span-7 flex flex-col justify-center py-6 lg:pr-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/5 mb-8 w-fit"
              >
                <Sparkles size={14} className="text-rose-400" />
                <span className="text-[11px] font-bold tracking-widest uppercase text-rose-200/80">
                  Welcome Back Creator
                </span>
              </motion.div>

              <h1 className="text-5xl lg:text-[72px] leading-[1.05] font-serif font-light tracking-tight">
                释放你的
                <br />
                <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-white via-rose-200 to-indigo-300">
                  创意潜能
                </span>
              </h1>
              
              <p className="mt-8 text-lg text-white/50 leading-relaxed max-w-[42ch] font-light">
                连接 XcAISTUDIO，通过先进的生成式 AI 技术将构思转化为现实。这里是创作者专属的设计枢纽。
              </p>

              <div className="mt-12 flex flex-wrap gap-8">
                <div className="flex flex-col gap-1">
                  <span className="text-2xl font-bold tracking-tight">24/7</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">AI 服务可用项目</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-2xl font-bold tracking-tight">HD+</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">超清视觉输出</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-2xl font-bold tracking-tight">NEW</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">实时工作流引擎</span>
                </div>
              </div>
            </div>

            {/* Right Auth Card Column */}
            <div className="lg:col-span-5">
              <div className="relative group">
                <div className="absolute -inset-px bg-gradient-to-br from-rose-500/30 to-indigo-500/30 rounded-[32px] blur-sm opacity-50 group-hover:opacity-100 transition duration-1000" />
                <div className="relative bg-[#0F0F11]/60 backdrop-blur-3xl border border-white/10 rounded-[32px] overflow-hidden shadow-2xl">
                  <form onSubmit={submit} className="p-8 lg:p-10">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
                        <UserCircle2 size={24} className="text-rose-200" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight">创作者登录</h2>
                        <p className="text-xs text-white/40 mt-1">请输入您的通行码以进入工作室</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="group/input">
                        <label className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">
                          Passkey / 口令
                        </label>
                        <div className="mt-2 relative">
                          <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="请输入工作室通行证密码"
                            className="w-full h-14 rounded-2xl bg-white/5 border border-white/5 px-5 pr-14 text-sm text-white placeholder:text-white/20 outline-none focus:bg-white/[0.08] focus:border-rose-500/30 transition-all duration-300 ring-0 hover:border-white/20"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute top-1/2 -translate-y-1/2 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                            title={showPassword ? "隐藏" : "显示"}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {status === "error" && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs leading-relaxed flex gap-3 items-start"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-0.5 shrink-0" />
                        {errorMsg}
                      </motion.div>
                    )}

                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={cn(
                        "mt-10 w-full h-14 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                        canSubmit
                          ? "bg-white text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:-translate-y-0.5"
                          : "bg-white/10 text-white/20 cursor-not-allowed",
                      )}
                    >
                      <span>{status === "loading" ? "正在连接服务..." : "开始设计之旅"}</span>
                      {status !== "loading" && <ArrowRight size={18} />}
                    </button>

                    <div className="mt-8 pt-8 border-t border-white/5">
                      <div className="flex items-center justify-between text-xs text-white/30">
                        <span>还没有账号？</span>
                        <button 
                          type="button"
                          className="font-bold text-white/60 hover:text-white transition-colors underline underline-offset-4"
                          onClick={() => alert("目前处于测试阶段，请联系站长获取通行证。")}
                        >
                          立即注册
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="absolute bottom-8 left-0 right-0 px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4 z-10">
        <div className="text-[11px] text-white/20 font-medium tracking-widest uppercase">
          © 2026 XcAISTUDIO Intelligence. All rights reserved.
        </div>
        <div className="flex items-center gap-6 text-[11px] text-white/40 font-medium">
          <a href="#" className="hover:text-white transition-colors">使用条款</a>
          <a href="#" className="hover:text-white transition-colors">隐私政策</a>
          <span className="text-white/10">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            系统运行正常
          </span>
        </div>
      </footer>
    </div>
  );
}
