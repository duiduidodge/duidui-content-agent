// lib/supabase.js — shared client used by both agents
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL)      throw new Error("Missing SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("Missing SUPABASE_SERVICE_KEY");

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key bypasses RLS — agents only
);

// ─── Pipeline run helpers ────────────────────────────────────

export async function startRun(agent) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({ agent, status: "running" })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishRun(runId, { status, itemsFetched = 0, itemsCreated = 0, errorMessage, startedAt }) {
  const finishedAt = new Date();
  await supabase
    .from("pipeline_runs")
    .update({
      status,
      items_fetched:  itemsFetched,
      items_created:  itemsCreated,
      error_message:  errorMessage ?? null,
      finished_at:    finishedAt.toISOString(),
      duration_ms:    finishedAt - new Date(startedAt),
    })
    .eq("id", runId);
}
