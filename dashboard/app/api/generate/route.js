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
</format_requirements>

<idea>
${idea}
</idea>`;

const PROMPT_TEMPLATE = (idea) => `<role>
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
</strict_constraints>

<format_requirements>
- Hook: Start with a clear, relatable, attention-grabbing opening sentence.
- Readability: Use short paragraphs (2-3 sentences max) tailored for mobile viewing. Absolutely no walls of text.
- Organization: Use simple emojis (like ✅, 📌, or 💡) as bullet points to break down key facts or steps.
- Call to Action: End with a single, friendly question to encourage comments and engagement.
</format_requirements>

<idea>
${idea}
</idea>`;

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
        max_tokens: type === "thesis" ? 2500 : 2000,
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
