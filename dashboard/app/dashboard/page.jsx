// dashboard/app/dashboard/page.jsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { formatDistanceToNow, format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";

// ─── colour tokens ───────────────────────────────────────────
const C = {
  bg:     "#0a0a0f",
  surface:"#111118",
  border: "#1e1e2e",
  accent: "#e8ff47",        // electric chartreuse
  accent2:"#7b61ff",        // violet
  accent3:"#ff6b35",        // burnt orange
  text:   "#f0f0f8",
  muted:  "#6b6b8a",
};

// ─── tiny helpers ────────────────────────────────────────────
const badge = (label, color) => (
  <span style={{
    background: color + "22", color, border: `1px solid ${color}55`,
    padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
  }}>{label}</span>
);

const STATUS_COLOR = {
  draft:     "#6b6b8a",
  approved:  "#e8ff47",
  published: "#00d4aa",
  rejected:  "#ff4455",
};

const SOURCE_ICON = {
  rss:        "📡",
  reddit:     "🟠",
  hackernews: "🔶",
  twitter:    "𝕏",
};

// ─── stat card ───────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderTop: `3px solid ${accent}`,
      padding: "24px 28px", borderRadius: 8,
    }}>
      <div style={{ color: C.muted, fontSize: 11, letterSpacing: "0.12em",
        textTransform: "uppercase", fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ color: C.text, fontSize: 40, fontFamily: "'Syne', sans-serif",
        fontWeight: 800, lineHeight: 1 }}>
        {value ?? "—"}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ─── pipeline status pill ────────────────────────────────────
function AgentStatus({ run }) {
  if (!run) return <span style={{ color: C.muted, fontSize: 13 }}>No runs yet</span>;
  const color = run.status === "success" ? "#00d4aa" : run.status === "failed" ? "#ff4455" : C.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: run.status === "running" ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ color, fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
        {run.status.toUpperCase()}
      </span>
      <span style={{ color: C.muted, fontSize: 12 }}>
        {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
      </span>
    </div>
  );
}

// ─── main dashboard ──────────────────────────────────────────
export default function Dashboard() {
  const [stats,     setStats]     = useState(null);
  const [rawItems,  setRawItems]  = useState([]);
  const [genItems,  setGenItems]  = useState([]);
  const [runs,      setRuns]      = useState([]);
  const [tab,       setTab]       = useState("queue");  // queue | raw | runs
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);

  const loadData = useCallback(async () => {
    const [rawRes, genRes, runsRes] = await Promise.all([
      supabase.from("raw_content").select("*").order("fetched_at", { ascending: false }).limit(100),
      supabase.from("generated_content").select("*, raw_content(title, source)").order("created_at", { ascending: false }).limit(50),
      supabase.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(30),
    ]);

    const raw = rawRes.data ?? [];
    const gen = genRes.data ?? [];
    const runData = runsRes.data ?? [];

    setRawItems(raw);
    setGenItems(gen);
    setRuns(runData);

    // Compute stats
    const lastResearcher = runData.find(r => r.agent === "researcher");
    const lastCreator    = runData.find(r => r.agent === "creator");
    setStats({
      totalRaw:    raw.length,
      totalGen:    gen.length,
      drafts:      gen.filter(g => g.status === "draft").length,
      approved:    gen.filter(g => g.status === "approved").length,
      published:   gen.filter(g => g.status === "published").length,
      lastResearcher,
      lastCreator,
      avgScore:    raw.length
        ? (raw.reduce((s, i) => s + (i.relevance_score || 0), 0) / raw.length).toFixed(1)
        : 0,
    });

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadData]);

  // Update content status
  const updateStatus = async (id, status) => {
    await supabase.from("generated_content").update({ status }).eq("id", id);
    loadData();
  };

  // Chart data — runs per day
  const chartData = (() => {
    const byDay = {};
    runs.forEach(r => {
      const d = format(new Date(r.started_at), "MMM d");
      if (!byDay[d]) byDay[d] = { date: d, researcher: 0, creator: 0 };
      byDay[d][r.agent]++;
    });
    return Object.values(byDay).slice(-7).reverse();
  })();

  // Score distribution
  const scoreData = (() => {
    const buckets = Array(10).fill(0);
    rawItems.forEach(i => {
      const b = Math.floor(Math.min(i.relevance_score ?? 0, 9.9));
      buckets[b]++;
    });
    return buckets.map((count, i) => ({ score: `${i}-${i+1}`, count }));
  })();

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.accent, fontFamily: "'DM Mono', monospace",
        fontSize: 14, letterSpacing: "0.2em" }}>LOADING PIPELINE…</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Inter', sans-serif",
      color: C.text }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        * { box-sizing: border-box; margin: 0; }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64,
        position: "sticky", top: 0, zIndex: 100,
        background: C.bg + "ee", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            background: C.accent, color: C.bg, fontFamily: "'Syne', sans-serif",
            fontWeight: 800, fontSize: 13, padding: "4px 10px", letterSpacing: "0.05em",
          }}>AGENT</div>
          <span style={{ color: C.muted, fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
            content pipeline / dashboard
          </span>
        </div>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>RESEARCHER</div>
            <AgentStatus run={stats?.lastResearcher} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>CREATOR</div>
            <AgentStatus run={stats?.lastCreator} />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 40px" }}>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 40 }}>
          <StatCard label="Raw Items"   value={stats?.totalRaw}  accent={C.accent2} sub="fetched this session" />
          <StatCard label="Generated"   value={stats?.totalGen}  accent={C.accent}  sub="total content pieces" />
          <StatCard label="In Draft"    value={stats?.drafts}    accent={C.muted}   sub="awaiting review" />
          <StatCard label="Approved"    value={stats?.approved}  accent={C.accent}  sub="ready to publish" />
          <StatCard label="Published"   value={stats?.published} accent="#00d4aa"   sub="live content" />
        </div>

        {/* ── Charts ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "24px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14,
              fontWeight: 700, marginBottom: 20, color: C.muted, letterSpacing: "0.08em" }}>
              AGENT RUNS — LAST 7 DAYS
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4 }} />
                <Area type="monotone" dataKey="researcher" stroke={C.accent2} fill={C.accent2 + "22"} strokeWidth={2} />
                <Area type="monotone" dataKey="creator" stroke={C.accent} fill={C.accent + "22"} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "24px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14,
              fontWeight: 700, marginBottom: 20, color: C.muted, letterSpacing: "0.08em" }}>
              RELEVANCE SCORE DISTRIBUTION
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoreData}>
                <XAxis dataKey="score" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4 }} />
                <Bar dataKey="count" fill={C.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24,
          borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {["queue", "raw", "runs"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 20px",
              fontFamily: "'DM Mono', monospace", fontSize: 12,
              fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
              color: tab === t ? C.accent : C.muted,
              borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}>
              {t === "queue" ? `Content Queue (${stats?.drafts})` : t === "raw" ? `Raw Feed (${rawItems.length})` : "Pipeline Runs"}
            </button>
          ))}
        </div>

        {/* ── Content Queue Tab ── */}
        {tab === "queue" && (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 480px" : "1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {genItems.length === 0 && (
                <div style={{ color: C.muted, padding: "60px 0", textAlign: "center",
                  fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                  No generated content yet. Trigger the creator agent to get started.
                </div>
              )}
              {genItems.map(item => (
                <div key={item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  style={{
                    background: selected?.id === item.id ? C.surface : C.bg,
                    border: `1px solid ${selected?.id === item.id ? C.accent + "55" : C.border}`,
                    borderRadius: 8, padding: "16px 20px",
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 16,
                  }}
                >
                  <div style={{ fontSize: 20 }}>
                    {item.platform === "twitter_thread" ? "𝕏" : "📝"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title || item.hook?.slice(0, 80)}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {badge(item.platform === "twitter_thread" ? "Thread" : "Blog", C.accent2)}
                      {badge(item.status, STATUS_COLOR[item.status])}
                      <span style={{ color: C.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                        {item.raw_content?.source && SOURCE_ICON[item.raw_content.source]}
                        {" "}{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {item.status === "draft" && <>
                      <button onClick={e => { e.stopPropagation(); updateStatus(item.id, "approved"); }}
                        style={{ background: C.accent + "22", color: C.accent, border: `1px solid ${C.accent}44`,
                          padding: "5px 14px", borderRadius: 4, cursor: "pointer",
                          fontSize: 12, fontWeight: 600 }}>Approve</button>
                      <button onClick={e => { e.stopPropagation(); updateStatus(item.id, "rejected"); }}
                        style={{ background: "#ff445522", color: "#ff4455", border: "1px solid #ff445544",
                          padding: "5px 14px", borderRadius: 4, cursor: "pointer",
                          fontSize: 12, fontWeight: 600 }}>Reject</button>
                    </>}
                    {item.status === "approved" && (
                      <button onClick={e => { e.stopPropagation(); updateStatus(item.id, "published"); }}
                        style={{ background: "#00d4aa22", color: "#00d4aa", border: "1px solid #00d4aa44",
                          padding: "5px 14px", borderRadius: 4, cursor: "pointer",
                          fontSize: 12, fontWeight: 600 }}>Publish</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Side panel */}
            {selected && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "24px", position: "sticky", top: 80,
                maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16 }}>
                    {selected.platform === "twitter_thread" ? "𝕏 Thread Preview" : "📝 Article Preview"}
                  </div>
                  <button onClick={() => setSelected(null)}
                    style={{ background: "none", border: "none", color: C.muted,
                      cursor: "pointer", fontSize: 18 }}>✕</button>
                </div>
                {selected.title && (
                  <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16,
                    lineHeight: 1.3, color: C.text }}>{selected.title}</div>
                )}
                <div style={{ color: C.muted, fontSize: 12, fontFamily: "'DM Mono', monospace",
                  marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(selected.tags ?? []).map(t => (
                    <span key={t} style={{ background: C.border, padding: "2px 8px", borderRadius: 3 }}>#{t}</span>
                  ))}
                </div>
                {selected.platform === "twitter_thread" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selected.body?.split("\n---\n").map((tweet, i) => (
                      <div key={i} style={{
                        background: C.bg, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: "14px 16px", fontSize: 14,
                        lineHeight: 1.6, color: i === 0 ? C.text : C.text + "cc",
                      }}>
                        <span style={{ color: C.muted, fontSize: 11,
                          fontFamily: "'DM Mono', monospace", marginRight: 8 }}>
                          {i + 1}/
                        </span>
                        {tweet}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: C.text + "cc",
                    whiteSpace: "pre-wrap" }}>
                    {selected.body}
                  </div>
                )}
                {selected.impact_score && (
                  <div style={{ marginTop: 20, padding: "12px 16px",
                    background: C.accent + "11", border: `1px solid ${C.accent}33`,
                    borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    Impact Score: <span style={{ color: C.accent, fontWeight: 700 }}>
                      {selected.impact_score.toFixed(1)}/10
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Raw Feed Tab ── */}
        {tab === "raw" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rawItems.map(item => (
              <div key={item.id} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <span style={{ fontSize: 18 }}>{SOURCE_ICON[item.source] ?? "🌐"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={item.source_url} target="_blank" rel="noopener"
                      style={{ color: C.text, textDecoration: "none" }}
                      onClick={e => e.stopPropagation()}>{item.title}</a>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {item.category && badge(item.category, C.accent2)}
                    {item.sentiment && badge(item.sentiment,
                      item.sentiment === "positive" ? "#00d4aa" :
                      item.sentiment === "negative" ? "#ff4455" : C.muted)}
                    <span style={{ color: C.muted, fontSize: 11,
                      fontFamily: "'DM Mono', monospace" }}>
                      {formatDistanceToNow(new Date(item.fetched_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800,
                      fontFamily: "'Syne', sans-serif",
                      color: (item.relevance_score ?? 0) >= 7 ? C.accent : C.muted }}>
                      {(item.relevance_score ?? 0).toFixed(1)}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>REL</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800,
                      fontFamily: "'Syne', sans-serif",
                      color: (item.novelty_score ?? 0) >= 7 ? C.accent3 : C.muted }}>
                      {(item.novelty_score ?? 0).toFixed(1)}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>NOV</div>
                  </div>
                  <div>
                    {item.processed
                      ? badge("Processed", "#00d4aa")
                      : badge("Pending", C.muted)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pipeline Runs Tab ── */}
        {tab === "runs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {runs.map(run => (
              <div key={run.id} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "14px 20px",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: run.status === "success" ? "#00d4aa" :
                    run.status === "failed" ? "#ff4455" : C.accent,
                  boxShadow: run.status === "running"
                    ? `0 0 8px ${C.accent}` : "none",
                }} />
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12,
                  color: C.muted, width: 90 }}>
                  {run.agent.toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: C.text }}>
                  {run.items_fetched > 0 && `Fetched ${run.items_fetched} items`}
                  {run.items_created > 0 && ` · Created ${run.items_created} pieces`}
                  {run.error_message && (
                    <span style={{ color: "#ff4455" }}> ⚠ {run.error_message.slice(0, 80)}</span>
                  )}
                  {!run.items_fetched && !run.items_created && !run.error_message && "Run completed"}
                </div>
                <div style={{ color: C.muted, fontSize: 11,
                  fontFamily: "'DM Mono', monospace", textAlign: "right" }}>
                  <div>{format(new Date(run.started_at), "MMM d, HH:mm")}</div>
                  {run.duration_ms && (
                    <div style={{ color: C.accent + "aa" }}>
                      {(run.duration_ms / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
