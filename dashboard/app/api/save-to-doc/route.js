// dashboard/app/api/save-to-doc/route.js
// Sends generated content to Activepieces → creates Google Doc → returns doc_url
// Then fires a Telegram notification with the title + doc link

import { NextResponse } from "next/server";

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendTelegram(botToken, chatId, title, docUrl) {
  const text = [
    "📄 <b>Saved to Google Doc</b>",
    title ? `\n<b>${escapeHtml(title)}</b>` : "",
    `\n\n🔗 <a href="${escapeHtml(docUrl)}">Open Google Doc</a>`,
  ].join("");

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
    console.warn(`Telegram send failed: ${res.status} ${msg}`);
  }
}

export async function POST(request) {
  try {
    const { title, body, source_url, platform, impact_score } = await request.json();

    if (!title && !body) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: "ACTIVEPIECES_WEBHOOK_URL not configured" }, { status: 500 });
    }

    // Call Activepieces /sync — waits for Google Doc to be created and returns doc_url
    const apRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, source_url, platform, impact_score }),
    });

    if (!apRes.ok) {
      const err = await apRes.text();
      return NextResponse.json({ error: `Activepieces error: ${err}` }, { status: 500 });
    }

    const { doc_url } = await apRes.json();

    if (!doc_url) {
      return NextResponse.json({ error: "No doc_url returned from Activepieces" }, { status: 500 });
    }

    // Send Telegram notification if credentials are configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId   = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      await sendTelegram(botToken, chatId, title, doc_url);
    }

    return NextResponse.json({ doc_url });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
