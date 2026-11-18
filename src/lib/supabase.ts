import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";
import type { Database } from "./database.types";

export const sb = createClient<Database, "everyday">(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: "everyday" },
});
