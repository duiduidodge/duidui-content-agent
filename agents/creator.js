#!/usr/bin/env node
// agents/creator.js — Agent 2: Picks high-impact content → generates Twitter threads & blog articles
// Triggered by GitHub Actions 1 hour after researcher runs

import OpenAI from "openai";
import { supabase, startRun, finishRun } from "../lib/supabase.js";

const claude = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const IMPACT_THRESHOLD  = 6.5;  // combined score to qualify for generation
const MAX_ITEMS_PER_RUN = 5;    // max pieces of content to generate per run

// Author voice/style — customize this to match your brand
const AUTHOR_VOICE = `
You are writing in the voice of a tech-savvy content creator who:
- Speaks directly and confidently, never hedging
- Uses plain language; avoids buzzwords unless they land with irony
- Builds arguments from first principles with concrete examples
- Is not afraid of strong opinions but backs them with logic
- Has a dry wit; never tries too hard to be funny
- Writes for an audience of curious builders, marketers, and founders
`;

// ─────────────────────────────────────────────────────────────
//  SCORING  — pick the best candidates
// ─────────────────────────────────────────────────────────────

async function getHighImpactContent() {
  // Fetch unprocessed items with decent scores
  const { data, error } = await supabase
    .from("raw_content")
    .select("*")
    .eq("processed", false)
    .gte("relevance_score", IMPACT_THRESHOLD - 2) // cast a slightly wider net
    .order("fetched_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  // Compute combined impact score and sort
  const scored = (data ?? [])
    .map(item => ({
      ...item,
      impact_score: (
        (item.relevance_score ?? 0) * 0.6 +
        (item.novelty_score   ?? 0) * 0.4
      ),
    }))
    .filter(item => item.impact_score >= IMPACT_THRESHOLD)
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, MAX_ITEMS_PER_RUN);

  console.log(`🎯 High-impact candidates: ${scored.length}`);
  return scored;
}

// ─────────────────────────────────────────────────────────────
//  TWITTER THREAD GENERATOR
// ─────────────────────────────────────────────────────────────

async function generateThread(item) {
  const prompt = `${AUTHOR_VOICE}

Write a Twitter/X thread based on this source content. The thread should be original — don't just summarize, add YOUR perspective, analysis, and insight.

SOURCE TITLE: ${item.title}
SOURCE BODY: ${item.body?.slice(0, 1500)}
KEY INSIGHTS: ${(item.key_insights ?? []).join("; ")}
TAGS: ${(item.tags ?? []).join(", ")}

Thread requirements:
- 5-8 tweets
- Tweet 1 is the hook — bold, curious, or provocative. No "🧵" cliché openers
- Each tweet is standalone but builds on the last
- End with a question or call to action
- Max 280 chars per tweet
- Include 1-2 relevant hashtags total (not one per tweet)

Return as JSON:
{
  "title": "short internal title",
  "hook": "the first tweet text",
  "body": "all tweets separated by \\n---\\n",
  "tags": ["tag1", "tag2"]
}

Return ONLY valid JSON.`;

  const response = await claude.chat.completions.create({
    model:      "x-ai/grok-4.1-fast",
    max_tokens: 1500,
    messages:   [{ role: "user", content: prompt }],
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

// ─────────────────────────────────────────────────────────────
//  BLOG ARTICLE GENERATOR
// ─────────────────────────────────────────────────────────────

async function generateBlogArticle(item) {
  const prompt = `${AUTHOR_VOICE}

Write an original blog article inspired by this source. Don't just rewrite it — use it as a jumping-off point to deliver real value and a distinct point of view.

SOURCE TITLE: ${item.title}
SOURCE BODY: ${item.body?.slice(0, 1500)}
KEY INSIGHTS: ${(item.key_insights ?? []).join("; ")}
CATEGORY: ${item.category}

Article requirements:
- 600-900 words
- Compelling headline (not clickbait)
- Lead with a strong opening paragraph that hooks readers
- Use short paragraphs (2-4 sentences max)
- Include 2-3 subheadings
- Concrete examples or analogies
- Strong closing paragraph with a clear takeaway
- Written in Markdown

Return as JSON:
{
  "title": "the article headline",
  "hook": "the opening paragraph only",
  "body": "full article in Markdown",
  "tags": ["tag1", "tag2", "tag3"]
}

Return ONLY valid JSON.`;

  const response = await claude.chat.completions.create({
    model:      "x-ai/grok-4.1-fast",
    max_tokens: 3000,
    messages:   [{ role: "user", content: prompt }],
  });

  return JSON.parse(response.choices[0].message.content.trim());
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

      const generatedItems = [];

      // Generate both formats for the highest-scoring items; threads-only for the rest
      const generateBlog = item.impact_score >= 8.0;

      try {
        // Always generate a Twitter thread
        console.log("  → Generating Twitter thread…");
        const thread = await generateThread(item);
        generatedItems.push({
          raw_content_id: item.id,
          platform:       "twitter_thread",
          title:          thread.title,
          body:           thread.body,
          hook:           thread.hook,
          tags:           thread.tags ?? [],
          impact_score:   item.impact_score,
          status:         "draft",
        });

        if (generateBlog) {
          console.log("  → Generating blog article (high score)…");
          const article = await generateBlogArticle(item);
          generatedItems.push({
            raw_content_id: item.id,
            platform:       "blog_article",
            title:          article.title,
            body:           article.body,
            hook:           article.hook,
            tags:           article.tags ?? [],
            impact_score:   item.impact_score,
            status:         "draft",
          });
        }

        // Insert generated content
        const { error: insertError } = await supabase
          .from("generated_content")
          .insert(generatedItems);

        if (insertError) throw insertError;

        // Mark raw_content as processed
        await supabase
          .from("raw_content")
          .update({ processed: true })
          .eq("id", item.id);

        totalCreated += generatedItems.length;
        console.log(`  ✅ Created ${generatedItems.length} piece(s) of content`);

      } catch (err) {
        console.warn(`  ⚠️  Failed for item ${item.id}: ${err.message}`);
        await supabase
          .from("raw_content")
          .update({ processing_error: err.message })
          .eq("id", item.id);
      }

      // Delay between items to respect rate limits
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ Creator agent done. Generated ${totalCreated} content pieces.`);
    await finishRun(runId, {
      status:       "success",
      itemsCreated: totalCreated,
      startedAt,
    });

  } catch (err) {
    console.error("❌ Creator agent failed:", err);
    await finishRun(runId, {
      status:       "failed",
      errorMessage: err.message,
      startedAt,
    });
    process.exit(1);
  }
}

main();
