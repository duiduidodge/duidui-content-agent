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

// ─────────────────────────────────────────────────────────────
//  SOURCE CONFIG  — edit to add/remove feeds
// ─────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://feeds.feedburner.com/TechCrunch",          category: "Tech"    },
  { url: "https://www.wired.com/feed/rss",                   category: "Tech"    },
  { url: "https://feeds.arstechnica.com/arstechnica/index",  category: "Tech"    },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", category: "Tech" },
  { url: "https://www.theverge.com/rss/index.xml",           category: "Tech"    },
];

const REDDIT_SUBREDDITS = [
  "artificial", "MachineLearning", "technology",
  "Entrepreneur", "marketing", "webdev",
];

const HN_STORIES_COUNT = 20; // top N HN stories per run

// ─────────────────────────────────────────────────────────────
//  FETCHERS
// ─────────────────────────────────────────────────────────────

async function fetchRSS() {
  const items = [];
  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      for (const item of parsed.items.slice(0, 10)) {
        items.push({
          source:     "rss",
          source_url: item.link,
          title:      item.title,
          body:       item.contentSnippet || item.summary || "",
          author:     item.creator || parsed.title,
          category:   feed.category,
        });
      }
      console.log(`✅ RSS: ${feed.url} — ${Math.min(parsed.items.length, 10)} items`);
    } catch (e) {
      console.warn(`⚠️  RSS failed for ${feed.url}: ${e.message}`);
    }
  }
  return items;
}

async function fetchReddit() {
  const items = [];
  for (const sub of REDDIT_SUBREDDITS) {
    try {
      const res  = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
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
          category:   sub,
        });
      }
      console.log(`✅ Reddit: r/${sub}`);
    } catch (e) {
      console.warn(`⚠️  Reddit failed for r/${sub}: ${e.message}`);
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

async function fetchTwitter() {
  // Requires TWITTER_BEARER_TOKEN secret in GitHub Actions
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.warn("⚠️  TWITTER_BEARER_TOKEN not set — skipping Twitter fetch");
    return [];
  }

  const SEARCH_QUERIES = [
    "AI tools site:twitter.com -is:retweet lang:en",
    "content marketing strategy -is:retweet lang:en",
    "startup growth -is:retweet lang:en",
  ];

  const items = [];
  for (const q of SEARCH_QUERIES) {
    try {
      const url = new URL("https://api.twitter.com/2/tweets/search/recent");
      url.searchParams.set("query", q);
      url.searchParams.set("max_results", "10");
      url.searchParams.set("tweet.fields", "author_id,text,created_at,public_metrics");
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set("user.fields", "username");

      const res  = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const users = Object.fromEntries(
        (json.includes?.users ?? []).map(u => [u.id, u.username])
      );
      for (const tweet of json.data ?? []) {
        items.push({
          source:     "twitter",
          source_url: `https://twitter.com/i/web/status/${tweet.id}`,
          title:      tweet.text.slice(0, 100),
          body:       tweet.text,
          author:     users[tweet.author_id] || "unknown",
          category:   "Social",
        });
      }
    } catch (e) {
      console.warn(`⚠️  Twitter query failed: ${e.message}`);
    }
  }
  console.log(`✅ Twitter: ${items.length} tweets`);
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
  "category": "string (e.g. AI, Design, Marketing, Business, Dev, Science)",
  "tags": ["3-5 relevant tags"],
  "relevance_score": number (0-10, how relevant for a tech/content creator audience),
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
      console.warn(`⚠️  Claude enrichment failed for batch: ${e.message}`);
      batch.forEach(item => enriched.push(item)); // push unenriched
    }

    // small delay to be kind to rate limits
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const startedAt = new Date();
  console.log("🚀 Agent 1: Researcher starting…");

  const runId = await startRun("researcher");
  let totalInserted = 0;

  try {
    // 1. Fetch from all sources in parallel
    const [rssItems, redditItems, hnItems, twitterItems] = await Promise.all([
      fetchRSS(),
      fetchReddit(),
      fetchHackerNews(),
      fetchTwitter(),
    ]);

    const allItems = [...rssItems, ...redditItems, ...hnItems, ...twitterItems];
    console.log(`📦 Total fetched: ${allItems.length}`);

    // 2. Deduplicate
    const newItems = await deduplicateItems(allItems);
    console.log(`🔍 New items after dedup: ${newItems.length}`);

    if (newItems.length === 0) {
      console.log("ℹ️  No new content found. Exiting.");
      await finishRun(runId, { status: "success", itemsFetched: 0, startedAt });
      return;
    }

    // 3. Enrich with Claude
    const enrichedItems = await enrichWithClaude(newItems);

    // 4. Insert into Supabase
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
