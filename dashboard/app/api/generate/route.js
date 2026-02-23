// dashboard/app/api/generate/route.js
// Server-side API route — OpenRouter key never exposed to browser
// Two-step pipeline: Editor-in-Chief (blueprint) → Writer (final post)

import { NextResponse } from "next/server";

const MODEL      = "x-ai/grok-4.1-fast";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

// ─────────────────────────────────────────────────────────────
//  STEP 1 PROMPTS — Editor-in-Chief (blueprint)
// ─────────────────────────────────────────────────────────────

const NEWS_EDITOR_PROMPT = (idea) =>
`Act as the Editor-in-Chief for a Thai crypto news platform. I will provide you with a source article.
Your job is NOT to write the final article. Your job is to analyze the news and create a custom structural blueprint for my writer.

Step 1: Determine the "Vibe" of the news (e.g., Urgent FUD, Technical Deep-Dive, Bullish Institutional Adoption, Memecoin Degeneracy).
Step 2: Create a custom outline. You MUST include our mandatory sections ("ทำไมเรื่องนี้สำคัญ" and "ต้องระวังอะไร") and a final CTA question.
Step 3: Tell the writer exactly how to start the article (e.g., "Start with a shocking statistic about the liquidation," or "Start with a rhetorical question about DeFi regulation").
Step 4: Decide what the emoji bullet points should focus on (e.g., "Use the bullets to list the 3 main technical upgrades").

Output only the strategy and blueprint.

<source>
${idea}
</source>`;

const THESIS_EDITOR_PROMPT = (idea) =>
`Act as the Editor-in-Chief for a Thai crypto investment media platform. I will provide you with an investment thesis or BidClub pitch.
Your job is NOT to write the final post. Your job is to analyze the thesis and create a custom structural blueprint for my writer.

Step 1: Determine the "Vibe" of the thesis. Choose from archetypes such as: Contrarian Undervalued Gem, Macro Tailwind Play, Fundamentals-First Deep Value, Speculative High-Risk/High-Reward, or Narrative Momentum Trade. Be specific — name the archetype and explain in one sentence why this thesis fits it.

Step 2: Create a custom outline. You MUST include our mandatory sections for all thesis posts: one section covering the core valuation gap or mispricing argument ("ทำไมมันถูกมองข้าม"), one section covering the primary downside scenario ("ความเสี่ยงที่ต้องรู้"), and a final CTA question. Beyond these mandatory sections, design 2-3 additional outline sections that are unique to this specific thesis (e.g., "Tokenomics Catalyst," "Regulatory Tailwind," "On-Chain Evidence," "Protocol Revenue Breakdown").

Step 3: Tell the writer exactly how to open the post. Give one concrete instruction, such as: "Open with the most striking valuation discrepancy as a hard number comparison," or "Open with the single most compelling on-chain data point that proves adoption."

Step 4: Specify what the ✅ bullet points should highlight. Instruct the writer to focus them on the strongest quantitative arguments with specific numbers, the competitive moat evidence, and the catalyst timeline.

Step 5: Specify what the 📌 catalyst bullets should cover. Tell the writer which 2-3 specific upcoming events, dates, or milestones from the thesis to prioritize, and whether the tone should be confident or cautious.

Output only the strategy and blueprint. Do not write any Thai. Do not write the final post.

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
async function callLLM(apiKey, prompt, maxTokens) {
  const res = await fetch(OPENROUTER, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:      MODEL,
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
      800,
    );

    // Step 2 — Writer: generate final Thai Facebook post
    const text = await callLLM(
      apiKey,
      isThesis ? THESIS_WRITER_PROMPT(idea, blueprint) : NEWS_WRITER_PROMPT(idea, blueprint),
      isThesis ? 2500 : 2000,
    );

    return NextResponse.json({ text });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
