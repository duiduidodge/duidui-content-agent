#!/usr/bin/env node
// agents/researcher.js — Agent 1: Fetches, categorizes & enriches content
// Triggered by GitHub Actions cron every 6 hours

import OpenAI from "openai";
import { supabase, startRun, finishRun } from "../lib/supabase.js";
import Parser from "rss-parser";
import fetch from "node-fetch";

const claude = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
const rssParser = new Parser();

const HN_STORIES_COUNT = 20; // top N HN stories per run

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
//  DYNAMIC SOURCE LOADING
// ─────────────────────────────────────────────────────────────

async function loadSources() {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("enabled", true);
  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  console.log(`📋 Loaded ${data.length} active sources from database`);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  FETCHERS
// ─────────────────────────────────────────────────────────────

async function fetchRSS(rssSources) {
  const items = [];
  for (const src of rssSources) {
    try {
      const parsed = await rssParser.parseURL(src.value);
      for (const item of parsed.items.slice(0, 10)) {
        items.push({
          source:     "rss",
          source_url: item.link,
          title:      item.title,
          body:       item.contentSnippet || item.summary || "",
          author:     item.creator || parsed.title,
          category:   src.category,
        });
      }
      console.log(`✅ RSS: ${src.value} — ${Math.min(parsed.items.length, 10)} items`);
    } catch (e) {
      console.warn(`⚠️  RSS failed for ${src.value}: ${e.message}`);
    }
  }
  return items;
}

async function fetchReddit(redditSources) {
  const items = [];
  for (const src of redditSources) {
    try {
      const res  = await fetch(`https://www.reddit.com/r/${src.value}/hot.json?limit=10`, {
        headers: { "User-Agent": "ContentAgent/1.0" },
      });
      const json = await res.json();
      for (const post of json.data?.children ?? []) {
        const d = post.data;
        if (d.stickied || d.is_video) continue;
        items.push({
          source:     "reddit",
          source_url: `https://reddit.com${d.permalink}`,
          title:      d.title,
          body:       d.selftext?.slice(0, 1000) || d.url,
          author:     d.author,
          category:   src.category,
        });
      }
      console.log(`✅ Reddit: r/${src.value}`);
    } catch (e) {
      console.warn(`⚠️  Reddit failed for r/${src.value}: ${e.message}`);
    }
  }
  return items;
}

async function fetchHackerNews() {
  const items = [];
  try {
    const topIds = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
      .then(r => r.json());
    const ids = topIds.slice(0, HN_STORIES_COUNT);
    await Promise.all(ids.map(async (id) => {
      try {
        const story = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          .then(r => r.json());
        if (!story || story.type !== "story") return;
        items.push({
          source:     "hackernews",
          source_url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          title:      story.title,
          body:       story.text?.replace(/<[^>]+>/g, "") || "",
          author:     story.by,
          category:   "Tech",
        });
      } catch {}
    }));
    console.log(`✅ HackerNews: ${items.length} stories`);
  } catch (e) {
    console.warn(`⚠️  HackerNews failed: ${e.message}`);
  }
  return items;
}

async function fetchXAccount(handle, category) {
  // handle is stored without @, e.g. "VitalikButerin"
  const prompt = `You have access to X (Twitter). Retrieve the most recent posts from @${handle} from the last 6 hours that contain useful, substantive information relevant to crypto, blockchain, Web3, DeFi, or tech. Exclude retweets, replies, and trivial posts.

Return a JSON array of objects. Each object must have exactly these fields:
{
  "title": "first 100 chars of the post text",
  "body": "full post text",
  "url": "https://x.com/${handle}/status/<tweet_id>"
}

Return between 0 and 6 items. If there are no relevant posts in the last 6 hours, return [].
Return ONLY valid JSON. No markdown, no explanation.`;

  try {
    const response = await claude.chat.completions.create({
      model:      "x-ai/grok-4.1-fast",
      max_tokens: 1500,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw   = response.choices[0].message.content.trim();
    const posts = JSON.parse(raw);
    if (!Array.isArray(posts)) return [];

    return posts.map(p => ({
      source:     "twitter",
      source_url: p.url || `https://x.com/${handle}`,
      title:      p.title || p.body?.slice(0, 100) || "",
      body:       p.body || "",
      author:     handle,
      category,
    }));
  } catch (e) {
    console.warn(`⚠️  X account fetch failed for @${handle}: ${e.message}`);
    return [];
  }
}

async function fetchAllXAccounts(xSources) {
  const items = [];
  for (let i = 0; i < xSources.length; i++) {
    const src     = xSources[i];
    const results = await fetchXAccount(src.value, src.category);
    items.push(...results);
    console.log(`✅ X/@${src.value}: ${results.length} posts`);
    if (i < xSources.length - 1) await sleep(500);
  }
  return items;
}

// ─────────────────────────────────────────────────────────────
//  CLAUDE ENRICHMENT
// ─────────────────────────────────────────────────────────────

async function enrichWithClaude(items) {
  // Batch to avoid rate limits — 5 items per call
  const enriched = [];
  const batchSize = 5;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const prompt = `You are a content strategist. Analyze these ${batch.length} pieces of content and return a JSON array with enriched metadata for each.

For each item return:
{
  "category": "string (e.g. Bitcoin, Ethereum, DeFi, NFT, Web3, Blockchain, Regulation, Trading)",
  "tags": ["3-5 relevant tags"],
  "relevance_score": number (0-10, how relevant for a crypto/web3 audience),
  "novelty_score": number (0-10, how fresh/novel is this topic),
  "sentiment": "positive|neutral|negative",
  "key_insights": ["2-3 bullet points summarizing key insights"]
}

Content to analyze:
${batch.map((item, idx) => `[${idx}] TITLE: ${item.title}\nBODY: ${item.body?.slice(0, 500)}`).join("\n\n")}

Return ONLY a valid JSON array. No markdown, no explanation.`;

    try {
      const response = await claude.chat.completions.create({
        model:      "x-ai/grok-4.1-fast",
        max_tokens: 2000,
        messages:   [{ role: "user", content: prompt }],
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());
      batch.forEach((item, idx) => {
        enriched.push({ ...item, ...parsed[idx] });
      });
      console.log(`🧠 Enriched batch ${Math.floor(i / batchSize) + 1}`);
    } catch (e) {
      console.warn(`⚠️  Enrichment failed for batch: ${e.message}`);
      batch.forEach(item => enriched.push(item)); // push unenriched
    }

    if (i + batchSize < items.length) await sleep(1000);
  }
  return enriched;
}

// ─────────────────────────────────────────────────────────────
//  DEDUPLICATION  — skip URLs already in DB
// ─────────────────────────────────────────────────────────────

async function deduplicateItems(items) {
  const urls = items.map(i => i.source_url).filter(Boolean);
  const { data: existing } = await supabase
    .from("raw_content")
    .select("source_url")
    .in("source_url", urls);

  const existingUrls = new Set((existing ?? []).map(r => r.source_url));
  return items.filter(i => !existingUrls.has(i.source_url));
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  console.log("🚀 Agent 1: Researcher starting…");

  const runId = await startRun("researcher");
  let totalInserted = 0;

  try {
    // 1. Load sources from database
    const sources = await loadSources();

    // 2. Partition by type
    const rssSources    = sources.filter(s => s.type === "rss");
    const redditSources = sources.filter(s => s.type === "reddit");
    const hnSource      = sources.find(s  => s.type === "hackernews" && s.value === "enabled");
    const xSources      = sources.filter(s => s.type === "x_account");

    // 3. Fetch from all source types (X accounts run sequentially internally)
    const [rssItems, redditItems, hnItems, xItems] = await Promise.all([
      rssSources.length    ? fetchRSS(rssSources)          : Promise.resolve([]),
      redditSources.length ? fetchReddit(redditSources)    : Promise.resolve([]),
      hnSource             ? fetchHackerNews()             : Promise.resolve([]),
      xSources.length      ? fetchAllXAccounts(xSources)   : Promise.resolve([]),
    ]);

    const allItems = [...rssItems, ...redditItems, ...hnItems, ...xItems];
    console.log(`📦 Total fetched: ${allItems.length}`);

    // 4. Deduplicate
    const newItems = await deduplicateItems(allItems);
    console.log(`🔍 New items after dedup: ${newItems.length}`);

    if (newItems.length === 0) {
      console.log("ℹ️  No new content found. Exiting.");
      await finishRun(runId, { status: "success", itemsFetched: 0, startedAt });
      return;
    }

    // 5. Enrich with Grok
    const enrichedItems = await enrichWithClaude(newItems);

    // 6. Insert into Supabase
    const { data, error } = await supabase
      .from("raw_content")
      .insert(
        enrichedItems.map(item => ({
          source:          item.source,
          source_url:      item.source_url,
          title:           item.title,
          body:            item.body,
          author:          item.author,
          category:        item.category,
          tags:            item.tags ?? [],
          relevance_score: item.relevance_score ?? 0,
          novelty_score:   item.novelty_score ?? 0,
          sentiment:       item.sentiment ?? "neutral",
          key_insights:    item.key_insights ?? [],
          processed:       false,
        }))
      )
      .select();

    if (error) throw error;
    totalInserted = data?.length ?? 0;
    console.log(`✅ Inserted ${totalInserted} items into Supabase`);

    await finishRun(runId, {
      status: "success",
      itemsFetched: totalInserted,
      startedAt,
    });

  } catch (err) {
    console.error("❌ Researcher agent failed:", err);
    await finishRun(runId, {
      status: "failed",
      errorMessage: err.message,
      startedAt,
    });
    process.exit(1);
  }
}

main();
