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
const ComposeIcon  = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const StarIcon     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;

// ─── helpers ─────────────────────────────────────────────────
const badge = (label, color) => (
  <span style={{
    background: color + "20", color, border: `1px solid ${color}44`,
    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
  }}>{label}</span>
);

const STATUS_COLOR = { draft: C.muted, approved: C.accent, published: C.success, rejected: C.error };
const SOURCE_ICON  = { rss: "📡", reddit: "🟠", hackernews: "🔶", twitter: "𝕏", bidclub: "💼" };
const SOURCE_COLOR = { rss: C.accent2, reddit: C.accent3, hackernews: "#ff6600", twitter: "#1d9bf0", bidclub: "#f59e0b" };

const DOMAIN_NAMES = {
  "cointelegraph.com":   "CoinTelegraph",
  "coindesk.com":        "CoinDesk",
  "decrypt.co":          "Decrypt",
  "theblock.co":         "The Block",
  "blockworks.co":       "Blockworks",
  "cryptoslate.com":     "CryptoSlate",
  "beincrypto.com":      "BeInCrypto",
  "bitcoinmagazine.com": "Bitcoin Magazine",
  "dlnews.com":          "DL News",
  "unchainedcrypto.com": "Unchained",
  "cryptobriefing.com":  "Crypto Briefing",
  "cryptonews.com":      "CryptoNews",
  "u.today":             "U.Today",
  "ambcrypto.com":       "AMBCrypto",
  "newsbtc.com":         "NewsBTC",
  "theinformation.com":  "The Information",
  "wired.com":           "Wired",
  "techcrunch.com":      "TechCrunch",
  "reuters.com":         "Reuters",
  "bloomberg.com":       "Bloomberg",
  "wsj.com":             "WSJ",
  "ft.com":              "FT",
  "forbes.com":          "Forbes",
};

function getSourceLabel(item) {
  if (item.source === "reddit") {
    const m = item.source_url?.match(/reddit\.com\/r\/([^/?#]+)/i);
    return m ? `r/${m[1]}` : "Reddit";
  }
  if (item.source === "twitter")    return item.author ? `@${item.author}` : "X";
  if (item.source === "hackernews") return "Hacker News";
  if (item.source === "bidclub")    return "BidClub";
  try {
    const hostname = new URL(item.source_url).hostname.replace(/^www\./, "");
    return DOMAIN_NAMES[hostname] ?? hostname;
  } catch {
    return item.author || "RSS";
  }
}

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
function StatCard({ label, value, sub, accent, compact }) {
  return (
    <div style={{ ...glass, padding: compact ? "16px" : "24px", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: -24, right: -24,
        width: 88, height: 88, borderRadius: "50%",
        background: accent + "20", filter: "blur(24px)", pointerEvents: "none",
      }} />
      <div style={{ fontSize: compact ? 9 : 11, color: C.muted, letterSpacing: "0.1em",
        textTransform: "uppercase", fontFamily: "'DM Mono', monospace", marginBottom: compact ? 8 : 12 }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? 32 : 44, fontFamily: "'Syne', sans-serif",
        fontWeight: 800, lineHeight: 1, color: C.text, marginBottom: 4 }}>
        {value ?? "—"}
      </div>
      {sub && !compact && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
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
  const [manualInput, setManualInput] = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [manualOutput,setManualOutput]= useState("");
  const [saving,      setSaving]      = useState(false);
  const [contentType, setContentType] = useState("news");
  const [genHistory,  setGenHistory]  = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [fetching,     setFetching]     = useState(false);
  const [isMobile,        setIsMobile]        = useState(false);
  const [previewOverlay,  setPreviewOverlay]  = useState(false);
  const [rawPage,      setRawPage]      = useState(1);
  const [rawTotal,     setRawTotal]     = useState(0);
  const [topPickItems, setTopPickItems] = useState([]);

  const PAGE_SIZE       = 25;
  const PICKS_THRESHOLD = 8.0;

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerFetch = async () => {
    setFetching(true);
    try {
      const res  = await fetch("/api/fetch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger fetch");
      showToast("Researcher triggered — results in ~2 min");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setFetching(false);
    }
  };

  const loadData = useCallback(async () => {
    const [genRes, runsRes, rawCountRes, picksRes] = await Promise.all([
      supabase.from("generated_content").select("*, raw_content(title, source, source_url)").order("created_at", { ascending: false }).limit(50),
      supabase.from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(30),
      supabase.from("raw_content").select("id", { count: "exact", head: true }),
      supabase.from("raw_content")
        .select("*")
        .eq("processed", false)
        .gte("relevance_score", 6)
        .order("relevance_score", { ascending: false })
        .limit(100),
    ]);

    const firstError = genRes.error || runsRes.error || rawCountRes.error;
    if (firstError) {
      showToast(`Supabase query failed: ${firstError.message}`, "error");
    }

    const gen      = genRes.data  ?? [];
    const runData  = runsRes.data ?? [];
    const totalRaw = rawCountRes.count ?? 0;

    const picks = (picksRes.data ?? [])
      .map(i => ({ ...i, impact_score: (i.relevance_score ?? 0) * 0.6 + (i.novelty_score ?? 0) * 0.4 }))
      .filter(i => i.impact_score >= PICKS_THRESHOLD)
      .sort((a, b) => b.impact_score - a.impact_score);

    setTopPickItems(picks);
    setGenItems(gen);
    setRuns(runData);
    setRawTotal(totalRaw);

    const lastResearcher = runData.find(r => r.agent === "researcher");
    const lastCreator    = runData.find(r => r.agent === "creator");
    setStats({
      totalRaw,
      totalGen:  gen.length,
      drafts:    gen.filter(g => g.status === "draft").length,
      approved:  gen.filter(g => g.status === "approved").length,
      published: gen.filter(g => g.status === "published").length,
      lastResearcher, lastCreator,
    });

    setLoading(false);
  }, []);

  const loadSources = useCallback(async () => {
    const { data } = await supabase.from("sources").select("*").order("created_at", { ascending: true });
    setSources(data ?? []);
  }, []);

  const loadRawFeed = useCallback(async (page, search) => {
    const from = (page - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    let query = supabase
      .from("raw_content")
      .select("*", { count: "exact" })
      .order("fetched_at", { ascending: false })
      .range(from, to);
    if (search?.trim()) {
      query = query.ilike("title", `%${search.trim()}%`);
    }
    const { data, error, count } = await query;
    if (error) { showToast(error.message, "error"); return; }
    setRawItems(data ?? []);
    setRawTotal(count ?? 0);
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

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("create_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setGenHistory(data ?? []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setPreviewOverlay(window.innerWidth < 1100);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Raw feed pagination + server-side search
  useEffect(() => {
    const t = setTimeout(() => loadRawFeed(rawPage, rawSearch), rawSearch ? 300 : 0);
    return () => clearTimeout(t);
  }, [rawPage, rawSearch, loadRawFeed]);

  useEffect(() => {
    const ch = supabase.channel("history-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "create_history" }, loadHistory)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadHistory]);

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

  const saveToHistory = async (input, output) => {
    await supabase.from("create_history").insert({
      input_snippet: input.slice(0, 200),
      output,
    });
  };

  const deleteHistoryEntry = async (id) => {
    await supabase.from("create_history").delete().eq("id", id);
  };

  const deleteRawItem = async (id) => {
    const { error } = await supabase.from("raw_content").delete().eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Item deleted");
    loadRawFeed(rawPage, rawSearch);
    loadData();
  };

  const deleteProcessedRawItems = async () => {
    if (!confirm("Delete all processed raw items? This cannot be undone.")) return;
    const { error } = await supabase.from("raw_content").delete().eq("processed", true);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Processed items deleted");
    setRawPage(1);
    loadRawFeed(1, rawSearch);
    loadData();
  };

  const generateManual = async () => {
    if (!manualInput.trim()) return;
    setGenerating(true);
    setManualOutput("");
    try {
      const res  = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: manualInput, type: contentType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setManualOutput(data.text);
      saveToHistory(manualInput.trim(), data.text);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const saveManualDraft = async () => {
    if (!manualOutput) return;
    setSaving(true);
    const title = manualOutput.split("\n")[0].replace(/^[✅📌💡•\-\s]+/, "").slice(0, 120);
    const { error } = await supabase.from("generated_content").insert({
      raw_content_id: null,
      platform:       "facebook_post",
      title,
      body:           manualOutput,
      hook:           manualOutput.slice(0, 280),
      tags:           [],
      status:         "draft",
    });
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    try {
      const tgRes = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: manualOutput,
          sourceUrl: "",
        }),
      });
      if (!tgRes.ok) {
        const tgData = await tgRes.json().catch(() => ({}));
        showToast(`Saved, but Telegram failed: ${tgData.error || tgRes.statusText}`, "error");
      }
    } catch (err) {
      showToast(`Saved, but Telegram failed: ${err.message}`, "error");
    }
    showToast("Saved to Content Queue as draft");
    setManualOutput("");
    setManualInput("");
    loadData();
  };

  const generateFromRawItem = async (item) => {
    setGeneratingId(item.id);
    const idea = [
      `TITLE: ${item.title}`,
      item.body?.slice(0, 2000),
      item.key_insights?.length
        ? `KEY INSIGHTS:\n${item.key_insights.map(i => `- ${i}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");
    const type = item.source === "bidclub" ? "thesis" : "news";
    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: idea, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const title = data.text.split("\n")[0].replace(/^[✅📌💡•\-\s]+/, "").slice(0, 120);
      const { error: insertErr } = await supabase.from("generated_content").insert({
        raw_content_id: item.id,
        platform:       "facebook_post",
        title,
        body:           data.text,
        hook:           data.text.slice(0, 280),
        tags:           item.tags ?? [],
        impact_score:   item.impact_score ?? null,
        status:         "draft",
      });
      if (insertErr) throw insertErr;
      await supabase.from("raw_content").update({ processed: true }).eq("id", item.id);
      try {
        const tgRes = await fetch("/api/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body: data.text,
            sourceUrl: item.source_url ?? "",
          }),
        });
        if (!tgRes.ok) {
          const tgData = await tgRes.json().catch(() => ({}));
          showToast(`Saved, but Telegram failed: ${tgData.error || tgRes.statusText}`, "error");
        }
      } catch (err) {
        showToast(`Saved, but Telegram failed: ${err.message}`, "error");
      }
      showToast("Post saved to Content Queue");
      loadData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setGeneratingId(null);
    }
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

  const API_SOURCES = [
    {
      id:          "bidclub",
      label:       "BidClub",
      description: "Investment pitches & discussions",
      endpoint:    "bidclub.ai/api/v1/posts?sort=new",
      category:    "Investment",
      color:       "#f59e0b",
      docsUrl:     "https://bidclub.ai/readme#for-agents",
    },
  ];

  const NAV_ITEMS = [
    { id: "queue",   label: "Content Queue", icon: <LayersIcon />,   count: stats?.drafts },
    { id: "picks",   label: "Top Picks",      icon: <StarIcon />,     count: topPickItems.length },
    { id: "raw",     label: "Raw Feed",       icon: <RssIcon />,      count: rawTotal },
    { id: "runs",    label: "Pipeline Runs",  icon: <ActivityIcon />, count: null },
    { id: "sources", label: "Sources",        icon: <DatabaseIcon />, count: sources.length },
    { id: "create",  label: "Create",         icon: <ComposeIcon />,  count: null },
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
      fontFamily: "'Inter', sans-serif", color: C.text, overflowX: "hidden" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        * { box-sizing: border-box; margin: 0; }
        html, body { max-width: 100%; overflow-x: hidden; }
        .nav-btn:hover { background: rgba(255,255,255,0.06) !important; color: ${C.text} !important; }
        .nav-btn:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 8px; }
        .glass-row { transition: background 0.15s, border-color 0.15s; }
        .glass-row:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; }
        .glass-row:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 12px; }
        button:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 4px; }
        input:focus, select:focus { outline: none !important; border-color: rgba(232,255,71,0.45) !important; box-shadow: 0 0 0 3px rgba(232,255,71,0.08) !important; }
        a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; border-radius: 2px; }
        .del-btn:hover { color: ${C.error} !important; background: rgba(255,68,85,0.1) !important; }

        /* ── Layout ── */
        .main-content { margin-left: 240px; padding: 40px 48px; min-height: 100vh; max-width: calc(100vw - 240px); flex: 1; }
        .mobile-header { display: none; }
        .bottom-tab-nav { display: none; }

        /* ── Mobile ── */
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; padding: 72px 16px 80px !important; width: 100% !important; max-width: 100vw !important; overflow-x: hidden !important; }
          .mobile-header {
            display: flex !important;
            position: fixed; top: 0; left: 0; right: 0; z-index: 110;
            height: 56px; padding: 0 16px;
            background: rgba(7,7,14,0.97); border-bottom: 1px solid ${C.border};
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            align-items: center; justify-content: space-between;
          }
          .bottom-tab-nav {
            display: flex !important;
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 110;
            height: 64px;
            background: rgba(7,7,14,0.97); border-top: 1px solid ${C.border};
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; margin-bottom: 20px !important; }
          .stats-grid > *:last-child:nth-child(odd) { grid-column: 1 / -1; }
          .charts-row { display: none !important; }
          .section-header { margin-bottom: 12px !important; margin-top: 4px !important; }
          .source-form-grid { grid-template-columns: 1fr !important; }
          .item-row { flex-wrap: wrap !important; }
          .item-row-scores { display: none !important; }
          .item-row-right { width: 100%; justify-content: space-between !important;
            border-top: 1px solid ${C.border}; padding-top: 10px; margin-top: 4px; }
          .queue-row { flex-wrap: wrap !important; padding: 12px 14px !important; gap: 10px !important; width: 100% !important; max-width: 100% !important; overflow: hidden !important; box-sizing: border-box !important; }
          .queue-row-actions { width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; flex-shrink: 0; border-top: 1px solid ${C.border}; padding-top: 10px; display: flex !important; gap: 8px !important; overflow: hidden !important; }
          .queue-row-actions button { flex: 1 1 0% !important; min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; }
          .queue-grid { width: 100% !important; overflow: hidden !important; }
        }
      `}</style>

      {/* ── Mobile Header ── */}
      <header className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            width: 28, height: 28, borderRadius: 7,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 10px ${C.accent2}44`,
          }}>
            <span style={{ color: C.bg, fontSize: 13, fontWeight: 900, fontFamily: "'Syne', sans-serif" }}>A</span>
          </div>
          <div>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 700, fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>Agent</div>
            <div style={{ color: C.muted, fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em" }}>content pipeline</div>
          </div>
        </div>
        <button
          onClick={triggerFetch}
          disabled={fetching}
          style={{
            background: fetching ? C.glass2 : C.accent + "18",
            color: fetching ? C.muted : C.accent,
            border: `1px solid ${fetching ? C.border : C.accent + "44"}`,
            padding: "6px 14px", borderRadius: 8,
            cursor: fetching ? "not-allowed" : "pointer",
            fontSize: 11, fontWeight: 700,
            fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
          }}>
          {fetching ? "⏳" : "▶ Fetch"}
        </button>
      </header>

      {/* ── Sidebar ── */}
      <nav aria-label="Main navigation" className="desktop-sidebar" style={{
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
          <button
            onClick={triggerFetch}
            disabled={fetching}
            style={{
              marginTop: 12, width: "100%",
              background: fetching ? C.glass2 : C.accent + "18",
              color:      fetching ? C.muted : C.accent,
              border:     `1px solid ${fetching ? C.border : C.accent + "44"}`,
              padding: "8px 0", borderRadius: 8,
              cursor: fetching ? "not-allowed" : "pointer",
              fontSize: 11, fontWeight: 700,
              fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em",
              transition: "all 0.15s",
            }}>
            {fetching
              ? <span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳ Triggering…</span>
              : "▶ Fetch Now"}
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="main-content">

        {/* Stats row */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16, marginBottom: 32 }}>
          <StatCard label="Raw Items"  value={stats?.totalRaw}  accent={C.accent2} sub="fetched total"     compact={isMobile} />
          <StatCard label="Generated"  value={stats?.totalGen}  accent={C.accent}  sub="content pieces"  compact={isMobile} />
          <StatCard label="In Draft"   value={stats?.drafts}    accent={C.muted}   sub="awaiting review" compact={isMobile} />
          <StatCard label="Approved"   value={stats?.approved}  accent={C.accent}  sub="ready to publish" compact={isMobile} />
          <StatCard label="Published"  value={stats?.published} accent={C.success} sub="live content"     compact={isMobile} />
        </div>

        {/* Charts row */}
        <div className="charts-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
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
        <div className="section-header" style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800,
            color: C.text, marginBottom: 4 }}>
            {tab === "queue"   ? "Content Queue"
             : tab === "picks"  ? "Top Picks"
             : tab === "raw"   ? "Raw Feed"
             : tab === "runs"  ? "Pipeline Runs"
             : tab === "sources" ? "Sources"
             : "Create"}
          </h1>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {tab === "queue"   ? "Review and approve AI-generated content"
             : tab === "picks"  ? `High-scoring content ready for generation — impact ≥ ${PICKS_THRESHOLD}`
             : tab === "raw"   ? "All fetched content items, scored by relevance"
             : tab === "runs"  ? "Agent execution history and status"
             : tab === "sources" ? "Manage content sources — RSS feeds, Reddit, X accounts"
             : "Paste any content and generate a Thai Facebook post"}
          </p>
        </div>

        {/* ── Content Queue ── */}
        {tab === "queue" && (
          <div className="queue-grid" style={{ display: "grid", gridTemplateColumns: selected && !previewOverlay ? "1fr 460px" : "1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {genItems.length === 0 && (
                <EmptyState icon="✦" title="No content yet"
                  message="Trigger the creator agent from GitHub Actions to generate your first content pieces." />
              )}
              {genItems.map(item => (
                <div key={item.id} className="glass-row queue-row"
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
                    background: item.platform === "twitter_thread" ? C.accent2 + "20"
                      : item.platform === "facebook_post" ? "#1877f222" : C.accent3 + "20",
                    border: `1px solid ${item.platform === "twitter_thread" ? C.accent2 + "40"
                      : item.platform === "facebook_post" ? "#1877f244" : C.accent3 + "40"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>
                    {item.platform === "twitter_thread" ? "𝕏"
                     : item.platform === "facebook_post" ? "f"
                     : "📝"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: C.text }}>
                      {item.title || item.hook?.slice(0, 80)}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {badge(item.platform === "twitter_thread" ? "Thread"
                        : item.platform === "facebook_post" ? "Facebook"
                        : "Blog", C.accent2)}
                      {badge(item.status, STATUS_COLOR[item.status])}
                      <span style={{ color: C.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                        {item.raw_content?.source && SOURCE_ICON[item.raw_content.source]}
                        {" "}{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="queue-row-actions" style={{ display: "flex", gap: 8 }}>
                    {item.status === "draft" && <>
                      <button
                        aria-label="Approve content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "approved"); }}
                        style={{ background: C.accent + "18", color: C.accent,
                          border: `1px solid ${C.accent}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, flex: 1 }}>
                        Approve
                      </button>
                      <button
                        aria-label="Reject content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "rejected"); }}
                        style={{ background: C.error + "18", color: C.error,
                          border: `1px solid ${C.error}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, flex: 1 }}>
                        Reject
                      </button>
                    </>}
                    {item.status === "approved" && (
                      <button
                        aria-label="Publish content"
                        onClick={e => { e.stopPropagation(); updateStatus(item.id, "published"); }}
                        style={{ background: C.success + "18", color: C.success,
                          border: `1px solid ${C.success}33`, padding: "6px 14px",
                          borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, flex: 1 }}>
                        Publish
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview panel */}
            {selected && (
              <div style={previewOverlay ? {
                position: "fixed", inset: 0, zIndex: 150,
                background: "#0d0d1a", overflowY: "auto",
                padding: "24px 24px 100px", animation: "fadeIn 0.2s ease",
              } : {
                ...glass, padding: "28px", position: "sticky", top: 32,
                maxHeight: "calc(100vh - 64px)", overflowY: "auto",
                animation: "fadeIn 0.2s ease",
              }}>
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

                {selected.raw_content?.source_url && (
                  <a
                    href={selected.raw_content.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      color: C.accent,
                      fontSize: 12,
                      marginBottom: 16,
                      textDecoration: "none",
                    }}
                  >
                    Open source article →
                  </a>
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

        {/* ── Top Picks ── */}
        {tab === "picks" && (
          <div>
            {topPickItems.length === 0 && (
              <EmptyState icon="⭐" title="No top picks yet"
                message={`Items scoring ${PICKS_THRESHOLD}+ impact will appear here after the researcher runs.`} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topPickItems.map(item => (
                <div key={item.id} className="glass-row item-row" style={{
                  ...glass, borderRadius: 12, padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                  borderColor: item.impact_score >= 9 ? C.accent + "33" : C.border,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{SOURCE_ICON[item.source] ?? "🌐"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: C.text, textDecoration: "none" }}
                        onClick={e => e.stopPropagation()}>{item.title}</a>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {item.source && badge(getSourceLabel(item), SOURCE_COLOR[item.source] ?? C.muted)}
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
                  <div className="item-row-right" style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                    <div className="item-row-scores" style={{ textAlign: "center", minWidth: 36 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Syne', sans-serif",
                        color: C.accent }}>
                        {item.impact_score.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>IMPACT</div>
                    </div>
                    {badge(item.source === "bidclub" ? "Thesis" : "News",
                      item.source === "bidclub" ? "#f59e0b" : C.accent2)}
                    <button
                      onClick={e => { e.stopPropagation(); generateFromRawItem(item); }}
                      disabled={generatingId === item.id}
                      aria-label={`Generate post from: ${item.title}`}
                      style={{
                        background: generatingId === item.id ? C.glass2 : C.accent + "18",
                        color:      generatingId === item.id ? C.muted : C.accent,
                        border:     `1px solid ${generatingId === item.id ? C.border : C.accent + "44"}`,
                        padding: "5px 14px", borderRadius: 8,
                        cursor: generatingId === item.id ? "not-allowed" : "pointer",
                        fontSize: 11, fontWeight: 700,
                        fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                        whiteSpace: "nowrap", transition: "all 0.15s",
                      }}>
                      {generatingId === item.id
                        ? <span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳</span>
                        : "✦ Generate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Raw Feed ── */}
        {tab === "raw" && (
          <div>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <span style={{ position: "absolute", left: 14, top: "50%",
                  transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }}>
                  <SearchIcon />
                </span>
                <input
                  value={rawSearch}
                  onChange={e => { setRawSearch(e.target.value); setRawPage(1); }}
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
              <span style={{ color: C.muted, fontSize: 12, fontFamily: "'DM Mono', monospace",
                whiteSpace: "nowrap", flexShrink: 0 }}>
                {rawTotal} item{rawTotal !== 1 ? "s" : ""}
              </span>
              <button
                onClick={deleteProcessedRawItems}
                style={{
                  background: "none", color: C.error + "88",
                  border: `1px solid ${C.error}33`, padding: "7px 14px",
                  borderRadius: 8, cursor: "pointer", fontSize: 11,
                  fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                  whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.15s",
                }}>
                Delete processed
              </button>
            </div>

            {rawItems.length === 0 && (
              rawSearch
                ? <EmptyState icon="🔍" title="No results" message={`Nothing matched "${rawSearch}"`} />
                : <EmptyState icon="📡" title="No items yet" message="Trigger the researcher agent to start fetching content." />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rawItems.map(item => (
                <div key={item.id} className="glass-row item-row" style={{
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
                      {item.source && badge(getSourceLabel(item), SOURCE_COLOR[item.source] ?? C.muted)}
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
                  <div className="item-row-right" style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <div className="item-row-scores" style={{ textAlign: "center", minWidth: 32 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Syne', sans-serif",
                        color: (item.relevance_score ?? 0) >= 7 ? C.accent : C.muted }}>
                        {(item.relevance_score ?? 0).toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>REL</div>
                    </div>
                    <div className="item-row-scores" style={{ textAlign: "center", minWidth: 32 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Syne', sans-serif",
                        color: (item.novelty_score ?? 0) >= 7 ? C.accent3 : C.muted }}>
                        {(item.novelty_score ?? 0).toFixed(1)}
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>NOV</div>
                    </div>
                    {item.processed
                      ? badge("Done", C.success)
                      : (
                        <button
                          onClick={e => { e.stopPropagation(); generateFromRawItem(item); }}
                          disabled={generatingId === item.id}
                          aria-label={`Generate post from: ${item.title}`}
                          style={{
                            background: generatingId === item.id ? C.glass2 : C.accent + "18",
                            color:      generatingId === item.id ? C.muted : C.accent,
                            border:     `1px solid ${generatingId === item.id ? C.border : C.accent + "44"}`,
                            padding: "5px 14px", borderRadius: 8,
                            cursor: generatingId === item.id ? "not-allowed" : "pointer",
                            fontSize: 11, fontWeight: 700,
                            fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                            whiteSpace: "nowrap", transition: "all 0.15s",
                          }}>
                          {generatingId === item.id
                            ? <span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳</span>
                            : "✦ Generate"}
                        </button>
                      )
                    }
                    <button
                      className="del-btn"
                      aria-label={`Delete item: ${item.title}`}
                      onClick={e => { e.stopPropagation(); deleteRawItem(item.id); }}
                      style={{
                        background: "none", color: C.muted, border: "none",
                        cursor: "pointer", width: 28, height: 28, borderRadius: 6,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, transition: "all 0.15s", flexShrink: 0,
                      }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {rawTotal > PAGE_SIZE && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                paddingTop: 20, marginTop: 8 }}>
                <span style={{ color: C.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                  {(rawPage - 1) * PAGE_SIZE + 1}–{Math.min(rawPage * PAGE_SIZE, rawTotal)} of {rawTotal}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setRawPage(p => p - 1)}
                    disabled={rawPage === 1}
                    style={{
                      background: rawPage === 1 ? "none" : C.glass2,
                      color: rawPage === 1 ? C.muted + "44" : C.muted,
                      border: `1px solid ${rawPage === 1 ? C.border + "44" : C.border}`,
                      padding: "6px 16px", borderRadius: 8,
                      cursor: rawPage === 1 ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: "'DM Mono', monospace",
                      transition: "all 0.15s",
                    }}>← Prev</button>
                  <button
                    onClick={() => setRawPage(p => p + 1)}
                    disabled={rawPage * PAGE_SIZE >= rawTotal}
                    style={{
                      background: rawPage * PAGE_SIZE >= rawTotal ? "none" : C.glass2,
                      color: rawPage * PAGE_SIZE >= rawTotal ? C.muted + "44" : C.muted,
                      border: `1px solid ${rawPage * PAGE_SIZE >= rawTotal ? C.border + "44" : C.border}`,
                      padding: "6px 16px", borderRadius: 8,
                      cursor: rawPage * PAGE_SIZE >= rawTotal ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: "'DM Mono', monospace",
                      transition: "all 0.15s",
                    }}>Next →</button>
                </div>
              </div>
            )}
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
                <div className="source-form-grid" style={{ display: "grid",
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

            {/* ── API Integrations ── */}
            <div style={{ marginTop: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.1em" }}>API INTEGRATIONS</div>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.06em" }}>hardcoded · always active</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {API_SOURCES.map(src => (
                  <div key={src.id} style={{
                    ...glass, borderRadius: 12, padding: "14px 20px",
                    display: "flex", alignItems: "center", gap: 14,
                    borderColor: src.color + "22",
                  }}>
                    {badge(src.label, src.color)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text,
                        marginBottom: 3 }}>
                        {src.description}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted,
                        fontFamily: "'DM Mono', monospace" }}>
                        {src.endpoint}
                      </div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 12,
                      fontFamily: "'DM Mono', monospace", minWidth: 80 }}>
                      {src.category}
                    </div>
                    <a
                      href={src.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${src.label} documentation`}
                      style={{
                        background: C.glass2, color: C.muted,
                        border: `1px solid ${C.border}`,
                        padding: "5px 14px", borderRadius: 8,
                        fontSize: 11, fontFamily: "'DM Mono', monospace",
                        letterSpacing: "0.06em", textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}>
                      Docs ↗
                    </a>
                    <div style={{ display: "flex", alignItems: "center", gap: 6,
                      flexShrink: 0 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: C.success, boxShadow: `0 0 6px ${C.success}`,
                      }} />
                      <span style={{ fontSize: 11, color: C.success,
                        fontFamily: "'DM Mono', monospace", fontWeight: 700,
                        letterSpacing: "0.06em" }}>ALWAYS ON</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Create (Manual) ── */}
        {tab === "create" && (
          <div style={{ maxWidth: 800 }}>

            {/* Content type toggle + History button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "news",   label: "📰 News" },
                  { id: "thesis", label: "📊 Investment Thesis" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setContentType(opt.id)}
                    style={{
                      background: contentType === opt.id ? C.accent + "18" : C.glass2,
                      color:      contentType === opt.id ? C.accent : C.muted,
                      border:     `1px solid ${contentType === opt.id ? C.accent + "44" : C.border}`,
                      padding: "7px 18px", borderRadius: 8, cursor: "pointer",
                      fontSize: 12, fontFamily: "'DM Mono', monospace",
                      letterSpacing: "0.06em", transition: "all 0.15s",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowHistory(true)}
                disabled={genHistory.length === 0}
                style={{
                  background: C.glass2, color: genHistory.length > 0 ? C.muted : C.muted + "44",
                  border: `1px solid ${C.border}`, padding: "7px 16px", borderRadius: 8,
                  cursor: genHistory.length > 0 ? "pointer" : "default",
                  fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                ⏱ History {genHistory.length > 0 && `(${genHistory.length})`}
              </button>
            </div>

            {/* Input */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="manual-input" style={{ display: "block", fontSize: 11,
                color: C.muted, fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.1em", marginBottom: 8 }}>
                SOURCE CONTENT
              </label>
              <textarea
                id="manual-input"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder={contentType === "thesis"
                  ? "Paste an investment thesis, research report, or on-chain analysis here. Include valuation data, catalysts, and risks for best results."
                  : "Paste an article, tweet thread, news item, or any content here. Grok will turn it into a Thai Facebook post."}
                rows={10}
                style={{
                  width: "100%", background: C.glass,
                  border: `1px solid ${C.border}`, borderRadius: 12,
                  color: C.text, padding: "16px", fontSize: 13,
                  fontFamily: "'Inter', sans-serif", lineHeight: 1.7,
                  resize: "vertical", transition: "border-color 0.15s",
                }}
              />
            </div>

            <button
              onClick={generateManual}
              disabled={generating || !manualInput.trim()}
              style={{
                background: generating || !manualInput.trim()
                  ? C.glass2 : C.accent,
                color: generating || !manualInput.trim() ? C.muted : C.bg,
                border: "none", padding: "11px 28px", borderRadius: 8,
                cursor: generating || !manualInput.trim() ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.08em", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 8,
              }}>
              {generating
                ? <><span style={{ animation: "pulse 1s infinite", display: "inline-block" }}>⏳</span> Generating…</>
                : "✦ Generate Facebook Post"}
            </button>

            {/* Output */}
            {manualOutput && (
              <div style={{ marginTop: 24, animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.muted,
                    fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em" }}>
                    GENERATED POST
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => { navigator.clipboard.writeText(manualOutput); showToast("Copied to clipboard"); }}
                      style={{
                        background: C.glass2, color: C.muted,
                        border: `1px solid ${C.border}`, padding: "6px 14px",
                        borderRadius: 8, cursor: "pointer", fontSize: 12,
                        fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                      }}>
                      Copy
                    </button>
                    <button
                      onClick={saveManualDraft}
                      disabled={saving}
                      style={{
                        background: saving ? C.glass2 : C.accent + "18",
                        color: saving ? C.muted : C.accent,
                        border: `1px solid ${saving ? C.border : C.accent + "44"}`,
                        padding: "6px 14px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
                        fontSize: 12, fontFamily: "'DM Mono', monospace",
                        letterSpacing: "0.06em", fontWeight: 700,
                      }}>
                      {saving ? "Saving…" : "Save as Draft"}
                    </button>
                  </div>
                </div>
                <div style={{
                  ...glass, borderRadius: 12, padding: "24px",
                  fontSize: 15, lineHeight: 1.9, color: C.text,
                  whiteSpace: "pre-wrap", fontFamily: "'Inter', sans-serif",
                }}>
                  {manualOutput}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── History Drawer ── */}
      {showHistory && (
        <div role="dialog" aria-modal="true" aria-label="Generation history"
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
          {/* Backdrop */}
          <div onClick={() => setShowHistory(false)} style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          }} />
          {/* Drawer panel */}
          <div style={{
            position: "relative", width: isMobile ? "100vw" : 500, maxWidth: "100vw",
            background: "#0d0d1a", borderLeft: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column",
            animation: "slideIn 0.22s ease",
          }}>
            {/* Header */}
            <div style={{ padding: "24px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800,
                  fontSize: 16, color: C.text }}>Generation History</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                  {genHistory.length} generation{genHistory.length !== 1 ? "s" : ""} · synced to Supabase
                </div>
              </div>
              <button aria-label="Close history" onClick={() => setShowHistory(false)} style={{
                background: C.glass2, border: `1px solid ${C.border}`, color: C.muted,
                cursor: "pointer", width: 32, height: 32, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>✕</button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px",
              display: "flex", flexDirection: "column", gap: 10 }}>
              {genHistory.length === 0
                ? <EmptyState icon="⏱" title="No history yet"
                    message="Generated posts will appear here automatically." />
                : genHistory.map(entry => (
                  <div key={entry.id} style={{ ...glass, borderRadius: 12, padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: C.muted,
                        fontFamily: "'DM Mono', monospace" }}>
                        {format(new Date(entry.created_at), "MMM d, HH:mm")}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => { setManualOutput(entry.output); setShowHistory(false); }}
                          style={{
                            background: C.accent + "18", color: C.accent,
                            border: `1px solid ${C.accent}44`, padding: "4px 12px",
                            borderRadius: 6, cursor: "pointer", fontSize: 11,
                            fontFamily: "'DM Mono', monospace", fontWeight: 700,
                          }}>Restore</button>
                        <button
                          aria-label="Delete entry"
                          className="del-btn"
                          onClick={() => deleteHistoryEntry(entry.id)}
                          style={{
                            background: "none", color: C.muted, border: "none",
                            cursor: "pointer", width: 28, height: 28, borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, transition: "all 0.15s",
                          }}>✕</button>
                      </div>
                    </div>
                    {entry.input_snippet && (
                      <div style={{
                        fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace",
                        background: "rgba(255,255,255,0.03)", borderRadius: 6,
                        padding: "6px 10px", marginBottom: 8, lineHeight: 1.5,
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>{entry.input_snippet}{entry.input_snippet.length >= 200 ? "…" : ""}</div>
                    )}
                    <div style={{
                      fontSize: 13, color: C.text + "bb", lineHeight: 1.6,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                    }}>{entry.output}</div>
                  </div>
                ))
              }
            </div>

            {/* Footer */}
            {genHistory.length > 0 && (
              <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}` }}>
                <button
                  onClick={async () => {
                    if (confirm("Clear all generation history?")) {
                      await supabase.from("create_history").delete().not("id", "is", null);
                    }
                  }}
                  style={{
                    background: "none", color: C.error + "88",
                    border: `1px solid ${C.error}33`, padding: "7px 16px",
                    borderRadius: 8, cursor: "pointer", fontSize: 11,
                    fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em",
                  }}>Clear all history</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom Tab Nav (mobile only) ── */}
      <nav className="bottom-tab-nav" aria-label="Tab navigation">
        {NAV_ITEMS.map(item => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={isActive ? "page" : undefined}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3,
                background: "none", border: "none",
                color: isActive ? C.accent : C.muted,
                cursor: "pointer", padding: "8px 4px",
                transition: "color 0.15s",
                position: "relative",
              }}>
              {isActive && (
                <span style={{
                  position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                  width: 24, height: 2, borderRadius: 2,
                  background: C.accent,
                }} />
              )}
              <span style={{ width: 18, height: 18 }}>{item.icon}</span>
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                fontFamily: "'DM Mono', monospace", textTransform: "uppercase",
                lineHeight: 1,
              }}>
                {item.label.split(" ")[0]}
              </span>
              {item.count > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: "calc(50% - 14px)",
                  background: C.accent, color: C.bg,
                  fontSize: 8, fontWeight: 800, borderRadius: 10,
                  padding: "1px 5px", lineHeight: 1.4, minWidth: 14, textAlign: "center",
                }}>{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>

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
