import { NextResponse } from "next/server";

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function POST(request) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return NextResponse.json(
        { error: "Telegram is not configured. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID." },
        { status: 500 }
      );
    }

    const { title = "", body = "", sourceUrl = "" } = await request.json();

    const lines = [
      "🆕 <b>New Generated Content</b>",
      title ? `\n<b>${escapeHtml(title)}</b>` : "",
      body ? `\n\n${escapeHtml(body)}` : "",
      sourceUrl ? `\n\n🔗 ${escapeHtml(sourceUrl)}` : "",
    ];
    const text = lines.join("").slice(0, 4000);

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
      return NextResponse.json({ error: `Telegram error: ${msg}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
