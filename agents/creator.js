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
//  PROMPTS — Step 1: Editor-in-Chief (blueprint)
// ─────────────────────────────────────────────────────────────
function buildNewsEditorPrompt(idea) {
  return `Act as the Editor-in-Chief for a premium Thai crypto news platform. I will provide you with a source article.

Your job is NOT to write the final article. Your job is to analyze the news and create a custom structural blueprint for my writer. The goal is to make every piece of content feel organic, uniquely structured, and perfectly suited to the specific narrative of the news.

Step 1: Determine the "Vibe & Core Narrative" of the news (e.g., Urgent FUD, Technical Deep-Dive, Bullish Institutional Adoption, Memecoin Degeneracy, Regulatory Shift).

Step 2: Choose the best "Storytelling Framework." DO NOT use the same generic structure every time. Choose the most appropriate flow from these options (or invent a better one):
   - The "Timeline" Flow: Best for hacks, collapses, or unfolding drama (Hook -> How it started -> The climax -> The fallout).
   - The "Impact" Flow: Best for institutional news or major upgrades (Hook -> The core event -> The ripple effect on retail/builders -> Unanswered questions).
   - The "Debunking" Flow: Best for FUD or complex technical misunderstandings (The rumor -> The actual truth -> The technical explanation -> Why the market overreacted).

Step 3: Create the custom outline. Give the writer specific instructions on how to structure the article based on your chosen framework. Provide exact (but varied) subheadings that fit the story perfectly. NEVER use generic subheadings like "ทำไมเรื่องนี้สำคัญ" or "ต้องระวังอะไร".

Step 4: Define the Hook Strategy. Tell the writer exactly how to open the article (e.g., "Start with the staggering dollar amount lost," "Open with a rhetorical question about DeFi regulation," or "Begin with a stark contrast between Web2 and Web3").

Step 5: Define the CTA. Provide a highly specific, thought-provoking question tied directly to the core dilemma of the news to end the article.

Strict Constraints for the Blueprint:
- NO EMOJIS. Instruct the writer strictly not to use emojis in the final output.
- The outline must guide the writer to use cohesive, flowing paragraphs and professional journalistic formatting (bullet points are allowed only if strictly necessary for data/lists, but not as the main body).

Output only the strategy and blueprint in JSON format using these exact keys: "vibe", "framework", "hook_strategy", "custom_outline", "cta_question".

<source>
${idea}
</source>`;
}

// ─────────────────────────────────────────────────────────────
//  PROMPTS — Step 2: Writer (final post)
// ─────────────────────────────────────────────────────────────
function buildNewsWriterPrompt(idea, blueprint) {
  return `# Role & Persona
Act as a top-tier crypto journalist and expert creator writing a high-quality news article for a Thai crypto community. Your tone is engaging, insightful, and professional yet accessible. Do not sound like a robotic summarizer; write like a seasoned reporter telling a compelling story.

# Task
Write a comprehensive, mobile-friendly crypto news article based strictly on the provided <resource>. Follow the structure and tone instructions in the provided <blueprint> exactly. Minimum 700 Thai characters.

# Strict Constraints & Negative Prompts (CRITICAL)
- NO listicle vibes: The main body must be written in cohesive, flowing paragraphs (news article style), not just bullet points.
- NO meta-commentary: NEVER use phrases like "ตามรายงาน", "ข่าวนี้ระบุว่า", or "บทความนี้กล่าวว่า". Act as the primary source reporting the news directly.
- NO repetitive hooks: Do not repeat the title or the first sentence.
- NO generic CTAs: NEVER end with a basic "คุณคิดว่ายังไง?".
- NO stiff translations: Use natural, conversational Thai phrasing.
- NO em-dashes (—), NO puffery, NO filler.
- Simplify complex jargon seamlessly so a general user understands, but retain the depth of the story.

<blueprint>
${blueprint}
</blueprint>

<resource>
${idea}
</resource>`;
}

// ─────────────────────────────────────────────────────────────
//  SCORING  — pick the best candidates (BidClub excluded — manual only)
// ─────────────────────────────────────────────────────────────
async function getHighImpactContent() {
  const { data, error } = await supabase
    .from("raw_content")
    .select("*")
    .eq("processed", false)
    .neq("source", "bidclub")
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
//  FACEBOOK POST GENERATOR — two-step: Editor → Writer
// ─────────────────────────────────────────────────────────────
async function generateFacebookPost(item) {
  const idea = [
    `TITLE: ${item.title}`,
    item.body?.slice(0, 2000),
    item.key_insights?.length
      ? `KEY INSIGHTS:\n${item.key_insights.map(i => `- ${i}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  // Step 1 — Editor: produce structural blueprint
  console.log(`  → Analyzing… (editor call)`);
  const editorRes = await client.chat.completions.create({
    model:      "deepseek/deepseek-v3.2",
    max_tokens: 1200,
    messages:   [{ role: "user", content: buildNewsEditorPrompt(idea) }],
  });
  const blueprint = editorRes.choices[0].message.content.trim();
  if (!blueprint) throw new Error("Editor returned empty blueprint");

  // Step 2 — Writer: produce final Thai Facebook post
  console.log(`  → Writing… (writer call)`);
  const writerRes = await client.chat.completions.create({
    model:      "google/gemini-2.5-flash-lite",
    max_tokens: 2000,
    messages:   [{ role: "user", content: buildNewsWriterPrompt(idea, blueprint) }],
  });
  const body = writerRes.choices[0].message.content.trim();

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
