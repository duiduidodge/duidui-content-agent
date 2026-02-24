// dashboard/app/api/generate/route.js
// Server-side API route — OpenRouter key never exposed to browser
// Two-step pipeline: Editor-in-Chief (blueprint) → Writer (final post)

import { NextResponse } from "next/server";

const MODEL_EDITOR = "deepseek/deepseek-v3.2";
const MODEL_WRITER = "google/gemini-2.5-flash-lite";
const OPENROUTER   = "https://openrouter.ai/api/v1/chat/completions";

// ─────────────────────────────────────────────────────────────
//  STEP 1 PROMPTS — Editor-in-Chief (blueprint)
// ─────────────────────────────────────────────────────────────

const NEWS_EDITOR_PROMPT = (idea) =>
`Act as the Editor-in-Chief for a premium Thai crypto news platform. I will provide you with a source article.

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

const THESIS_EDITOR_PROMPT = (idea) =>
`Act as the Editor-in-Chief for a premium Thai crypto investment media platform. I will provide you with an investment thesis or BidClub pitch.

Your job is NOT to write the final post. Your job is to analyze the thesis and create a custom structural blueprint for my writer. The goal is to make every piece of content feel organic, uniquely structured, and perfectly suited to the specific investment narrative.

Step 1: Determine the "Vibe & Core Thesis Archetype" (e.g., Contrarian Undervalued Gem, Macro Tailwind Play, Fundamentals-First Deep Value, Speculative High-Risk/High-Reward, Narrative Momentum Trade, Catalyst-Driven Mispricing). Be specific — name the archetype and explain in one sentence why this thesis fits it.

Step 2: Choose the best "Thesis Storytelling Framework." DO NOT use the same generic structure every time. Choose the most appropriate flow from these options (or invent a better one):
   - The "Mispricing" Flow: Best for undervalued assets the market has overlooked (Hook -> The market's wrong assumption -> The actual data -> The valuation gap -> The catalyst to close it).
   - The "Catalyst" Flow: Best for near-term event-driven setups (Hook -> What's about to change -> Why the market hasn't priced it in -> The risk/reward -> The trade thesis).
   - The "Comparison" Flow: Best for peer-relative value plays (Hook -> The peer comparison data -> Why this asset is structurally different -> The mispricing -> The risk).

Step 3: Create the custom outline. Give the writer specific instructions based on your chosen framework. Provide exact (but varied) subheadings that fit this specific thesis. NEVER use generic subheadings like "ทำไมมันถูกมองข้าม" or "ความเสี่ยงที่ต้องรู้" — replace them with subheadings specific to this asset and thesis.

Step 4: Define the Hook Strategy. Tell the writer exactly how to open the post (e.g., "Open with the most striking valuation discrepancy as a hard number comparison," "Start with the on-chain metric that proves adoption is accelerating," or "Open with a rhetorical question that challenges the reader's assumption about this asset class").

Step 5: Define the CTA. Provide a highly specific, thought-provoking question tied directly to the core investment dilemma of this thesis — the trade-off the reader must weigh.

Strict Constraints for the Blueprint:
- NO EMOJIS. Instruct the writer strictly not to use emojis in the final output.
- The outline must preserve all key numbers, ratios, and named protocols from the source. Instruct the writer to never omit or approximate data.
- The outline must include one section dedicated to the primary downside risk — the specific scenario where the thesis breaks.

Output only the strategy and blueprint in JSON format using these exact keys: "vibe", "framework", "hook_strategy", "custom_outline", "cta_question".

<source>
${idea}
</source>`;

// ─────────────────────────────────────────────────────────────
//  STEP 2 PROMPTS — Writer (final post)
// ─────────────────────────────────────────────────────────────

const NEWS_WRITER_PROMPT = (idea, blueprint) =>
`# Role & Persona
Act as a top-tier crypto journalist and expert creator writing a high-quality news article for a Thai crypto community. Your tone is engaging, insightful, and professional yet accessible. Do not sound like a robotic summarizer; write like a seasoned reporter telling a compelling story.

# Task
Write a comprehensive, mobile-friendly crypto news article based strictly on the provided <resource>. Follow the structure and tone instructions in the provided <blueprint> exactly. Minimum 700 Thai characters.

# Strict Constraints & Negative Prompts (CRITICAL)
- NO asterisks (*): Do not use markdown bold or italic. No **text**, no *text*, no ***text***. Plain text only.
- NO walls of text: Every paragraph must be 2–4 sentences focused on one idea. Break up long explanations into separate paragraphs.
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

const THESIS_WRITER_PROMPT = (idea, blueprint) =>
`# Role & Persona
Act as a top-tier Thai crypto investment writer producing a high-quality investment thesis breakdown for a Thai crypto community on Facebook. Your tone is that of a sharp, honest analyst who respects the reader's intelligence. Do not sound like a salesperson. Write like a trusted insider sharing their genuine read.

# Task
Write a comprehensive, mobile-friendly investment thesis post in natural, fluent Thai based strictly on the provided <resource> and following the structure in the provided <blueprint>. Minimum 900 Thai characters.

# Strict Constraints & Negative Prompts (CRITICAL)
- NO asterisks (*): Do not use markdown bold or italic. No **text**, no *text*, no ***text***. Plain text only.
- NO walls of text: Every paragraph must be 2–4 sentences focused on one idea. Break up long explanations into separate paragraphs.
- NO Jargon without explanation: Every technical term (FDV, DEX, AMM, TVL, etc.) must be explained immediately in plain Thai in the same sentence.
- NO Hype language: Never use "moon," "gem," "สุดยอด," "โอกาสทอง," or any pump vocabulary.
- NO meta-commentary: NEVER write "จากการวิเคราะห์นี้" or "ตามที่ระบุในบทความ." Present the thesis as your own well-researched view.
- NO generic CTAs: The closing question must be tied directly to the core investment dilemma of this specific thesis.
- NO em-dashes (—), NO puffery, NO filler.
- NO one-sided presentation: Every post must include at least one honest, specific risk.
- Preserve all specific numbers, ratios, dates, and named protocols from the source exactly.

# Required Structure (follow the blueprint's custom outline, always include these anchors)
1. Hook: Open exactly as instructed in the blueprint. 1-2 punchy sentences.
2. What is it: 2-3 sentences explaining the project or asset in plain Thai, no jargon.
3. The Thesis Core: Use ✅ bullets for the 3-4 strongest arguments. Each bullet must contain at least one specific number or data point.
4. ทำไมมันถูกมองข้าม (Use this exact heading): One paragraph on the valuation gap, market misunderstanding, or narrative lag.
5. Catalysts: Use 📌 bullets for the 2-3 upcoming events specified in the blueprint.
6. ความเสี่ยงที่ต้องรู้ (Use this exact heading): One frank paragraph naming the specific scenario where the thesis breaks.
7. CTA: One specific question tied directly to the core trade-off of this investment.

<blueprint>
${blueprint}
</blueprint>

<resource>
${idea}
</resource>`;

// ─────────────────────────────────────────────────────────────
//  SHARED LLM HELPER
// ─────────────────────────────────────────────────────────────
async function callLLM(apiKey, prompt, maxTokens, model) {
  const res = await fetch(OPENROUTER, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from model");
  return text;
}

// ─────────────────────────────────────────────────────────────
//  ROUTE HANDLER
// ─────────────────────────────────────────────────────────────
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

    const isThesis = type === "thesis";
    const idea     = content.trim();

    // Step 1 — Editor: generate structural blueprint
    const blueprint = await callLLM(
      apiKey,
      isThesis ? THESIS_EDITOR_PROMPT(idea) : NEWS_EDITOR_PROMPT(idea),
      1200,
      MODEL_EDITOR,
    );

    // Step 2 — Writer: generate final Thai Facebook post
    const text = await callLLM(
      apiKey,
      isThesis ? THESIS_WRITER_PROMPT(idea, blueprint) : NEWS_WRITER_PROMPT(idea, blueprint),
      isThesis ? 2500 : 2000,
      MODEL_WRITER,
    );

    return NextResponse.json({ text });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
