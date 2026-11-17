import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { db: { schema: "everyday" } });

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const now = new Date();
const TODAY = keyOf(now);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const isLeap = y => new Date(y, 1, 29).getMonth() === 1;

// 1 = red, 10 = green, through amber; the middle is lifted so yellow doesn't go muddy
const hue = r => 25 + (r - 1) / 9 * 120;
const light = r => (0.64 + 0.12 * Math.sin((r - 1) / 9 * Math.PI)).toFixed(3);
const cssColor = r => `oklch(calc(${light(r)} + var(--lshift)) .16 ${hue(r)})`;
const paint = (el, r) => { el.style.setProperty("--h", hue(r)); el.style.setProperty("--L", light(r)); el.dataset.r = r; };
const avgColor = a => Math.max(1, Math.min(10, Math.round(a)));
const fmtLong = k => parseKey(k).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const fmtShort = k => parseKey(k).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- state ----------
const S = {
  me: null,              // auth user id, null when signed out
  user: null,            // auth user
  profile: null,         // everyday.profiles row for me
  days: {},              // uid -> { "YYYY-MM-DD": {r, n} }
  loadedYears: {},       // `${uid}:${year}` -> true
  profiles: {},          // uid -> profile row
  friends: [], incoming: [], outgoing: [],
  viewing: null,         // null = me (or the example when signed out)
  year: now.getFullYear(),
  layout: Object.assign({ type: "weeks", n: 19 }, store.get("everyday.layout", {})),
  nums: store.get("everyday.numbers", true) !== false,
  demo: null,
};

[2, 5, 9, 7, 10, 4, 8, 6, 9].forEach(r => { const i = document.createElement("i"); i.style.background = cssColor(r); $("brandMark").append(i); });

function notice(msg) { $("notice").hidden = !msg; $("notice").textContent = msg || ""; }
const signedIn = () => !!S.me && !!S.profile;
const entriesOf = uid => {
  if (!S.me) return S.demo || (S.demo = makeDemo());
  return S.days[uid || S.me] || {};
};
const profileOf = uid => S.profiles[uid] || {};
const nameOf = uid => (!uid || uid === S.me) ? "You" : (profileOf(uid).name || "@" + (profileOf(uid).handle || "someone"));
const firstName = uid => nameOf(uid).split(" ")[0];

// A believable example year for the signed-out view, clearly labelled as an example.
function makeDemo() {
  let s = 99; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const e = {}; let mood = 6;
  for (let d = new Date(S.year, 0, 1); keyOf(d) <= TODAY && d.getFullYear() === S.year; d.setDate(d.getDate() + 1)) {
    mood += (6.4 + Math.sin((d.getMonth() - 2) / 12 * 2 * Math.PI) * 1.2 - mood) * 0.3 + (rnd() - 0.5) * 3;
    if (rnd() < 0.1) continue;
    e[keyOf(d)] = { r: Math.max(1, Math.min(10, Math.round(mood))) };
  }
  const notes = { "-02-14": "Dinner with friends", "-05-23": "Beach day", "-08-09": "Got the offer!", "-10-31": "Went as a traffic cone" };
  for (const [md, n] of Object.entries(notes)) { const k = S.year + md; if (e[k]) e[k].n = n; }
  return e;
}

// ---------- grid geometry ----------
function geometry(year, layout) {
  const days = isLeap(year) ? 366 : 365;
  if (layout.type === "months") return { days, cols: 31, rows: 12, colMajor: false, place: (i, d) => ({ c: d.getDate() - 1, r: d.getMonth() }) };
  if (layout.type === "custom") {
    const n = Math.max(3, Math.min(60, layout.n | 0 || 19));
    return { days, cols: Math.ceil(days / n), rows: n, colMajor: true, place: i => ({ c: Math.floor(i / n), r: i % n }) };
  }
  const off = (new Date(year, 0, 1).getDay() + 6) % 7; // Monday first
  return { days, cols: Math.ceil((days + off) / 7), rows: 7, colMajor: true, weeks: true, place: i => ({ c: Math.floor((i + off) / 7), r: (i + off) % 7 }) };
}

// ---------- render ----------
function render() { renderControls(); renderHead(); renderPeople(); renderGrid(); renderStats(); }

function renderControls() {
  document.querySelectorAll("[data-lay]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lay === S.layout.type)));
  $("customWrap").hidden = S.layout.type !== "custom";
  if (document.activeElement !== $("customN")) $("customN").value = S.layout.n;
  $("numToggle").checked = S.nums;
  $("cells").classList.toggle("nums", S.nums);
  $("acct").hidden = !signedIn();
  $("signin").hidden = !!S.me;
  if (signedIn()) {
    $("acctHandle").textContent = "@" + S.profile.handle;
    if (S.profile.avatar_url) { $("acctImg").src = S.profile.avatar_url; $("acctImg").hidden = false; } else $("acctImg").hidden = true;
  }
}

function renderHead() {
  const t = $("title"); t.textContent = "";
  t.append(!S.me ? "Your " : S.viewing ? `${firstName(S.viewing)}’s ` : "Your ");
  const b = document.createElement("b"); b.textContent = S.year; t.append(b);
  $("yearLabel").textContent = S.year;
  $("nextYear").disabled = S.year >= now.getFullYear();
  $("prevYear").disabled = S.year <= 2000;
}

function miniStrip(entries) {
  const m = document.createElement("span"); m.className = "mini"; m.setAttribute("aria-hidden", "true");
  for (let i = 6; i >= 0; i--) {
    const e = entries[keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))];
    const c = document.createElement("i"); if (e) c.style.background = cssColor(e.r); m.append(c);
  }
  return m;
}

function avatar(url) { const img = document.createElement("img"); img.alt = ""; if (url) img.src = url; else img.hidden = true; img.referrerPolicy = "no-referrer"; return img; }

function chip(uid) {
  const b = document.createElement("button"); b.type = "button"; b.className = "chip";
  const isMe = uid === S.me;
  b.setAttribute("aria-pressed", String(isMe ? !S.viewing : S.viewing === uid));
  b.append(avatar(isMe ? S.profile.avatar_url : profileOf(uid).avatar_url));
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = nameOf(uid); b.append(nm);
  b.append(miniStrip(S.days[uid] || {}));
  b.onclick = async () => { S.viewing = isMe ? null : uid; hideTip(); render(); await ensureYear(uid, S.year); };
  return b;
}

function renderPeople() {
  const el = $("people"); el.textContent = "";
  el.hidden = !signedIn();
  if (!signedIn()) return;
  el.append(chip(S.me));
  S.friends.forEach(f => el.append(chip(f)));
  const add = document.createElement("button"); add.type = "button"; add.className = "chip add"; add.id = "addFriend";
  add.append("+ Friends");
  if (S.incoming.length) { const bd = document.createElement("span"); bd.className = "badge"; bd.textContent = S.incoming.length; add.append(bd); }
  add.onclick = openFriends; el.append(add);
  if (S.viewing) {
    const rm = document.createElement("button"); rm.type = "button"; rm.className = "linkbtn";
    rm.textContent = `Remove ${firstName(S.viewing)}`;
    rm.onclick = () => removeFriend(S.viewing);
    el.append(rm);
  }
}

function renderGrid() {
  const g = geometry(S.year, S.layout);
  const entries = entriesOf(S.viewing);
  const board = $("board"), cells = $("cells"), top = $("topLab"), left = $("leftLab");
  board.style.setProperty("--cols", g.cols); board.style.setProperty("--rows", g.rows);
  top.textContent = ""; left.textContent = "";
  if (g.colMajor) {
    let last = -9;
    for (let m = 0; m < 12; m++) {
      const i = Math.round((new Date(S.year, m, 1) - new Date(S.year, 0, 1)) / 864e5);
      const { c } = g.place(i); if (c - last < 3) continue;
      const s = document.createElement("span"); s.textContent = MONTHS[m]; s.style.gridColumn = `${c + 1} / span 3`; top.append(s); last = c;
    }
    if (g.weeks) ["Mon", "", "Wed", "", "Fri", "", ""].forEach(t => { const s = document.createElement("span"); s.textContent = t; left.append(s); });
  } else {
    [1, 5, 10, 15, 20, 25, 30].forEach(d => { const s = document.createElement("span"); s.textContent = d; s.style.gridColumn = `${d} / span 3`; top.append(s); });
    MONTHS.forEach(t => { const s = document.createElement("span"); s.textContent = t; left.append(s); });
  }
  left.hidden = !left.childElementCount;

  const editable = signedIn() && !S.viewing;
  cells.classList.toggle("ro", !editable);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < g.days; i++) {
    const d = new Date(S.year, 0, 1 + i), k = keyOf(d), { c, r } = g.place(i, d);
    const b = document.createElement("button"); b.type = "button"; b.className = "cell"; b.dataset.k = k;
    b.style.gridColumn = c + 1; b.style.gridRow = r + 1;
    const e = entries[k];
    if (k > TODAY) { b.classList.add("future"); b.disabled = true; }
    else if (e) paint(b, e.r);
    if (k === TODAY) b.classList.add("is-today");
    b.setAttribute("aria-label", `${fmtShort(k)}${e ? `, rated ${e.r}` : ""}`);
    frag.append(b);
  }
  cells.textContent = ""; cells.append(frag);
  sizeCells();
}

function sizeCells() {
  const g = geometry(S.year, S.layout);
  const leftW = $("leftLab").hidden ? 0 : ($("leftLab").offsetWidth || 28) + 8;
  const gap = g.cols > 60 ? 2 : 3;
  const avail = $("boardWrap").clientWidth - leftW - 8;
  const size = Math.max(10, Math.min(28, Math.floor((avail - gap * (g.cols - 1)) / g.cols)));
  $("board").style.setProperty("--cell", size + "px");
  $("board").style.setProperty("--gap", gap + "px");
}
new ResizeObserver(() => sizeCells()).observe($("boardWrap"));

function renderStats() {
  const entries = entriesOf(S.viewing);
  const keys = Object.keys(entries).filter(k => k.startsWith(S.year + "-")).sort();
  const vals = keys.map(k => entries[k].r);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const avg = vals.length ? mean(vals) : null;
  const byW = {}, byM = {};
  keys.forEach(k => {
    const d = parseKey(k), mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
    (byW[keyOf(mon)] = byW[keyOf(mon)] || []).push(entries[k].r);
    (byM[d.getMonth()] = byM[d.getMonth()] || []).push(entries[k].r);
  });
  const bestOf = obj => { let bk = null, bv = 0; for (const [k, a] of Object.entries(obj)) if (a.length >= 3) { const v = mean(a); if (v > bv) { bv = v; bk = k; } } return bk == null ? null : { k: bk, v: bv }; };
  const bw = bestOf(byW), bm = bestOf(byM);
  const fmtDay = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const weekLabel = k => { const d = parseKey(k); return `${fmtDay(d)}–${fmtDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))}`; };
  const el = $("stats"); el.textContent = "";
  const stat = (label, val, score, showScore) => {
    const s = document.createElement("span"); s.className = "stat";
    const dot = document.createElement("span"); dot.className = "dot"; if (score) paint(dot, avgColor(score));
    const b = document.createElement("b"); b.textContent = val;
    s.append(dot, label + " ", b); if (score && showScore) s.append(" " + score.toFixed(1));
    el.append(s);
  };
  stat("avg", avg == null ? "–" : avg.toFixed(1), avg, false);
  stat("best week", bw ? weekLabel(bw.k) : "–", bw && bw.v, true);
  stat("best month", bm ? MONTHS[+bm.k] : "–", bm && bm.v, true);
}

// ---------- tooltip ----------
const tip = $("tip");
function showTip(cell) {
  const k = cell.dataset.k; if (!k) return;
  const e = entriesOf(S.viewing)[k];
  tip.textContent = "";
  const d = document.createElement("div"); d.className = "d"; d.textContent = fmtShort(k); tip.append(d);
  if (e) {
    const r = document.createElement("div"); r.className = "r"; r.textContent = `${e.r} / 10`; tip.append(r);
    if (e.n) { const n = document.createElement("div"); n.className = "n"; n.textContent = e.n; tip.append(n); }
  } else {
    const x = document.createElement("div"); x.className = "e";
    x.textContent = k > TODAY ? "Still ahead" : (signedIn() && !S.viewing ? "Not rated · click to rate" : "Not rated");
    tip.append(x);
  }
  const rc = cell.getBoundingClientRect();
  tip.style.left = "0px"; tip.style.top = "0px"; tip.classList.add("on");
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - tw - 8, rc.left + rc.width / 2 - tw / 2));
  let y = rc.top - th - 8; if (y < 8) y = rc.bottom + 8;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip() { tip.classList.remove("on"); }
const cellsEl = $("cells");
cellsEl.addEventListener("pointerover", e => { const c = e.target.closest(".cell"); if (c && e.pointerType !== "touch") showTip(c); });
cellsEl.addEventListener("pointerleave", hideTip);
cellsEl.addEventListener("focusin", e => { const c = e.target.closest(".cell"); if (c) showTip(c); });
cellsEl.addEventListener("focusout", hideTip);
cellsEl.addEventListener("click", e => {
  const c = e.target.closest(".cell"); if (!c || c.disabled) return;
  if (signedIn() && !S.viewing) { hideTip(); openEditor(c.dataset.k, c); } else showTip(c);
});
addEventListener("scroll", hideTip, { passive: true });

// ---------- popovers ----------
function placePop(pop, anchor) {
  pop.hidden = false; $("scrim").hidden = false;
  if (innerWidth <= 560 || !anchor) return;
  const rc = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const x = Math.max(12, Math.min(innerWidth - w - 12, rc.left + rc.width / 2 - w / 2));
  let y = rc.bottom + 10; if (y + h > innerHeight - 12) y = Math.max(12, rc.top - h - 10);
  pop.style.left = x + "px"; pop.style.top = y + "px";
}
function closePops() {
  if (!$("onboard").hidden) return; // handle must be chosen first
  $("editor").hidden = true; $("friendPop").hidden = true; $("scrim").hidden = true;
}
$("scrim").onclick = closePops;
addEventListener("keydown", e => { if (e.key === "Escape") closePops(); });

// editor
let ed = { k: null, r: null };
function openEditor(k, anchor) {
  const e = S.days[S.me]?.[k];
  ed = { k, r: e ? e.r : null };
  $("edTitle").textContent = fmtLong(k);
  $("edSub").textContent = k === TODAY ? "today" : (e ? "rated" : "not rated yet");
  $("edNote").value = e?.n || "";
  $("edClear").hidden = !e;
  renderEdScale();
  placePop($("editor"), anchor);
  setTimeout(() => (ed.r ? $("edNote") : $("edScale").querySelector("button")).focus(), 0);
}
function renderEdScale() {
  const sc = $("edScale"); sc.textContent = "";
  for (let r = 1; r <= 10; r++) {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.textContent = r; paint(b, r);
    b.setAttribute("aria-pressed", String(ed.r === r)); b.setAttribute("aria-label", `${r} of 10`);
    b.onclick = () => { ed.r = r; renderEdScale(); };
    sc.append(b);
  }
  $("edSave").disabled = !ed.r;
  $("edCount").textContent = `${$("edNote").value.length}/140`;
}
$("edNote").oninput = () => { $("edCount").textContent = `${$("edNote").value.length}/140`; };
$("edSave").onclick = () => { if (!ed.r) return; saveDay(ed.k, ed.r, $("edNote").value.trim()); closePops(); };
$("edClear").onclick = () => { clearDay(ed.k); closePops(); };
$("editor").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("edSave").click(); return; }
  if (e.target.tagName !== "TEXTAREA" && /^[0-9]$/.test(e.key)) { ed.r = e.key === "0" ? 10 : +e.key; renderEdScale(); }
});

// ---------- controls ----------
document.querySelectorAll("[data-lay]").forEach(b => b.onclick = () => { S.layout.type = b.dataset.lay; store.set("everyday.layout", S.layout); render(); });
$("customN").addEventListener("change", () => {
  S.layout.n = Math.max(3, Math.min(60, parseInt($("customN").value, 10) || 19));
  store.set("everyday.layout", S.layout); render();
});
$("numToggle").onchange = () => { S.nums = $("numToggle").checked; store.set("everyday.numbers", S.nums); renderControls(); };
$("prevYear").onclick = () => changeYear(-1);
$("nextYear").onclick = () => { if (S.year < now.getFullYear()) changeYear(1); };
async function changeYear(dir) {
  S.year += dir; S.demo = null; render();
  if (signedIn()) await ensureYear(S.viewing || S.me, S.year);
}

// ---------- auth ----------
$("google").onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) notice("Google sign-in isn’t available right now: " + error.message);
};
$("signOut").onclick = async () => { await sb.auth.signOut(); };

let bootedFor = null;
sb.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id || null;
  if (uid === bootedFor) return;
  bootedFor = uid;
  // run outside the auth callback so supabase calls inside don't deadlock
  setTimeout(() => uid ? startSession(session.user) : resetSignedOut(), 0);
});

function resetSignedOut() {
  Object.assign(S, { me: null, user: null, profile: null, days: {}, loadedYears: {}, profiles: {}, friends: [], incoming: [], outgoing: [], viewing: null, demo: null });
  $("onboard").hidden = true; $("scrim").hidden = true; $("scrim").classList.remove("dim");
  notice(""); render();
}

async function startSession(user) {
  S.me = user.id; S.user = user;
  notice("Loading your year…");
  render();
  const { data, error } = await sb.from("profiles").select("id,handle,name,avatar_url").eq("id", S.me).maybeSingle();
  if (error) { notice("Couldn’t load your profile. Refresh to try again."); return; }
  if (!data) { openOnboarding(); return; }
  S.profile = data; S.profiles[S.me] = data;
  await afterProfile();
}

async function afterProfile() {
  render();
  await loadFriendships();
  await ensureYear(S.me, S.year);
  if (S.year !== now.getFullYear()) await ensureYear(S.me, now.getFullYear());
  notice(""); render();
}

// onboarding: choose a handle
function suggestHandle(user) {
  const base = (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "friend")
    .toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16) || "friend";
  return (base.length < 3 ? base + "_day" : base) + Math.floor(10 + Math.random() * 89);
}
function openOnboarding() {
  notice("");
  $("obHandle").value = suggestHandle(S.user);
  $("obErr").hidden = true;
  $("onboard").hidden = false; $("scrim").hidden = false; $("scrim").classList.add("dim");
  setTimeout(() => $("obHandle").select(), 0);
}
$("obHandle").addEventListener("input", () => { $("obHandle").value = $("obHandle").value.toLowerCase().replace(/[^a-z0-9_]/g, ""); });
$("obHandle").addEventListener("keydown", e => { if (e.key === "Enter") $("obSave").click(); });
$("obSave").onclick = async () => {
  const handle = $("obHandle").value.trim();
  const err = m => { $("obErr").textContent = m; $("obErr").hidden = false; };
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return err("Use 3 to 20 lowercase letters, numbers or underscores.");
  $("obSave").disabled = true;
  const md = S.user.user_metadata || {};
  const row = { id: S.me, handle, name: (md.full_name || md.name || "").slice(0, 60), avatar_url: (md.avatar_url || md.picture || null) };
  const { data, error } = await sb.from("profiles").insert(row).select().single();
  $("obSave").disabled = false;
  if (error) return err(error.code === "23505" ? `@${handle} is taken. Try another.` : "Couldn’t save your handle. Try again.");
  S.profile = data; S.profiles[S.me] = data;
  $("onboard").hidden = true; $("scrim").hidden = true; $("scrim").classList.remove("dim");
  await afterProfile();
};

// ---------- data: days ----------
async function ensureYear(uid, year) {
  const ids = (uid === S.me ? [S.me] : [uid]).filter(id => !S.loadedYears[`${id}:${year}`]);
  if (ids.length) await fetchDays(ids, year);
}
async function fetchDays(ids, year) {
  if (!ids.length) return;
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from("days").select("user_id,day,rating,note")
      .in("user_id", ids).gte("day", `${year}-01-01`).lte("day", `${year}-12-31`)
      .order("user_id").order("day").range(from, from + page - 1);
    if (error) { notice("Couldn’t load some days. Refresh to try again."); return; }
    for (const row of data) (S.days[row.user_id] = S.days[row.user_id] || {})[row.day] = row.note ? { r: row.rating, n: row.note } : { r: row.rating };
    if (data.length < page) break;
  }
  ids.forEach(id => { S.loadedYears[`${id}:${year}`] = true; S.days[id] = S.days[id] || {}; });
  render();
}

async function saveDay(k, r, n) {
  const mine = S.days[S.me] = S.days[S.me] || {};
  const before = mine[k];
  mine[k] = n ? { r, n: n.slice(0, 140) } : { r };
  render();
  const { error } = await sb.from("days").upsert({ user_id: S.me, day: k, rating: r, note: n ? n.slice(0, 140) : null, updated_at: new Date().toISOString() });
  if (error) { if (before) mine[k] = before; else delete mine[k]; render(); notice("That rating didn’t save. Check your connection and try again."); }
}
async function clearDay(k) {
  const mine = S.days[S.me] || {}, before = mine[k];
  delete mine[k]; render();
  const { error } = await sb.from("days").delete().eq("user_id", S.me).eq("day", k);
  if (error) { mine[k] = before; render(); notice("Couldn’t clear that day. Try again."); }
}

// ---------- data: friends ----------
async function loadFriendships() {
  const { data, error } = await sb.from("friendships").select("requester,addressee,status");
  if (error) { notice("Couldn’t load friends. Refresh to try again."); return; }
  const other = f => f.requester === S.me ? f.addressee : f.requester;
  S.friends = data.filter(f => f.status === "accepted").map(other);
  S.incoming = data.filter(f => f.status === "pending" && f.addressee === S.me).map(f => f.requester);
  S.outgoing = data.filter(f => f.status === "pending" && f.requester === S.me).map(f => f.addressee);
  if (S.viewing && !S.friends.includes(S.viewing)) S.viewing = null;
  await loadProfiles([...S.friends, ...S.incoming, ...S.outgoing]);
  const need = S.friends.filter(id => !S.loadedYears[`${id}:${now.getFullYear()}`]);
  await fetchDays(need, now.getFullYear());
  render();
}
async function loadProfiles(ids) {
  const need = [...new Set(ids)].filter(id => !S.profiles[id]);
  if (!need.length) return;
  const { data } = await sb.from("profiles").select("id,handle,name,avatar_url").in("id", need);
  (data || []).forEach(p => { S.profiles[p.id] = p; });
}

let searchHits = [];
function openFriends() {
  $("friendSearch").value = ""; searchHits = [];
  $("myHandleLine").textContent = `Your handle: @${S.profile.handle}`;
  renderFriendList();
  placePop($("friendPop"), $("addFriend"));
  setTimeout(() => $("friendSearch").focus(), 0);
  loadFriendships().then(() => { if (!$("friendPop").hidden) renderFriendList(); });
}
let searchSeq = 0;
$("friendSearch").addEventListener("input", async () => {
  const q = $("friendSearch").value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_ ]/g, "").trim().split(/\s+/)[0] || "";
  const seq = ++searchSeq;
  if (q.length < 2) { searchHits = []; renderFriendList(); return; }
  const { data } = await sb.from("profiles").select("id,handle,name,avatar_url")
    .or(`handle.ilike.${q}*,name.ilike.*${q}*`).neq("id", S.me).limit(8);
  if (seq !== searchSeq) return;
  searchHits = data || [];
  searchHits.forEach(p => { S.profiles[p.id] = p; });
  renderFriendList();
});

function personRow(id, sub, actions) {
  const p = profileOf(id);
  const row = document.createElement("div"); row.className = "prow";
  const who = document.createElement("div"); who.className = "who";
  const nm = document.createElement("div"); nm.textContent = p.name || "@" + (p.handle || "someone");
  const sm = document.createElement("small"); sm.textContent = sub || (p.handle ? "@" + p.handle : "");
  who.append(nm, sm);
  const btns = document.createElement("div"); btns.className = "btn-row";
  actions.forEach(([label, fn, primary]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn" + (primary ? " primary" : ""); b.textContent = label;
    b.onclick = async () => { b.disabled = true; await fn(); renderFriendList(); };
    btns.append(b);
  });
  row.append(avatar(p.avatar_url), who, btns);
  return row;
}
function renderFriendList() {
  const el = $("friendList"); el.textContent = "";
  const lbl = t => { const d = document.createElement("div"); d.className = "plabel"; d.textContent = t; el.append(d); };
  const empty = t => { const d = document.createElement("div"); d.className = "empty-p"; d.textContent = t; el.append(d); };
  const q = $("friendSearch").value.trim();
  if (q) {
    lbl("Results");
    if (!searchHits.length) empty(q.replace(/^@/, "").length < 2 ? "Keep typing…" : "No one found with that handle or name.");
    searchHits.forEach(p => {
      const id = p.id;
      if (S.friends.includes(id)) el.append(personRow(id, "Friends", []));
      else if (S.outgoing.includes(id)) el.append(personRow(id, "Request sent", [["Cancel", () => removeFriend(id)]]));
      else if (S.incoming.includes(id)) el.append(personRow(id, "Wants to be friends", [["Accept", () => acceptFriend(id), true]]));
      else el.append(personRow(id, null, [["Add", () => requestFriend(id), true]]));
    });
    return;
  }
  if (S.incoming.length) {
    lbl("Requests");
    S.incoming.forEach(id => el.append(personRow(id, null, [["Decline", () => removeFriend(id)], ["Accept", () => acceptFriend(id), true]])));
  }
  if (S.outgoing.length) {
    lbl("Sent");
    S.outgoing.forEach(id => el.append(personRow(id, "Waiting for them to accept", [["Cancel", () => removeFriend(id)]])));
  }
  lbl("Friends");
  if (S.friends.length) S.friends.forEach(id => el.append(personRow(id, null, [["Remove", () => removeFriend(id)]])));
  else empty("No friends yet. Search for someone’s @handle above, or send them yours.");
}

async function requestFriend(id) {
  const { error } = await sb.from("friendships").insert({ requester: S.me, addressee: id });
  if (error && error.code !== "23505") { notice("Couldn’t send that request. Try again."); return; }
  if (error) { // they may have already asked you; accepting is the natural move
    await loadFriendships();
    if (S.incoming.includes(id)) return acceptFriend(id);
  }
  S.outgoing = [...new Set([...S.outgoing, id])]; render();
}
async function acceptFriend(id) {
  const { error } = await sb.from("friendships").update({ status: "accepted" }).eq("requester", id).eq("addressee", S.me);
  if (error) { notice("Couldn’t accept that request. Try again."); return; }
  await loadFriendships();
}
async function removeFriend(id) {
  const { error } = await sb.from("friendships").delete()
    .or(`and(requester.eq.${S.me},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${S.me})`);
  if (error) { notice("Couldn’t update that friendship. Try again."); return; }
  if (S.viewing === id) S.viewing = null;
  delete S.days[id];
  Object.keys(S.loadedYears).forEach(k => { if (k.startsWith(id + ":")) delete S.loadedYears[k]; });
  await loadFriendships();
}

// refresh friends' days when coming back to the tab
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !signedIn()) return;
  S.friends.forEach(id => { delete S.loadedYears[`${id}:${now.getFullYear()}`]; });
  await loadFriendships();
  if (S.viewing) await ensureYear(S.viewing, S.year);
});

// ---------- pixel-art sunset background ----------
const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function drawBackground() {
  const cv = $("mosaic"), P = innerWidth < 600 ? 5 : 7;
  const w = Math.ceil(innerWidth / P), h = Math.ceil(innerHeight / P);
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  const dark = isDark();
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const cache = {};
  const rgb = (r, dl = 0, c = 0.16) => {
    const L = Math.max(0.12, Math.min(0.97, +light(r) + dl + (dark ? -0.26 : 0.04)));
    const k = r + "|" + L.toFixed(3) + "|" + c;
    if (!cache[k]) {
      probe.fillStyle = "#000"; probe.fillStyle = `oklch(${L.toFixed(3)} ${(dark ? c * 0.8 : c).toFixed(3)} ${hue(r)})`;
      probe.fillRect(0, 0, 1, 1); cache[k] = probe.getImageData(0, 0, 1, 1).data.slice(0, 3);
    }
    return cache[k];
  };
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const dith = (x, y) => (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  let seed = 1717; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const img = g.createImageData(w, h), D = img.data;
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255; };

  const horizon = Math.round(h * 0.62);
  for (let y = 0; y < h; y++) {
    const v = 1.6 + Math.min(1, y / horizon) * 4.2, lo = Math.floor(v), f = v - lo;
    for (let x = 0; x < w; x++) put(x, y, rgb(f > dith(x, y) ? lo + 1 : lo, 0.1, 0.12));
  }
  for (let i = 0; i < Math.max(3, Math.round(w / 45)); i++) {
    const cx = Math.floor(rnd() * w), cy = Math.floor(h * (0.08 + rnd() * 0.3)), cw = 8 + Math.floor(rnd() * 14);
    const cc = rgb(6, 0.28, 0.04), cs = rgb(5, 0.16, 0.06);
    [[0.5, -2], [0.8, -1], [1, 0], [0.9, 1]].forEach(([s, dy]) => {
      const half = Math.round(cw * s / 2);
      for (let dx = -half; dx <= half; dx++) put(cx + dx + (dy > 0 ? 1 : 0), cy + dy, dy > 0 ? cs : cc);
    });
  }
  const sr = Math.max(8, Math.round(Math.min(w, h) * 0.14)), sx = Math.round(w * 0.7), sy = Math.round(horizon - sr * 0.35);
  const step = Math.max(3, Math.round(sr / 4));
  for (let y = sy - sr; y <= sy + sr; y++) for (let x = sx - sr; x <= sx + sr; x++) {
    const dx = x - sx, dy = y - sy; if (dx * dx + dy * dy > sr * sr) continue;
    if (dy > 0 && dy % step < 1 + Math.floor(dy / sr * 2.5)) continue;
    const v = 6.2 - (dy + sr) / (2 * sr) * 2.4, lo = Math.floor(v);
    put(x, y, rgb(v - lo > dith(x, y) ? lo + 1 : lo, 0.14, 0.15));
  }
  const layers = [
    { base: horizon + h * 0.01, amp: h * 0.06, f: 0.018, r: 6, dl: 0.04 },
    { base: horizon + h * 0.08, amp: h * 0.05, f: 0.027, r: 7, dl: 0 },
    { base: horizon + h * 0.17, amp: h * 0.045, f: 0.035, r: 9, dl: -0.05 },
    { base: horizon + h * 0.28, amp: h * 0.04, f: 0.042, r: 10, dl: -0.12 },
  ];
  layers.forEach((Ly, li) => {
    const ph = rnd() * 10, ph2 = rnd() * 10, top = [];
    for (let x = 0; x < w; x++) {
      const t = Math.round(Ly.base - Ly.amp * (Math.sin(x * Ly.f + ph) + 0.5 * Math.sin(x * Ly.f * 2.3 + ph2)));
      top[x] = t;
      for (let y = Math.max(0, t); y < h; y++) {
        const shade = Math.min(1, (y - t) / (h * 0.12)) > dith(x, y) ? -0.05 : 0;
        put(x, y, y === t ? rgb(Ly.r, Ly.dl + 0.09) : rgb(Ly.r, Ly.dl + shade));
      }
    }
    if (li >= 1) {
      const n = Math.round(w / (li === 3 ? 12 : 22));
      const dk = rgb(10, Ly.dl - 0.22), lt = rgb(9, Ly.dl - 0.1), trunk = rgb(2, -0.2, 0.08);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(rnd() * w), ht = Math.round((3 + rnd() * 4) * (1 + li * 0.4)), base = top[x];
        put(x, base, trunk); put(x, base - 1, trunk);
        for (let j = 0; j < ht; j++) {
          const half = Math.floor((ht - j) / 2.6);
          for (let dx = -half; dx <= half; dx++) put(x + dx, base - 2 - j, dx < 0 ? lt : dk);
        }
      }
    }
  });
  g.putImageData(img, 0, 0);
}
const safeDraw = () => { try { drawBackground(); } catch (e) { console.warn("background skipped", e); } };
let bgT; addEventListener("resize", () => { clearTimeout(bgT); bgT = setTimeout(safeDraw, 120); });
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", safeDraw); } catch {}

// ---------- go ----------
render();
safeDraw();
