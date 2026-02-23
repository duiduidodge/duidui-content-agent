#!/usr/bin/env node
// agents/creator.js — Agent 2: Picks high-impact content → generates Thai Facebook posts
// Triggered by GitHub Actions 1 hour after researcher runs

import OpenAI from "openai";
import { supabase, startRun, finishRun } from "../lib/supabase.js";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const IMPACT_THRESHOLD  = 8.0;
const MAX_ITEMS_PER_RUN = 5;

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendTelegramMessage({ title, body, sourceUrl }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return { skipped: true };

  const lines = [
    "🆕 <b>New Generated Content</b>",
    title ? `\n<b>${escapeHtml(title)}</b>` : "",
    body ? `\n\n${escapeHtml(body)}` : "",
    sourceUrl ? `\n\n🔗 ${escapeHtml(sourceUrl)}` : "",
  ];

  const text = lines.join("").slice(0, 4000);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${msg}`);
  }

  return { skipped: false };
}

// ─────────────────────────────────────────────────────────────
//  PROMPTS
// ─────────────────────────────────────────────────────────────
function buildThesisPrompt(idea) {
  return `<role>
Act as a Thai financial educator who explains investment theses clearly to everyday investors.
</role>

<task>
Create an informative Facebook post in natural, fluent Thai that breaks down the investment thesis from the provided <idea>. Help Thai readers understand what the asset is, why it might be mispriced, and what to watch for.
</task>

<guidelines>
- Tone: Like a knowledgeable friend explaining an investment idea over coffee. Honest and grounded, not a salesperson.
- Value-Driven: Preserve the key numbers and arguments. Do not water down the data.
- Audience: Thai investors and crypto enthusiasts who understand basic financial concepts but are not professional analysts.
- Balance: Present the opportunity AND the main risk. Never one-sided.
</guidelines>

<strict_constraints>
- NO Jargon without explanation: Terms like FDV, DEX, AMM must be explained immediately in simple Thai.
- NO Em-dashes: Do not use the "—" or "-" symbol as a sentence separator.
- NO Hype: No "moon," "gem," "สุดยอด." Present facts and let the reader decide.
- NO AI Filler: Output ONLY the Facebook post text.
- Depth Requirement: Write at least 900 Thai characters with concrete details.
</strict_constraints>

<format_requirements>
Structure the post in this exact order:
1. Hook: Name the asset and one striking fact (the most compelling number or gap)
2. What is it: 2-3 sentences explaining what the project does in plain Thai
3. The Thesis: Use ✅ bullets for the 3-4 strongest arguments with their supporting numbers
4. Valuation: One short paragraph comparing current valuation to peers in plain numbers
5. Catalysts: Use 📌 bullets for 2-3 upcoming events that could move the price
6. Risk: One honest sentence naming the main downside risk
7. CTA: A friendly question asking readers their view on this asset
8. Length: At least 7 short paragraphs total, and each ✅/📌 bullet must include a specific fact or number.
</format_requirements>

<idea>
${idea}
</idea>`;
}

function buildPrompt(idea) {
  return `# Role & Persona
Act as a top-tier crypto journalist and a knowledgeable friend writing for a Thai crypto community. Your tone is engaging, insightful, natural, and highly variable depending on the vibe of the news (e.g., urgent for price crashes, analytical for adoption news, entertaining for memecoins).

# Task
Write a highly engaging, mobile-friendly crypto news summary based strictly on the provided <resource>. Minimum 700 Thai characters.

# Strict Constraints & Negative Prompts (CRITICAL)
- NO meta-commentary: NEVER use phrases like "ตามรายงาน", "จากแหล่งข้อมูล", "ข่าวนี้ระบุว่า", or "หัวข้อข่าวที่ให้มา". Report the news directly and confidently as your own content.
- NO repeating the hook: Write the opening hook ONCE. Do not copy-paste the title into the first line.
- NO generic CTAs: NEVER end with a basic "คุณคิดว่ายังไง?".
- NO stiff translations: Use natural Thai phrasing.
- NO em-dashes (—), NO puffery, NO filler.
- Simplify complex jargon seamlessly so a general user understands.

# Required Structure (Be creative with the delivery)
1. The Hook: 1-2 punchy sentences. Vary your opening style—sometimes start with a shocking stat, sometimes a bold statement, sometimes a rhetorical question.
2. The Breakdown: Use short mobile paragraphs and at least 5 bullet points (with varied, context-specific emojis, not just ✅ or -). Use these bullets to dynamically explain timelines, key players, or core mechanics.
3. ทำไมเรื่องนี้สำคัญ: (Use this exact heading). Explain the macro impact. Don't just summarize; analyze *why* a retail investor, builder, or the broader market should care.
4. ต้องระวังอะไร: (Use this exact heading). Highlight hidden risks, potential FUD, extreme volatility, or what investors should double-check before making a move.
5. Ending CTA: Ask one highly specific, thought-provoking question tied directly to the core dilemma of the news to spark debate in the comments.

<resource>
${idea}
</resource>`;
}

// ─────────────────────────────────────────────────────────────
//  SCORING  — pick the best candidates
// ─────────────────────────────────────────────────────────────
async function getHighImpactContent() {
  const { data, error } = await supabase
    .from("raw_content")
    .select("*")
    .eq("processed", false)
    .gte("relevance_score", IMPACT_THRESHOLD - 2)
    .order("fetched_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const scored = (data ?? [])
    .map(item => ({
      ...item,
      impact_score: (item.relevance_score ?? 0) * 0.6 + (item.novelty_score ?? 0) * 0.4,
    }))
    .filter(item => item.impact_score > IMPACT_THRESHOLD)
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, MAX_ITEMS_PER_RUN);

  console.log(`🎯 High-impact candidates: ${scored.length}`);
  return scored;
}

// ─────────────────────────────────────────────────────────────
//  FACEBOOK POST GENERATOR
// ─────────────────────────────────────────────────────────────
async function generateFacebookPost(item) {
  const idea = [
    `TITLE: ${item.title}`,
    item.body?.slice(0, 2000),
    item.key_insights?.length
      ? `KEY INSIGHTS:\n${item.key_insights.map(i => `- ${i}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const isThesis = item.source === "bidclub";
  const response = await client.chat.completions.create({
    model:      "openai/gpt-5-mini",
    max_tokens: isThesis ? 3000 : 2400,
    messages:   [{ role: "user", content: isThesis ? buildThesisPrompt(idea) : buildPrompt(idea) }],
  });

  const body = response.choices[0].message.content.trim();

  return {
    title: body.split("\n")[0].replace(/^[✅📌💡•\-\s]+/, "").slice(0, 120),
    hook:  body.slice(0, 280),
    body,
  };
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  console.log("🚀 Agent 2: Content Creator starting…");

  const runId = await startRun("creator");
  let totalCreated = 0;

  try {
    const candidates = await getHighImpactContent();

    if (candidates.length === 0) {
      console.log("ℹ️  No high-impact content found. Exiting.");
      await finishRun(runId, { status: "success", startedAt });
      return;
    }

    for (const item of candidates) {
      console.log(`\n📝 Processing: "${item.title?.slice(0, 60)}…" (score: ${item.impact_score.toFixed(1)})`);

      try {
        const postType = item.source === "bidclub" ? "thesis" : "news";
        console.log(`  → Generating ${postType} post…`);
        const post = await generateFacebookPost(item);

        const { error: insertError } = await supabase
          .from("generated_content")
          .insert({
            raw_content_id: item.id,
            platform:       "facebook_post",
            title:          post.title,
            body:           post.body,
            hook:           post.hook,
            tags:           item.tags ?? [],
            impact_score:   item.impact_score,
            status:         "draft",
          });

        if (insertError) throw insertError;

        await supabase
          .from("raw_content")
          .update({ processed: true })
          .eq("id", item.id);

        try {
          await sendTelegramMessage({
            title: post.title,
            body: post.body,
            sourceUrl: item.source_url,
          });
        } catch (telegramErr) {
          console.warn(`  ⚠️  Telegram notification failed: ${telegramErr.message}`);
        }

        totalCreated++;
        console.log("  ✅ Facebook post created");

      } catch (err) {
        console.warn(`  ⚠️  Failed for item ${item.id}: ${err.message}`);
        await supabase
          .from("raw_content")
          .update({ processing_error: err.message })
          .eq("id", item.id);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ Creator agent done. Generated ${totalCreated} Facebook posts.`);
    await finishRun(runId, { status: "success", itemsCreated: totalCreated, startedAt });

  } catch (err) {
    console.error("❌ Creator agent failed:", err);
    await finishRun(runId, { status: "failed", errorMessage: err.message, startedAt });
    process.exit(1);
  }
}

main();
