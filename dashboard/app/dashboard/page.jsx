// dashboard/app/dashboard/page.jsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { formatDistanceToNow, format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";

// ─── design tokens ───────────────────────────────────────────
const C = {
  bg:      "#07070e",
  glass:   "rgba(255,255,255,0.04)",
  glass2:  "rgba(255,255,255,0.08)",
  border:  "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.13)",
  accent:  "#e8ff47",
  accent2: "#7b61ff",
  accent3: "#ff6b35",
  success: "#00d4aa",
  error:   "#ff4455",
  text:    "#f0f0f8",
  muted:   "#7a7a9a",
};

const glass = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 16,
};

// ─── icons ───────────────────────────────────────────────────
const LayersIcon   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
const RssIcon      = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1" fill="currentColor"/></svg>;
const ActivityIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const DatabaseIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
const SearchIcon   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;

// ─── helpers ─────────────────────────────────────────────────
const badge = (label, color) => (
  <span style={{
    background: color + "20", color, border: `1px solid ${color}44`,
    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
  }}>{label}</span>
);

const STATUS_COLOR = { draft: C.muted, approved: C.accent, published: C.success, rejected: C.error };
const SOURCE_ICON  = { rss: "📡", reddit: "🟠", hackernews: "🔶", twitter: "𝕏" };

// ─── empty state ─────────────────────────────────────────────
function EmptyState({ icon, title, message }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.25 }}>{icon}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700,
        color: C.text, marginBottom: 8 }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13, maxWidth: 300, margin: "0 auto", lineHeight: 1.6 }}>{message}</div>
    </div>
  );
}

// ─── stat card ───────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...glass, padding: "24px", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: -24, right: -24,
        width: 88, height: 88, borderRadius: "50%",
        background: accent + "20", filter: "blur(24px)", pointerEvents: "none",
      }} />
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.1em",
        textTransform: "uppercase", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 44, fontFamily: "'Syne', sans-serif",
        fontWeight: 800, lineHeight: 1, color: C.text, marginBottom: 6 }}>
        {value ?? "—"}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

// ─── agent status ─────────────────────────────────────────────
function AgentStatus({ label, run }) {
  const color = !run ? C.muted
    : run.status === "success" ? C.success
    : run.status === "failed"  ? C.error
    : C.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0,
        boxShadow: run && run.status !== "failed" ? `0 0 6px ${color}` : "none",
        animation: run?.status === "running" ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.06em", flex: 1 }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 11, color }}>
        {!run ? "–" : run.status.toUpperCase()}
      </span>
    </div>
  );
}

// ─── main dashboard ──────────────────────────────────────────
export default function Dashboard() {
  const [stats,       setStats]       = useState(null);
  const [rawItems,    setRawItems]    = useState([]);
  const [genItems,    setGenItems]    = useState([]);
  const [runs,        setRuns]        = useState([]);
  const [tab,         setTab]         = useState("queue");
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [sources,     setSources]     = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSource,   setNewSource]   = useState({ type: "rss", value: "", category: "" });
  const [sourceError, setSourceError] = useState("");
  const [toast,       setToast]       = useState(null);
  const [rawSearch,   setRawSearch]   = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    const [rawRes, genRes, runsRes] = await Promise.all([
      supabase.from("raw_content").select("*").order("fetched_at", { ascending: false }).limit(100),
      supabase.from("generated_content").select("*, raw_content(title, source)").order("created_at", { ascending: false }).limit(50),
      supabase.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(30),
    ]);

    const raw     = rawRes.data  ?? [];
    const gen     = genRes.data  ?? [];
    const runData = runsRes.data ?? [];

    setRawItems(raw);
    setGenItems(gen);
    setRuns(runData);

    const lastResearcher = runData.find(r => r.agent === "researcher");
    const lastCreator    = runData.find(r => r.agent === "creator");
    setStats({
      totalRaw:  raw.length,
      totalGen:  gen.length,
      drafts:    gen.filter(g => g.status === "draft").length,
      approved:  gen.filter(g => g.status === "approved").length,
      published: gen.filter(g => g.status === "published").length,
      lastResearcher, lastCreator,
      avgScore: raw.length
        ? (raw.reduce((s, i) => s + (i.relevance_score || 0), 0) / raw.length).toFixed(1)
        : 0,
    });

    setLoading(false);
  }, []);

  const loadSources = useCallback(async () => {
    const { data } = await supabase.from("sources").select("*").order("created_at", { ascending: true });
    setSources(data ?? []);
  }, []);

  useEffect(() => { loadData(); loadSources(); }, [loadData, loadSources]);

  useEffect(() => {
    const ch = supabase.channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadData]);

  useEffect(() => {
    const ch = supabase.channel("sources-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sources" }, loadSources)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadSources]);

  const updateStatus = async (id, status) => {
    await supabase.from("generated_content").update({ status }).eq("id", id);
    showToast(`Content ${status}`);
    loadData();
  };

  const toggleSource = async (id, enabled) => {
    await supabase.from("sources").update({ enabled: !enabled }).eq("id", id);
  };

  const deleteSource = async (id) => {
    await supabase.from("sources").delete().eq("id", id);
    showToast("Source removed");
  };

  const addSource = async () => {
    setSourceError("");
    if (!newSource.value.trim())    { setSourceError("Value is required");    return; }
    if (!newSource.category.trim()) { setSourceError("Category is required"); return; }
    const value = newSource.type === "x_account"
      ? newSource.value.replace(/^@/, "").trim()
      : newSource.value.trim();
    const { error } = await supabase.from("sources").insert({
      type: newSource.type, value, category: newSource.category.trim(), enabled: true,
    });
    if (error) { setSourceError(error.message); return; }
    setNewSource({ type: "rss", value: "", category: "" });
    setShowAddForm(false);
    showToast("Source added");
  };

  // chart data
  const chartData = (() => {
    const byDay = {};
    runs.forEach(r => {
      const d = format(new Date(r.started_at), "MMM d");
      if (!byDay[d]) byDay[d] = { date: d, researcher: 0, creator: 0 };
      byDay[d][r.agent]++;
    });
    return Object.values(byDay).slice(-7).reverse();
  })();

  const scoreData = (() => {
    const buckets = Array(10).fill(0);
    rawItems.forEach(i => {
      const b = Math.floor(Math.min(i.relevance_score ?? 0, 9.9));
      buckets[b]++;
    });
    return buckets.map((count, i) => ({ score: `${i}–${i+1}`, count }));
  })();

  const filteredRaw = rawItems.filter(i =>
    !rawSearch || i.title?.toLowerCase().includes(rawSearch.toLowerCase())
  );

  const NAV_ITEMS = [
    { id: "queue",   label: "Content Queue", icon: <LayersIcon />,   count: stats?.drafts },
    { id: "raw",     label: "Raw Feed",       icon: <RssIcon />,      count: rawItems.length },
    { id: "runs",    label: "Pipeline Runs",  icon: <ActivityIcon />, count: null },
    { id: "sources", label: "Sources",        icon: <DatabaseIcon />, count: sources.length },
  ];

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, margin: "0 auto 20px",
          background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: C.bg, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif" }}>A</span>
        </div>
        <div style={{ color: C.muted, fontFamily: "'DM Mono', monospace",
          fontSize: 12, letterSpacing: "0.2em" }}>LOADING PIPELINE…</div>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
      fontFamily: "'Inter', sans-serif", color: C.text }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        * { box-sizing: border-box; margin: 0; }
        .nav-btn:hover { background: rgba(255,255,255,0.06) !important; color: ${C.text} !important; }
        .nav-btn:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 8px; }
        .glass-row { transition: background 0.15s, border-color 0.15s; }
        .glass-row:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; }
        .glass-row:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 12px; }
        button:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 4px; }
        input:focus, select:focus { outline: none !important; border-color: rgba(232,255,71,0.45) !important; box-shadow: 0 0 0 3px rgba(232,255,71,0.08) !important; }
        a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 2px; }
        .del-btn:hover { color: ${C.error} !important; background: rgba(255,68,85,0.1) !important; }
      `}</style>

      {/* ── Sidebar ── */}
      <nav aria-label="Main navigation" style={{
        width: 240, flexShrink: 0, position: "fixed",
        left: 0, top: 0, bottom: 0, zIndex: 100,
        background: "rgba(7,7,14,0.97)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Brand */}
        <div style={{ padding: "28px 20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${C.accent2}44`,
            }}>
              <span style={{ color: C.bg, fontSize: 15, fontWeight: 900,
                fontFamily: "'Syne', sans-serif" }}>A</span>
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 700,
                fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>Agent</div>
              <div style={{ color: C.muted, fontSize: 10,
                fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em" }}>
                content pipeline
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "12px 10px", display: "flex",
          flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className="nav-btn"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                cursor: "pointer", border: "none", width: "100%",
                textAlign: "left",
                background: tab === item.id ? `${C.accent}12` : "transparent",
                borderLeft: `2px solid ${tab === item.id ? C.accent : "transparent"}`,
                color: tab === item.id ? C.accent : C.muted,
                transition: "all 0.15s",
              }}
            >
              {item.icon}
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.label}</span>
              {item.count != null && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: tab === item.id ? C.accent + "20" : "rgba(255,255,255,0.07)",
                  color: tab === item.id ? C.accent : C.muted,
                  padding: "2px 8px", borderRadius: 20, minWidth: 24, textAlign: "center",
                }}>{item.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Agent status */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.1em", marginBottom: 12 }}>AGENTS</div>
          <AgentStatus label="Researcher" run={stats?.lastResearcher} />
          <AgentStatus label="Creator"    run={stats?.lastCreator} />
        </div>
      </nav>

      {/* ── Main content ── */}
      <main style={{ marginLeft: 240, flex: 1, padding: "40px 48px",
        minHeight: "100vh", maxWidth: "calc(100vw - 240px)" }}>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16, marginBottom: 32 }}>
          <StatCard label="Raw Items"  value={stats?.totalRaw}  accent={C.accent2} sub="fetched total" />
          <StatCard label="Generated"  value={stats?.totalGen}  accent={C.accent}  sub="content pieces" />
          <StatCard label="In Draft"   value={stats?.drafts}    accent={C.muted}   sub="awaiting review" />
          <StatCard label="Approved"   value={stats?.approved}  accent={C.accent}  sub="ready to publish" />
          <StatCard label="Published"  value={stats?.published} accent={C.success} sub="live content" />
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
          <div style={{ ...glass, padding: "24px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500,
              marginBottom: 20, color: C.muted, letterSpacing: "0.1em",
              textTransform: "uppercase" }}>
              Agent Runs — Last 7 Days
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gr1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.accent2} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.accent2} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gr2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.accent} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111120", border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="researcher" stroke={C.accent2} fill="url(#gr1)" strokeWidth={2} />
                <Area type="monotone" dataKey="creator"    stroke={C.accent}  fill="url(#gr2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...glass, padding: "24px" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500,
              marginBottom: 20, color: C.muted, letterSpacing: "0.1em",
              textTransform: "uppercase" }}>
              Relevance Score Distribution
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={scoreData}>
                <XAxis dataKey="score" tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111120", border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={C.accent} radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Section header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800,
            color: C.text, marginBottom: 4 }}>
            {tab === "queue"   ? "Content Queue"
             : tab === "raw"   ? "Raw Feed"
             : tab === "runs"  ? "Pipeline Runs"
             : "Sources"}
          </h1>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {tab === "queue"   ? "Review and approve AI-generated content"
             : tab === "raw"   ? "All fetched content items, scored by relevance"
             : tab === "runs"  ? "Agent execution history and status"
             : "Manage content sources — RSS feeds, Reddit, X accounts"}
          </p>
        </div>

        {/* ── Content Queue ── */}
        {tab === "queue" && (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 460px" : "1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {genItems.length === 0 && (
                <EmptyState icon="✦" title="No content yet"
                  message="Trigger the creator agent from GitHub Actions to generate your first content pieces." />
              )}
              {genItems.map(item => (
                <div key={item.id} className="glass-row"
                  role="button" tabIndex={0}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  onKeyDown={e => e.key === "Enter" && setSelected(selected?.id === item.id ? null : item)}
                  style={{
                    ...glass,
                    borderRadius: 12, padding: "16px 20px",
                    cursor: "pointer",
                    border: `1px solid ${selected?.id === item.id ? C.accent + "44" : C.border}`,
                    background: selected?.id === item.id ? `${C.accent}08` : C.glass,
                    display: "flex", alignItems: "center", gap: 16,
                    animation: "fadeIn 0.2s ease",
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: item.platform === "twitter_thread" ? C.accent2 + "20" : C.accent3 + "20",
                    border: `1px solid ${item.platform === "twitter_thread" ? C.accent2 + "40" : C.accent3 + "40"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>
                    {item.platform === "twitter_thread" ? "𝕏" : "📝"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: C.text }}>
                      {item.title || item.hook?.slice(0, 80)}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {badge(item.platform === "twitter_thread" ? "Thread" : "Blog", C.accent2)}
                      {badge(item.status, STATUS_COLOR[item.status])}
                      <span style={{ color: C.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                        {item.raw_content?.source && SOURCE_ICON[item.raw_content.source]}
                        {" "}{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {item.status === "draft" && <>
                      <button
                        aria-label="Approve content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "approved"); }}
                        style={{ background: C.accent + "18", color: C.accent,
                          border: `1px solid ${C.accent}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        Approve
                      </button>
                      <button
                        aria-label="Reject content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "rejected"); }}
                        style={{ background: C.error + "18", color: C.error,
                          border: `1px solid ${C.error}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        Reject
                      </button>
                    </>}
                    {item.status === "approved" && (
                      <button
                        aria-label="Publish content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "published"); }}
                        style={{ background: C.success + "18", color: C.success,
                          border: `1px solid ${C.success}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        Publish
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview panel */}
            {selected && (
              <div style={{ ...glass, padding: "28px", position: "sticky", top: 32,
                maxHeight: "calc(100vh - 64px)", overflowY: "auto",
                animation: "fadeIn 0.2s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800,
                      fontSize: 15, color: C.text, marginBottom: 4 }}>
                      {selected.platform === "twitter_thread" ? "𝕏 Thread Preview" : "📝 Article Preview"}
                    </div>
                    {selected.impact_score && (
                      <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace",
                        color: C.accent }}>
                        Impact {selected.impact_score.toFixed(1)}/10
                      </div>
                    )}
                  </div>
                  <button
                    aria-label="Close preview"
                    onClick={() => setSelected(null)}
                    style={{ background: C.glass2, border: `1px solid ${C.border}`,
                      color: C.muted, cursor: "pointer", width: 32, height: 32,
                      borderRadius: 8, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✕</button>
                </div>

                {selected.title && (
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16,
                    lineHeight: 1.4, color: C.text }}>{selected.title}</div>
                )}

                {(selected.tags ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                    {selected.tags.map(t => (
                      <span key={t} style={{ background: C.glass2, border: `1px solid ${C.border}`,
                        color: C.muted, padding: "3px 10px", borderRadius: 6,
                        fontSize: 11, fontFamily: "'DM Mono', monospace" }}>#{t}</span>
                    ))}
                  </div>
                )}

                {selected.platform === "twitter_thread" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selected.body?.split("\n---\n").map((tweet, i) => (
                      <div key={i} style={{
                        background: i === 0 ? C.glass2 : C.glass,
                        border: `1px solid ${i === 0 ? C.border2 : C.border}`,
                        borderRadius: 10, padding: "14px 16px",
                        fontSize: 13, lineHeight: 1.65,
                      }}>
                        <span style={{ color: C.accent, fontSize: 10,
                          fontFamily: "'DM Mono', monospace", marginRight: 8 }}>{i + 1}/</span>
                        {tweet}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.85, color: C.text + "cc",
                    whiteSpace: "pre-wrap" }}>
                    {selected.body}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Raw Feed ── */}
        {tab === "raw" && (
          <div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 14, top: "50%",
                transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }}>
                <SearchIcon />
              </span>
              <input
                value={rawSearch}
                onChange={e => setRawSearch(e.target.value)}
                placeholder="Search raw feed…"
                aria-label="Search raw feed"
                style={{
                  background: C.glass, border: `1px solid ${C.border}`,
                  color: C.text, borderRadius: 10, padding: "10px 16px 10px 38px",
                  fontSize: 13, width: "100%", fontFamily: "'Inter', sans-serif",
                  transition: "border-color 0.15s",
                }}
              />
            </div>

            {filteredRaw.length === 0 && (
              rawSearch
                ? <EmptyState icon="🔍" title="No results" message={`Nothing matched "${rawSearch}"`} />
                : <EmptyState icon="📡" title="No items yet" message="Trigger the researcher agent to start fetching content." />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredRaw.map(item => (
                <div key={item.id} className="glass-row" style={{
                  ...glass, borderRadius: 12, padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{SOURCE_ICON[item.source] ?? "🌐"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        aria-label={`Open: ${item.title}`}
                        style={{ color: C.text, textDecoration: "none" }}
                        onClick={e => e.stopPropagation()}>{item.title}</a>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {item.category && badge(item.category, C.accent2)}
                      {item.sentiment && badge(item.sentiment,
                        item.sentiment === "positive" ? C.success :
                        item.sentiment === "negative" ? C.error : C.muted)}
                      <span style={{ color: C.muted, fontSize: 11,
                        fontFamily: "'DM Mono', monospace" }}>
                        {formatDistanceToNow(new Date(item.fetched_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "center", minWidth: 32 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Syne', sans-serif",
                        color: (item.relevance_score ?? 0) >= 7 ? C.accent : C.muted }}>
                        {(item.relevance_score ?? 0).toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>REL</div>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 32 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Syne', sans-serif",
                        color: (item.novelty_score ?? 0) >= 7 ? C.accent3 : C.muted }}>
                        {(item.novelty_score ?? 0).toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>NOV</div>
                    </div>
                    {item.processed ? badge("Done", C.success) : badge("Pending", C.muted)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pipeline Runs ── */}
        {tab === "runs" && (
          <div>
            {runs.length === 0 && (
              <EmptyState icon="⚡" title="No runs yet"
                message="Agent runs will appear here once triggered from GitHub Actions." />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {runs.map(run => {
                const statusColor = run.status === "success" ? C.success
                  : run.status === "failed" ? C.error : C.accent;
                return (
                  <div key={run.id} className="glass-row" style={{
                    ...glass, borderRadius: 12, padding: "16px 20px",
                    display: "flex", alignItems: "center", gap: 16,
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                      background: statusColor,
                      boxShadow: run.status === "running" ? `0 0 10px ${statusColor}` : "none",
                      animation: run.status === "running" ? "pulse 1s infinite" : "none",
                    }} />
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
                      color: C.muted, width: 80, letterSpacing: "0.06em" }}>
                      {run.agent.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: C.text }}>
                      {run.items_fetched > 0 && `Fetched ${run.items_fetched} items`}
                      {run.items_created > 0 && ` · Created ${run.items_created} pieces`}
                      {run.error_message && (
                        <span style={{ color: C.error }}> ⚠ {run.error_message.slice(0, 80)}</span>
                      )}
                      {!run.items_fetched && !run.items_created && !run.error_message && (
                        <span style={{ color: C.muted }}>Run completed</span>
                      )}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11,
                      fontFamily: "'DM Mono', monospace", textAlign: "right" }}>
                      <div>{format(new Date(run.started_at), "MMM d, HH:mm")}</div>
                      {run.duration_ms && (
                        <div style={{ color: C.accent + "99", marginTop: 2 }}>
                          {(run.duration_ms / 1000).toFixed(1)}s
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sources ── */}
        {tab === "sources" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button
                aria-expanded={showAddForm}
                onClick={() => { setShowAddForm(!showAddForm); setSourceError(""); }}
                style={{
                  background: showAddForm ? C.glass2 : C.accent + "18",
                  color: showAddForm ? C.muted : C.accent,
                  border: `1px solid ${showAddForm ? C.border : C.accent + "44"}`,
                  padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.08em", transition: "all 0.15s",
                }}>
                {showAddForm ? "Cancel" : "+ Add Source"}
              </button>
            </div>

            {showAddForm && (
              <div style={{ ...glass, borderColor: C.accent + "30",
                padding: "24px", marginBottom: 16, animation: "fadeIn 0.2s ease" }}>
                <div style={{ display: "grid",
                  gridTemplateColumns: "160px 1fr 180px auto", gap: 12, alignItems: "end" }}>
                  <div>
                    <label htmlFor="src-type" style={{ display: "block", fontSize: 11,
                      color: C.muted, fontFamily: "'DM Mono', monospace",
                      letterSpacing: "0.1em", marginBottom: 6 }}>TYPE</label>
                    <select id="src-type" value={newSource.type}
                      onChange={e => setNewSource(s => ({ ...s, type: e.target.value, value: "" }))}
                      style={{ background: "#0f0f1a", color: C.text,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "9px 12px", fontSize: 13, width: "100%",
                        fontFamily: "'Inter', sans-serif", cursor: "pointer" }}>
                      <option value="rss">RSS Feed</option>
                      <option value="reddit">Reddit</option>
                      <option value="x_account">X Account</option>
                      <option value="hackernews">HackerNews</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="src-value" style={{ display: "block", fontSize: 11,
                      color: C.muted, fontFamily: "'DM Mono', monospace",
                      letterSpacing: "0.1em", marginBottom: 6 }}>
                      {newSource.type === "rss" ? "FEED URL"
                       : newSource.type === "reddit" ? "SUBREDDIT"
                       : newSource.type === "x_account" ? "X HANDLE"
                       : "VALUE"}
                    </label>
                    <input id="src-value" value={newSource.value}
                      onChange={e => setNewSource(s => ({ ...s, value: e.target.value }))}
                      placeholder={
                        newSource.type === "rss"         ? "https://example.com/feed.xml"
                        : newSource.type === "reddit"    ? "CryptoCurrency"
                        : newSource.type === "x_account" ? "@handle"
                        : "enabled"
                      }
                      style={{ background: "#0f0f1a", color: C.text,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "9px 12px", fontSize: 13, width: "100%",
                        fontFamily: "'Inter', sans-serif" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="src-cat" style={{ display: "block", fontSize: 11,
                      color: C.muted, fontFamily: "'DM Mono', monospace",
                      letterSpacing: "0.1em", marginBottom: 6 }}>CATEGORY</label>
                    <input id="src-cat" value={newSource.category}
                      onChange={e => setNewSource(s => ({ ...s, category: e.target.value }))}
                      placeholder="e.g. DeFi, Bitcoin"
                      style={{ background: "#0f0f1a", color: C.text,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "9px 12px", fontSize: 13, width: "100%",
                        fontFamily: "'Inter', sans-serif" }}
                    />
                  </div>
                  <button onClick={addSource} style={{
                    background: C.accent, color: C.bg, border: "none",
                    padding: "10px 20px", borderRadius: 8, cursor: "pointer",
                    fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                    letterSpacing: "0.06em", whiteSpace: "nowrap",
                  }}>ADD</button>
                </div>
                {sourceError && (
                  <div role="alert" style={{ color: C.error, fontSize: 12,
                    fontFamily: "'DM Mono', monospace", marginTop: 12 }}>
                    ⚠ {sourceError}
                  </div>
                )}
              </div>
            )}

            {sources.length === 0 && !showAddForm && (
              <EmptyState icon="🗄️" title="No sources yet"
                message="Add RSS feeds, Reddit subreddits, or X accounts to start fetching content." />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sources.map(src => {
                const TYPE_COLOR  = { rss: C.accent2, reddit: C.accent3, x_account: "#1d9bf0", hackernews: "#ff6600" };
                const TYPE_LABEL  = { rss: "RSS", reddit: "Reddit", x_account: "X", hackernews: "HN" };
                const color = TYPE_COLOR[src.type] ?? C.muted;
                return (
                  <div key={src.id} className="glass-row" style={{
                    ...glass, borderRadius: 12, padding: "14px 20px",
                    display: "flex", alignItems: "center", gap: 14,
                    opacity: src.enabled ? 1 : 0.4, transition: "opacity 0.2s",
                  }}>
                    {badge(TYPE_LABEL[src.type] ?? src.type, color)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {src.type === "x_account" ? `@${src.value}` : src.value}
                      </div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 12,
                      fontFamily: "'DM Mono', monospace", minWidth: 80 }}>
                      {src.category}
                    </div>
                    <button
                      aria-label={src.enabled ? "Disable source" : "Enable source"}
                      onClick={() => toggleSource(src.id, src.enabled)}
                      style={{
                        background: src.enabled ? C.accent + "18" : C.glass2,
                        color: src.enabled ? C.accent : C.muted,
                        border: `1px solid ${src.enabled ? C.accent + "33" : C.border}`,
                        padding: "5px 14px", borderRadius: 8, cursor: "pointer",
                        fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                        letterSpacing: "0.08em", transition: "all 0.15s",
                      }}>
                      {src.enabled ? "ON" : "OFF"}
                    </button>
                    <button
                      className="del-btn"
                      aria-label={`Delete source ${src.value}`}
                      onClick={() => deleteSource(src.id)}
                      style={{
                        background: "none", color: C.muted, border: "none",
                        cursor: "pointer", width: 32, height: 32, borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, transition: "all 0.15s",
                      }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div role="status" aria-live="polite" style={{
          position: "fixed", bottom: 32, right: 32, zIndex: 999,
          background: toast.type === "error"
            ? `rgba(255,68,85,0.15)` : `rgba(0,212,170,0.15)`,
          border: `1px solid ${toast.type === "error" ? C.error + "55" : C.success + "55"}`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          color: toast.type === "error" ? C.error : C.success,
          padding: "12px 20px", borderRadius: 12,
          fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.2s ease",
        }}>
          {toast.type === "error" ? "✕" : "✓"} {toast.msg}
        </div>
      )}
    </div>
  );
}
