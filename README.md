# Content Agent System

An AI-powered content pipeline using Claude, GitHub Actions, and Supabase.

```
GitHub Actions (Cron)
      │
      ├── Agent 1: Researcher  (runs every 6h)
      │     RSS → Reddit → HackerNews → Twitter → Claude enrichment → Supabase
      │
      └── Agent 2: Creator  (runs 1h after Researcher)
            High-impact items → Claude → Twitter threads + Blog articles → Supabase

Dashboard (Next.js on Vercel) reads from Supabase in real-time.
```

---

## Quick Start

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open the **SQL Editor** and run `supabase/schema.sql`
3. Copy your **Project URL** and both keys (anon + service_role) from Project Settings → API

### 2. GitHub Repo Setup

```bash
git clone <your-repo>
cd content-agent
npm install
```

Add these **GitHub Actions Secrets** (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | Telegram target chat ID (group/channel/user) |
| `TWITTER_BEARER_TOKEN` | Twitter API v2 bearer token (optional) |

### 3. Dashboard Setup

```bash
cd dashboard
cp ../.env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev        # http://localhost:3000
```

Deploy to Vercel:
```bash
npx vercel --prod
# Set env vars in Vercel dashboard
```

---

## Agent Schedule

| Agent | Schedule | Description |
|-------|----------|-------------|
| Researcher | `0 0,6,12,18 * * *` | Runs every 6 hours |
| Creator | `0 1,7,13,19 * * *` | Runs 1 hour after Researcher |

Trigger manually from **GitHub → Actions** tab.

---

## Customizing Sources

**RSS Feeds** — edit `RSS_FEEDS` array in `agents/researcher.js`:
```js
{ url: "https://yourfeed.com/rss", category: "Design" }
```

**Reddit** — edit `REDDIT_SUBREDDITS`:
```js
const REDDIT_SUBREDDITS = ["artificial", "marketing", "startups"];
```

**Twitter** — edit `SEARCH_QUERIES` for different topics.

---

## Customizing Your Voice

Edit the `AUTHOR_VOICE` string in `agents/creator.js`:
```js
const AUTHOR_VOICE = `
You are writing in the voice of [YOUR NAME], a [YOUR DESCRIPTION]...
`;
```

Be specific — the more detail you give Claude, the more on-brand the output.

---

## Content Workflow

```
Raw Content (Agent 1)
      ↓  scores ≥ 6.5
Generated Content (Agent 2)
      ↓
  [draft] → Approve → [approved] → Publish → [published]
          → Reject  → [rejected]
```

Manage everything from the dashboard's **Content Queue** tab.

---

## File Structure

```
content-agent/
├── agents/
│   ├── researcher.js      # Agent 1
│   └── creator.js         # Agent 2
├── lib/
│   └── supabase.js        # Shared DB client
├── supabase/
│   └── schema.sql         # DB schema — run once
├── .github/workflows/
│   ├── researcher.yml     # Cron for Agent 1
│   └── creator.yml        # Cron for Agent 2
├── dashboard/             # Next.js app
│   ├── app/
│   │   ├── layout.jsx
│   │   ├── page.jsx
│   │   └── dashboard/page.jsx
│   └── lib/supabase.js
├── .env.example
└── package.json
```

---

## Environment Variables Reference

| Variable | Used By | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Agents | Claude API |
| `SUPABASE_URL` | Agents | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Agents | Bypasses RLS — server only |
| `TELEGRAM_BOT_TOKEN` | Agents + Dashboard API | Telegram bot token for generated-content alerts |
| `TELEGRAM_CHAT_ID` | Agents + Dashboard API | Telegram destination chat ID |
| `TWITTER_BEARER_TOKEN` | Agent 1 | Twitter API v2 |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard | Supabase URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard | Anon key (public) |
