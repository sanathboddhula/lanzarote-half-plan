import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const authPanel = $("auth-panel");
const workspace = $("workspace");
const frame = $("plan-frame");
let supabase;
let currentUser = null;
let currentPlanHtml = "";
let currentState = emptyState();
let saveChain = Promise.resolve();
let generation = 0;

function emptyState() {
  return { profile: null, checks: {}, returnDate: "", strongSummary: "" };
}

function status(id, message, error = false) {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle("error", error);
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid progress data.");
  const jsonSize = JSON.stringify(raw).length;
  if (jsonSize > 500000) throw new Error("Progress file is too large.");
  const profile = raw.profile && typeof raw.profile === "object" && !Array.isArray(raw.profile) ? raw.profile : null;
  const checks = raw.checks && typeof raw.checks === "object" && !Array.isArray(raw.checks) ? raw.checks : {};
  const returnDate = typeof raw.returnDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.returnDate) ? raw.returnDate : "";
  const strongSummary = typeof raw.strongSummary === "string" ? raw.strongSummary.slice(0, 50000) : "";
  return { profile, checks, returnDate, strongSummary };
}

function writeBrowserState(state) {
  if (state.profile) localStorage.setItem("m42-profile", JSON.stringify(state.profile));
  else localStorage.removeItem("m42-profile");
  localStorage.setItem("m42-checks", JSON.stringify(state.checks));
  if (state.returnDate) localStorage.setItem("m42-return-date", state.returnDate);
  else localStorage.removeItem("m42-return-date");
  if (state.strongSummary) localStorage.setItem("m42-strong-summary", state.strongSummary);
  else localStorage.removeItem("m42-strong-summary");
}

function loadPlan(html) {
  currentPlanHtml = html;
  frame.srcdoc = html;
  frame.hidden = false;
  $("empty-plan").hidden = true;
  status("sync-status", "Synced");
}

async function refreshPasskeyStatus() {
  const panel = $("passkey-panel");
  const button = $("register-passkey");
  panel.hidden = false;
  if (!window.PublicKeyCredential || !window.isSecureContext) {
    button.hidden = true;
    status("passkey-status", "This browser cannot create a passkey. Open the site in Safari or Chrome, or use an email link.");
    return;
  }
  button.hidden = false;
  const { data, error } = await supabase.auth.passkey.list();
  if (error) {
    status("passkey-status", "Could not check passkeys: " + error.message, true);
    return;
  }
  const count = Array.isArray(data) ? data.length : 0;
  // Setup lives in Settings; a dot on the Settings button nudges until a passkey exists.
  $("open-tools").classList.toggle("needs-setup", count === 0);
  button.textContent = count ? "Add another" : "Set up";
  status("passkey-status", count
    ? "Passkey ready. Email links still work for recovery."
    : "Sign in with Face ID next time instead of an email link.");
}

async function renderSession(session) {
  const user = session?.user;
  if (user && currentUser?.id === user.id && !workspace.hidden) return;
  const seq = ++generation;
  if (!user) {
    currentUser = null;
    currentPlanHtml = "";
    currentState = emptyState();
    frame.hidden = true;
    frame.removeAttribute("srcdoc");
    workspace.hidden = true;
    authPanel.hidden = false;
    $("sign-out").hidden = true;
    $("open-tools").hidden = true;
    $("tools-panel").hidden = true;
    $("open-drinks").hidden = true;
    $("drinks-panel").hidden = true;
    status("sync-status", "");
    document.body.classList.remove("signed-in");
    $("account-label").textContent = "";
    return;
  }
  currentUser = user;
  authPanel.hidden = true;
  workspace.hidden = false;
  document.body.classList.add("signed-in");
  $("sign-out").hidden = false;
  $("open-tools").hidden = false;
  $("open-drinks").hidden = false;
  $("account-label").textContent = user.email || "Signed in";
  status("sync-status", "Loading private data…");
  refreshPasskeyStatus().catch((error) => status("passkey-status", error.message, true));
  const [stateResult, planResult] = await Promise.all([
    supabase.from("training_state").select("profile,checks,return_date,strong_summary").eq("user_id", user.id).maybeSingle(),
    supabase.from("private_plan_html").select("html").eq("user_id", user.id).maybeSingle()
  ]);
  if (seq !== generation) return;
  if (stateResult.error || planResult.error) {
    status("sync-status", "Could not load Supabase data. Check that schema.sql was applied.", true);
    status("tool-status", stateResult.error?.message || planResult.error?.message, true);
    return;
  }
  currentState = normalizeState({
    profile: stateResult.data?.profile ?? null,
    checks: stateResult.data?.checks ?? {},
    returnDate: stateResult.data?.return_date ?? "",
    strongSummary: stateResult.data?.strong_summary ?? ""
  });
  writeBrowserState(currentState);
  if (planResult.data?.html) loadPlan(planResult.data.html);
  else {
    frame.hidden = true;
    $("empty-plan").hidden = false;
    status("sync-status", "Signed in · add your private plan");
    $("tools-panel").hidden = false;
    $("open-tools").setAttribute("aria-expanded", "true");
  }
}

function saveState(raw) {
  const state = normalizeState(raw);
  currentState = state;
  writeBrowserState(state);
  const userId = currentUser?.id;
  if (!userId) return Promise.reject(new Error("Sign in before saving progress."));
  saveChain = saveChain.catch(() => {}).then(async () => {
    status("sync-status", "Saving progress…");
    const { error } = await supabase.from("training_state").upsert({
      user_id: userId,
      profile: state.profile || {},
      checks: state.checks,
      return_date: state.returnDate || null,
      strong_summary: state.strongSummary,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) {
      status("sync-status", "Save failed · progress is still in this browser", true);
      throw error;
    }
    status("sync-status", "Saved to Supabase");
  });
  return saveChain;
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.type !== "m42-state") return;
  saveState(event.data.state).catch((error) => status("tool-status", error.message, true));
});

// Settings and Drinks are drawers above the pill; only one is open at a time.
const drawers = { tools: ["open-tools", "tools-panel"], drinks: ["open-drinks", "drinks-panel"] };

function setDrawer(name) {
  for (const [key, [buttonId, panelId]] of Object.entries(drawers)) {
    const open = key === name;
    $(panelId).hidden = !open;
    $(buttonId).setAttribute("aria-expanded", String(open));
  }
  if (name === "drinks") openDrinks();
}

function setToolsOpen(open) {
  setDrawer(open ? "tools" : null);
}

$("open-tools").addEventListener("click", () => setDrawer($("tools-panel").hidden ? "tools" : null));
$("open-drinks").addEventListener("click", () => setDrawer($("drinks-panel").hidden ? "drinks" : null));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setDrawer(null);
});

// Drink log
let drinkCount = 1;

function localInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dayKey(date) {
  return localInputValue(date).slice(0, 10);
}

function setDrinkCount(n) {
  drinkCount = Math.min(20, Math.max(0.5, n));
  $("drink-count").textContent = String(drinkCount);
}

function selectedKind() {
  return $("drink-kinds").querySelector('[aria-checked="true"]')?.textContent || "Other";
}

function openDrinks() {
  $("drink-time").value = localInputValue(new Date());
  loadDrinks();
}

async function loadDrinks() {
  if (!currentUser) return;
  const since = new Date();
  since.setDate(since.getDate() - 35);
  const { data, error } = await supabase.from("drink_log")
    .select("id,drank_at,drinks,kind")
    .gte("drank_at", since.toISOString())
    .order("drank_at", { ascending: false })
    .limit(200);
  if (error) {
    status("drink-status", error.message, true);
    return;
  }
  renderDrinks(data);
}

function renderDrinks(rows) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let week = 0;
  let month = 0;
  const drinkDays = new Set();
  for (const row of rows) {
    const at = new Date(row.drank_at);
    const n = Number(row.drinks);
    if (at >= weekStart) {
      week += n;
      drinkDays.add(dayKey(at));
    }
    if (at >= monthStart) month += n;
  }
  $("drinks-week").textContent = String(week);
  $("drinks-month").textContent = String(month);
  $("drinks-free").textContent = (7 - drinkDays.size) + " / 7";
  const list = $("drink-history");
  list.innerHTML = "";
  for (const row of rows.slice(0, 8)) {
    const item = document.createElement("li");
    const when = new Date(row.drank_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const text = document.createElement("span");
    text.textContent = Number(row.drinks) + " × " + row.kind + " · " + when;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + text.textContent);
    remove.addEventListener("click", async () => {
      const { error } = await supabase.from("drink_log").delete().eq("id", row.id);
      if (error) status("drink-status", error.message, true);
      else loadDrinks();
    });
    item.append(text, remove);
    list.append(item);
  }
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "drink-empty";
    empty.textContent = "Nothing logged yet.";
    list.append(empty);
  }
}

$("drink-minus").addEventListener("click", () => setDrinkCount(drinkCount - (drinkCount <= 1 ? 0.5 : 1)));
$("drink-plus").addEventListener("click", () => setDrinkCount(drinkCount < 1 ? 1 : drinkCount + 1));
$("drink-kinds").addEventListener("click", (event) => {
  const chip = event.target.closest("[role=radio]");
  if (!chip) return;
  for (const other of $("drink-kinds").children) other.setAttribute("aria-checked", String(other === chip));
});

$("drink-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const when = new Date($("drink-time").value);
  if (Number.isNaN(when.getTime())) {
    status("drink-status", "Pick a valid time.", true);
    return;
  }
  const { error } = await supabase.from("drink_log").insert({ drinks: drinkCount, kind: selectedKind(), drank_at: when.toISOString() });
  if (error) {
    status("drink-status", error.message, true);
    return;
  }
  status("drink-status", "Logged " + drinkCount + " × " + selectedKind() + ".");
  setDrinkCount(1);
  $("drink-time").value = localInputValue(new Date());
  loadDrinks();
});

$("passkey-sign-in").addEventListener("click", async () => {
  if (!window.PublicKeyCredential || !window.isSecureContext) {
    status("auth-status", "This browser cannot use passkeys. Open the site in Safari or Chrome, or use an email link.", true);
    return;
  }
  status("auth-status", "Waiting for your device’s passkey prompt…");
  try {
    const { error } = await supabase.auth.signInWithPasskey();
    status("auth-status", error ? error.message : "Signed in. Loading your plan…", Boolean(error));
  } catch (error) {
    status("auth-status", error.message, true);
  }
});

$("email-link-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email").value.trim();
  if (!email) return;
  status("auth-status", "Sending a one-time link…");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false }
  });
  status("auth-status", error ? error.message : "Check your email and open the link on this device. Then add a passkey here.", Boolean(error));
});

$("register-passkey").addEventListener("click", async () => {
  if (!currentUser) return;
  status("passkey-status", "Waiting for your device’s passkey prompt…");
  try {
    const { error } = await supabase.auth.registerPasskey();
    if (error) {
      status("passkey-status", error.message, true);
      return;
    }
    await refreshPasskeyStatus();
  } catch (error) {
    status("passkey-status", error.message, true);
  }
});

$("sign-out").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) status("sync-status", error.message, true);
});

$("plan-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;
  if (file.size > 1024 * 1024) {
    status("tool-status", "Choose a plan HTML file under 1 MB.", true);
    return;
  }
  const html = await file.text();
  if (!html.includes("m42-host-sync-v1") || !html.includes('id="view-lifting"')) {
    status("tool-status", "Choose the latest marathon-muscle-plan.html from this workspace.", true);
    return;
  }
  status("tool-status", "Saving your private plan…");
  const { error } = await supabase.from("private_plan_html").upsert({
    user_id: currentUser.id,
    html,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) {
    status("tool-status", error.message, true);
    return;
  }
  loadPlan(html);
  status("tool-status", "Private plan saved. It is not in the GitHub repository.");
  event.target.value = "";
});

$("progress-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;
  if (file.size > 1024 * 1024) {
    status("tool-status", "Choose a progress JSON file under 1 MB.", true);
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== "m42-progress-v1") throw new Error("Choose the progress file exported from your local plan.");
    await saveState(data.state);
    if (currentPlanHtml) loadPlan(currentPlanHtml);
    status("tool-status", "Progress imported and saved to Supabase.");
  } catch (error) {
    status("tool-status", error.message, true);
  }
  event.target.value = "";
});

$("export-cloud").addEventListener("click", () => {
  const payload = JSON.stringify({ format: "m42-progress-v1", exportedAt: new Date().toISOString(), state: currentState }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lanzarote-plan-cloud-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("backup-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;
  if (file.size > 20 * 1024 * 1024) {
    status("tool-status", "Choose a CSV under 20 MB for this backup bucket.", true);
    return;
  }
  const source = $("backup-source").value;
  if (source !== "strong" && source !== "strava") return;
  status("tool-status", "Uploading private " + source + " backup…");
  try {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
    const path = currentUser.id + "/" + source + "/" + hash + ".csv";
    const { error } = await supabase.storage.from("training-exports").upload(path, file, {
      contentType: "text/csv",
      upsert: false
    });
    if (error && /already exists|duplicate/i.test(error.message)) {
      status("tool-status", "This " + source + " CSV is already backed up privately.");
    } else if (error) {
      throw error;
    } else {
      status("tool-status", "Original " + source + " CSV backed up privately in Supabase.");
    }
  } catch (error) {
    status("tool-status", error.message, true);
  }
  event.target.value = "";
});

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) ||
    SUPABASE_PUBLISHABLE_KEY.startsWith("REPLACE_")) {
  $("connection-panel").hidden = false;
} else {
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: true } }
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => renderSession(session).catch((error) => status("sync-status", error.message, true)), 0);
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await renderSession(data.session);
  } catch (error) {
    $("connection-panel").hidden = false;
    $("connection-panel").querySelector("p:last-child").textContent = "Could not connect to Supabase: " + error.message;
  }
}
