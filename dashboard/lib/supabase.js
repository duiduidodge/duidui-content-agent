import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createNoopSupabaseClient() {
  const emptyResult = {
    data: [],
    error: { message: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." },
  };

  const createQueryBuilder = () => {
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => Promise.resolve(emptyResult),
      update: () => builder,
      insert: () => Promise.resolve(emptyResult),
      delete: () => builder,
      eq: () => Promise.resolve(emptyResult),
      then: (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject),
    };
    return builder;
  };

  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };

  return {
    from: () => createQueryBuilder(),
    channel: () => channel,
    removeChannel: () => {},
  };
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createNoopSupabaseClient();
