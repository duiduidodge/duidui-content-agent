// dashboard/app/api/generate/route.js
// Server-side API route — OpenRouter key never exposed to browser

import { NextResponse } from "next/server";

const THESIS_PROMPT_TEMPLATE = (idea) => `<role>
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

const PROMPT_TEMPLATE = (idea) => `# Role & Persona
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

export async function POST(request) {
  try {
    const { content, type = "news" } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      "openai/gpt-5-mini",
        max_tokens: type === "thesis" ? 3000 : 2400,
        messages:   [{ role: "user", content: type === "thesis"
          ? THESIS_PROMPT_TEMPLATE(content.trim())
          : PROMPT_TEMPLATE(content.trim()) }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
    }

    return NextResponse.json({ text });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
