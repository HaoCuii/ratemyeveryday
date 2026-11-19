import "./styles.css";
import { getMyProfile, onUserChange, signOut } from "./data/auth";
import { ensureYear, loadLocalDays, moveLocalDaysToAccount } from "./data/days";
import { loadFriendships, unwatchFriendships, watchFriendships } from "./data/friends";
import { initNotes, lockNotes } from "./data/notes";
import { THIS_YEAR } from "./lib/dates";
import { $ } from "./lib/dom";
import { S, emit, onChange, resetSession, setNotice, signedIn } from "./state";
import { startBackground } from "./ui/background";
import { bindEditor, openEditor } from "./ui/editor";
import { bindFriendsPanel } from "./ui/friends-panel";
import { renderGrid, sizeCells } from "./ui/grid";
import { bindHeader, renderHeader } from "./ui/header";
import { bindOnboarding, closeOnboarding, openOnboarding } from "./ui/onboarding";
import { bindPopovers } from "./ui/popover";
import { bindShare } from "./ui/share";
import { bindSignIn } from "./ui/signin";
import { renderStats } from "./ui/stats";
import { hideTip, showTip } from "./ui/tooltip";
import { canEdit } from "./view";

// ---------- render loop: any state change redraws (batched to one frame) ----------
let queued = false;
onChange(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderHeader();
    renderGrid();
    renderStats();
  });
});

// ---------- grid interactions ----------
const cells = $("cells");
const cellFrom = (e: Event) => (e.target as HTMLElement).closest<HTMLButtonElement>(".cell");
cells.addEventListener("pointerover", e => { const c = cellFrom(e); if (c && e.pointerType !== "touch") showTip(c); });
cells.addEventListener("pointerleave", hideTip);
cells.addEventListener("focusin", e => { const c = cellFrom(e); if (c) showTip(c); });
cells.addEventListener("focusout", hideTip);
cells.addEventListener("click", e => {
  const c = cellFrom(e);
  if (!c || c.disabled || !c.dataset.k) return;
  if (canEdit()) { hideTip(); openEditor(c.dataset.k, c); }
  else showTip(c); // tap to read on touch screens
});
addEventListener("scroll", hideTip, { passive: true });
new ResizeObserver(sizeCells).observe($("boardWrap"));

// ---------- controls ----------
bindPopovers();
bindEditor();
bindFriendsPanel();
bindShare();
bindHeader(async dir => {
  S.year += dir;
  emit();
  if (signedIn() && S.me) await ensureYear([S.viewing ?? S.me], S.year);
});
bindSignIn();
$("signOut").addEventListener("click", async () => { await lockNotes(); await signOut(); }); // forget this device's notes key

// ---------- session ----------
async function loadEverything() {
  if (!S.me) return;
  const moved = await moveLocalDaysToAccount(); // days rated before signing in come along
  await initNotes(); // remembered notes key on this device, if any; encrypts any leftover plaintext notes
  await loadFriendships();
  watchFriendships(); // requests and accepts show up live
  await ensureYear([S.me], S.year);
  if (S.year !== THIS_YEAR) await ensureYear([S.me], THIS_YEAR); // for the 7-day strips
  setNotice(moved ? `Moved ${moved} ${moved === 1 ? "day" : "days"} from this browser into your account.` : "");
}

bindOnboarding();
onUserChange(async user => {
  if (!user) {
    // signed out (or never signed in): rate days in this browser
    unwatchFriendships();
    resetSession();
    loadLocalDays();
    closeOnboarding();
    emit();
    return;
  }
  S.me = user.id;
  S.user = user;
  setNotice("Loading your year…");
  const { data, error } = await getMyProfile(user.id);
  if (error) return setNotice("Couldn’t load your profile. Refresh to try again.");
  if (!data) {
    setNotice("");
    return openOnboarding(() => void loadEverything());
  }
  S.profile = data;
  S.profiles[data.id] = data;
  emit();
  await loadEverything();
});

// Friends may have rated new days while this tab was in the background.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !signedIn()) return;
  for (const id of S.friends) S.loadedYears.delete(`${id}:${THIS_YEAR}`);
  await loadFriendships();
  if (S.viewing) await ensureYear([S.viewing], S.year);
});

loadLocalDays(); // shown right away; replaced if a signed-in session turns up
startBackground();
emit();
