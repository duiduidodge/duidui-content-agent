// dashboard/app/api/fetch/route.js
// Triggers the researcher GitHub Actions workflow on demand

import { NextResponse } from "next/server";

export async function POST() {
  const pat  = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO ?? "duiduidodge/duidui-content-agent";

  if (!pat) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/researcher.yml/dispatches`,
    {
      method:  "POST",
      headers: {
        "Authorization":        `Bearer ${pat}`,
        "Accept":               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type":         "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  // GitHub returns 204 No Content on success
  if (res.status === 204) {
    return NextResponse.json({ ok: true });
  }

  const err = await res.text();
  return NextResponse.json({ error: `GitHub API error: ${err}` }, { status: res.status });
}
