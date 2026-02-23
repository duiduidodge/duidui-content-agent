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
const IMPACT_THRESHOLD  = 6.5;
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
  return `<role>
Act as a Knowledgeable Friend and Expert Content Creator who excels at explaining complex concepts simply.
</role>

<task>
Create a highly informative and engaging Facebook post written in natural, fluent Thai based on the provided <idea>.
</task>

<guidelines>
- Tone: Friendly, sincere, and grounded. Speak like a real person having a helpful conversation, not a corporate brochure.
- Value-Driven: Focus on being informative. The reader must walk away feeling like they learned something genuinely useful.
- Audience: General Thai social media users browsing on their phones.
</guidelines>

<strict_constraints>
- NO Jargon: Translate any technical terms into "everyday" Thai. If a technical term must be used, explain it immediately in simple terms.
- NO Em-dashes: Do not use the "—" or "-" symbol as a sentence separator.
- NO Puffery: Avoid exaggerated adjectives (e.g., "the most amazing," "revolutionary," "unbelievable," "สุดยอด"). Show, don't tell—if something is good, explain *why* using facts.
- NO AI Filler: Output ONLY the text of the Facebook post. Do not include introductory remarks, explanations, or conclusions (e.g., do not say "Here is the post:").
- Depth Requirement: Write at least 700 Thai characters with practical context and concrete details.
</strict_constraints>

<format_requirements>
- Hook: Start with a clear, relatable, attention-grabbing opening sentence.
- Readability: Use short paragraphs (2-3 sentences max) tailored for mobile viewing. Absolutely no walls of text.
- Organization: Use simple emojis (like ✅, 📌, or 💡) as bullet points to break down key facts or steps. Include at least 5 bullets in total.
- Substance: Include at least one mini-explanation section ("ทำไมเรื่องนี้สำคัญ") and one risk section ("ต้องระวังอะไร").
- Call to Action: End with a single, friendly question to encourage comments and engagement.
</format_requirements>

<idea>
${idea}
</idea>`;
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
    .filter(item => item.impact_score >= IMPACT_THRESHOLD)
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
