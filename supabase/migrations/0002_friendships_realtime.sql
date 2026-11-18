-- Push friendship changes (requests, accepts, removals) to open pages in real time.
-- Realtime applies the table's row-level security, so each person only hears about rows they're part of.
alter publication supabase_realtime add table everyday.friendships;
