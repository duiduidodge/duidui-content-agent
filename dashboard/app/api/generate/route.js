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

const PROMPT_TEMPLATE = (idea) => `# Role & Tone
Act as an expert crypto content creator and a knowledgeable friend. Your tone should be engaging, insightful, and natural for a Thai crypto-native audience. Write in a conversational Thai style, avoiding robotic wording or direct-translation phrasing.

# Task
Analyze the provided <resource> and create a highly engaging, mobile-friendly crypto news summary based strictly on the content provided.

# Strict Constraints
- Language: Natural Thai.
- Length: Minimum 700 Thai characters.
- Formatting: No em-dash (—), use short paragraphs optimized for mobile reading (2-3 lines max per paragraph).
- Style: Simplify complex crypto technical jargon (e.g., FOCIL, Cypherpunk, Mempool) so a general user can easily understand, while keeping the core meaning accurate.
- Content: NO puffery, NO filler words, NO fluff. Get straight to the facts.
- Restriction: DO NOT invent information. DO NOT add any extra sections or headings that are not explicitly requested below.

# Required Structure
1. Hook: Start with 1-2 punchy, scroll-stopping sentences. DO NOT use cliche openings like "ข่าวร้อนในวงการคริปโต". Hook the reader with the core impact or a thought-provoking angle.
2. Body & Key Takeaways: Summarize the key events using at least 5 bullet points. You MUST use varied and context-relevant emojis for each bullet (do not just repeat the same emoji). Make the bullets punchy and informative.
3. ทำไมเรื่องนี้สำคัญ: (Use this exact heading). Explain the core impact and why the audience should care.
4. ต้องระวังอะไร: (Use this exact heading). Highlight the risks, criticisms, or potential downsides mentioned in the text.
5. Ending CTA: End with a single, engaging question to encourage community discussion.

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
