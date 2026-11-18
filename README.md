# ratemyeveryday

Rate every day from 1 to 10, leave a note that shows on hover, and watch the year become a heatmap. Add friends to see theirs.

Vite + TypeScript + Tailwind CSS v4. Works without an account (days are saved in the browser); signing in with Google (Supabase) syncs them and unlocks friends.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Layout

```
index.html                 markup (Tailwind classes)
src/
  main.ts                  entry: render loop, grid events, session start-up
  state.ts                 app state + change notifications
  view.ts                  which entries are on screen (mine, a friend’s, or this browser’s when signed out)
  ui/logo.ts               the painted logo (also used as the browser-tab icon)
  config.ts                Supabase URL + publishable key (safe to ship)
  styles.css               design tokens, Tailwind theme, the few custom rules utilities can't express
  lib/                     supabase client, generated DB types, dates, colours, DOM helpers, prefs
  data/                    auth, days, friends (all Supabase calls live here)
  ui/                      header, grid, stats, tooltip, editor, friends panel, onboarding, popovers, background
supabase/migrations/       database schema + row-level security for the `everyday` schema
```

## Database

Everything lives in the `everyday` schema (`profiles`, `days`, `friendships`) with row-level security:
your days are visible only to you and accepted friends, and you can only write your own.

Regenerate types after a schema change:

```sh
curl -s "https://api.supabase.com/v1/projects/<ref>/types/typescript?included_schemas=everyday" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).types))' > src/lib/database.types.ts
```
