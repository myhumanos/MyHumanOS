const form = document.querySelector("#chart-form");
const panel = document.querySelector("#reading-panel");
const canvas = document.querySelector("#chart-canvas");
const providerLabel = document.querySelector("#provider-label");
const publicChartList = document.querySelector("#public-chart-list");
const publicChartStatus = document.querySelector("#public-chart-status");
const publicChartDialog = document.querySelector("#public-chart-dialog");
const publicChartDialogContent = document.querySelector("#public-chart-dialog-content");
const publicChartDialogClose = document.querySelector("#public-chart-dialog-close");
const chartSummaryRail = document.querySelector("#chart-summary-rail");
const accountButton = document.querySelector("#account-button");
const accountDialog = document.querySelector("#account-dialog");
const accountDialogClose = document.querySelector("#account-dialog-close");
const accountForm = document.querySelector("#account-form");
const accountStatus = document.querySelector("#account-status");
const context = canvas.getContext("2d");
let publicChartEntries = [];
let latestChartArchive = null;
let currentUser = null;

const colors = {
  ink: "#f7f1ff",
  muted: "#b4a6c7",
  line: "rgba(232, 213, 255, 0.22)",
  paper: "#12091a",
  surface: "#160d20",
  teal: "#83e6ff",
  coral: "#ff8fc7",
  gold: "#dfb86d",
  violet: "#8f5cff",
  blue: "#9fb7ff",
  green: "#b8f0c2"
};

const centerLayout = [
  { name: "Kopf", x: 450, y: 128, shape: "triangle" },
  { name: "Ajna", x: 450, y: 238, shape: "triangleDown" },
  { name: "Kehle", x: 450, y: 350, shape: "square" },
  { name: "G-Zentrum", x: 450, y: 472, shape: "diamond" },
  { name: "Ego", x: 572, y: 502, shape: "small" },
  { name: "Milz", x: 314, y: 578, shape: "triangleRight" },
  { name: "Solarplexus", x: 606, y: 606, shape: "triangleLeft" },
  { name: "Sakral", x: 450, y: 636, shape: "square" },
  { name: "Wurzel", x: 450, y: 770, shape: "square" }
];

const channelDefinitions = [
  [64, 47, "Kopf", "Ajna"], [61, 24, "Kopf", "Ajna"], [63, 4, "Kopf", "Ajna"],
  [17, 62, "Ajna", "Kehle"], [43, 23, "Ajna", "Kehle"], [11, 56, "Ajna", "Kehle"],
  [31, 7, "Kehle", "G-Zentrum"], [8, 1, "Kehle", "G-Zentrum"], [33, 13, "Kehle", "G-Zentrum"], [20, 10, "Kehle", "G-Zentrum"],
  [25, 51, "G-Zentrum", "Ego"], [2, 14, "G-Zentrum", "Sakral"], [5, 15, "Sakral", "G-Zentrum"], [29, 46, "Sakral", "G-Zentrum"], [10, 34, "G-Zentrum", "Sakral"],
  [20, 34, "Kehle", "Sakral"], [57, 34, "Milz", "Sakral"], [27, 50, "Sakral", "Milz"], [59, 6, "Sakral", "Solarplexus"],
  [3, 60, "Sakral", "Wurzel"], [42, 53, "Sakral", "Wurzel"], [9, 52, "Sakral", "Wurzel"],
  [20, 57, "Kehle", "Milz"], [16, 48, "Kehle", "Milz"], [10, 57, "G-Zentrum", "Milz"],
  [44, 26, "Milz", "Ego"], [32, 54, "Milz", "Wurzel"], [28, 38, "Milz", "Wurzel"], [18, 58, "Milz", "Wurzel"],
  [21, 45, "Ego", "Kehle"], [37, 40, "Solarplexus", "Ego"], [12, 22, "Kehle", "Solarplexus"], [35, 36, "Kehle", "Solarplexus"],
  [19, 49, "Wurzel", "Solarplexus"], [39, 55, "Wurzel", "Solarplexus"], [41, 30, "Wurzel", "Solarplexus"]
].map(([gateA, gateB, from, to]) => ({ gateA, gateB, from, to, name: `${gateA}-${gateB}` }));

const centerGateMap = channelDefinitions.reduce((map, channel) => {
  map[channel.from] = [...new Set([...(map[channel.from] || []), channel.gateA])].sort((a, b) => a - b);
  map[channel.to] = [...new Set([...(map[channel.to] || []), channel.gateB])].sort((a, b) => a - b);
  return map;
}, {});

const centerFillColors = {
  Kopf: "#f2f0fb",
  Ajna: "#ede8ff",
  Kehle: "#8f5cff",
  "G-Zentrum": "#f6efff",
  Ego: "#b389ff",
  Milz: "#a985d6",
  Sakral: "#7f5bb9",
  Solarplexus: "#b98ef2",
  Wurzel: "#ede8ff"
};

const defaultChart = {
  type: "Dein Chart",
  strategy: "Berechnung starten",
  authority: "offen",
  profile: "",
  signature: "",
  notSelf: "",
  centers: [],
  gates: [],
  isPlaceholder: true,
  humanDesign: {
    definedCenters: [],
    openCenters: centerLayout.map((center) => center.name),
    channels: [],
    gates: []
  }
};

drawChart(defaultChart);
renderChartSummaryRail(defaultChart);
loadPublicCharts();
loadAccount();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector("button");
  const payload = Object.fromEntries(new FormData(form).entries());

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Berechne live...";
  panel.innerHTML = loadingTemplate();

  try {
    const chart = await fetchChart(payload);
    renderReading(chart, payload);
    drawChart(chart);
    renderChartSummaryRail(chart);
    providerLabel.textContent = chart.isMock ? "Fallback Preview" : "Swiss Ephemeris live";
    if (!chart.isMock) {
      addPublicChartFromResult(chart, payload);
      await saveProfileToAccount(chart, payload);
    }
  } catch (error) {
    panel.innerHTML = `<p class="error">${escapeHtml(error.message)} Keine Chart-Werte wurden gespeichert.</p>`;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Chart berechnen";
  }
});

accountButton?.addEventListener("click", () => {
  accountDialog?.showModal();
});

accountDialogClose?.addEventListener("click", () => {
  accountDialog?.close();
});

accountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const action = submitter?.value || "login";
  const data = Object.fromEntries(new FormData(accountForm).entries());
  await authRequest(action, data);
});

function renderChartSummaryRail(chart) {
  if (!chartSummaryRail) {
    return;
  }

  if (chart.isPlaceholder) {
    chartSummaryRail.innerHTML = `
    <article>
      <span>Status</span>
      <strong>Bereit</strong>
      <p>Gib deine Daten ein.</p>
    </article>
    <article>
      <span>Profil</span>
      <strong>--/--</strong>
      <p>Wird live berechnet.</p>
    </article>
    <article>
      <span>Autorität</span>
      <strong>offen</strong>
      <p>Nach Chart-Ergebnis.</p>
    </article>
    <article>
      <span>Definition</span>
      <strong>wartet</strong>
      <p>Zentren und Kanäle.</p>
    </article>
  `;
    return;
  }

  const hd = chart.humanDesign || {};
  const definedCenters = hd.definedCenters || chart.centers || [];
  const channels = Array.isArray(hd.channels) ? hd.channels : [];
  const definition = channels.length
    ? `${channels.length} Kanal${channels.length === 1 ? "" : "e"}`
    : definedCenters.length
      ? `${definedCenters.length} Zentren`
      : "Offen";
  const profileText = profileDescriptionForPublic(chart.profile || "").split(":")[0] || "Profil";

  chartSummaryRail.innerHTML = `
    <article>
      <span>Typ</span>
      <strong>${escapeHtml(chart.type || "Human Design")}</strong>
      <p>${escapeHtml(chart.strategy || "Strategie offen")}</p>
    </article>
    <article>
      <span>Profil</span>
      <strong>${escapeHtml(chart.profile || "n/a")}</strong>
      <p>${escapeHtml(profileText)}</p>
    </article>
    <article>
      <span>Autorität</span>
      <strong>${escapeHtml(chart.authority || "offen")}</strong>
      <p>${escapeHtml(authorityPracticeForPublic(chart.authority || "").split(".")[0])}</p>
    </article>
    <article>
      <span>Definition</span>
      <strong>${escapeHtml(definition)}</strong>
      <p>${escapeHtml(chart.signature ? `${chart.signature} / ${chart.notSelf || "Nicht-Selbst"}` : "Bodygraph Preview")}</p>
    </article>
  `;
}

publicChartList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-public-chart-id]");

  if (!card) {
    return;
  }

  const entry = publicChartEntries.find((item) => item.id === card.dataset.publicChartId);

  if (entry) {
    openPublicChartDialog(entry);
  }
});

publicChartDialogClose.addEventListener("click", () => {
  closePublicChartDialog();
});

publicChartDialog.addEventListener("click", (event) => {
  if (event.target === publicChartDialog) {
    closePublicChartDialog();
  }
});

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-chart-json]");

  if (!button) {
    return;
  }

  await saveLatestChartArchive(button);
});

async function fetchChart(payload) {
  let response;

  try {
    response = await fetch("/api/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error("Die Live-API ist nicht erreichbar. Bitte prüfe den Cloudflare Worker und den ASTROLOGY_API_KEY.");
  }

  if (response.ok) return response.json();

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  throw new Error(data.detail || data.error || "Die Chart-Auswertung konnte gerade nicht geladen werden.");
}

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
    const data = await response.json();
    setCurrentUser(data.user || null);
  } catch {
    setCurrentUser(null);
  }
}

async function authRequest(action, payload) {
  if (accountStatus) accountStatus.textContent = action === "register" ? "Registriere..." : "Logge ein...";

  try {
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Account-Aktion fehlgeschlagen.");
    setCurrentUser(data.user || null);
    if (accountStatus) accountStatus.textContent = "Eingeloggt. Dein nächster berechneter Chart wird privat gespeichert.";
    accountDialog?.close();
    if (latestChartArchive) await saveProfileArchive(latestChartArchive);
  } catch (error) {
    if (accountStatus) accountStatus.textContent = error.message;
  }
}

function setCurrentUser(user) {
  currentUser = user;
  if (accountButton) accountButton.textContent = user ? "Profil" : "Login";
  if (accountStatus) {
    accountStatus.textContent = user?.profile
      ? `Eingeloggt als ${user.email}. Profil gespeichert: ${user.profile.type || "Chart"} ${user.profile.profile || ""}`.trim()
      : user
        ? `Eingeloggt als ${user.email}.`
        : "Noch nicht eingeloggt.";
  }
}

async function saveProfileToAccount(chart, payload) {
  latestChartArchive = createChartArchive(chart, payload);
  if (!currentUser) return;
  await saveProfileArchive(latestChartArchive);
}

async function saveProfileArchive(archive) {
  const chart = archive.chart || archive;
  const payload = archive.payload || {};
  const hd = chart.humanDesign || {};
  const profile = {
    name: payload.name || chart.name || "Mein Chart",
    type: chart.type,
    strategy: chart.strategy,
    authority: chart.authority,
    profile: chart.profile,
    signature: chart.signature,
    notSelf: chart.notSelf,
    birthDate: payload.birthDate,
    birthTime: payload.birthTime,
    birthPlace: payload.birthPlace || chart.location?.city,
    timezone: payload.timezone || chart.location?.timezone,
    centers: hd.definedCenters || chart.centers || [],
    openCenters: hd.openCenters || [],
    gates: hd.gates || chart.gates || []
  };

  try {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Profil konnte nicht gespeichert werden.");
    setCurrentUser(data.user || { ...currentUser, profile: data.profile });
  } catch (error) {
    if (accountStatus) accountStatus.textContent = error.message;
  }
}

async function loadPublicCharts() {
  try {
    const response = await fetch("/api/charts", { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error("Public chart list unavailable.");
    }

    const data = await response.json();
    renderPublicCharts(data.charts || [], data.storageEnabled);
  } catch {
    renderPublicCharts(readLocalPublicCharts(), false);
  }
}

function addPublicChartFromResult(chart, payload) {
  const serverEntry = chart.publicChart?.entry;

  if (serverEntry) {
    const shouldRememberLocally = !chart.publicChart.saved;
    if (shouldRememberLocally) {
      rememberLocalPublicChart(serverEntry);
    }

    prependPublicChart(serverEntry, Boolean(chart.publicChart.storageEnabled));
    return;
  }

  const fallbackEntry = createPublicChartPreviewEntry(chart, payload);
  rememberLocalPublicChart(fallbackEntry);
  prependPublicChart(fallbackEntry, false);
}

function renderPublicCharts(charts, storageEnabled) {
  const visibleCharts = charts.slice(0, 40);
  publicChartEntries = visibleCharts;

  if (!visibleCharts.length) {
    publicChartList.innerHTML = `
      <article class="public-card muted">
        <span>Noch keine Charts</span>
        <p class="public-meta">Das naechste berechnete Chart erscheint hier wie ein kleiner Lichtpunkt im Sanctuary.</p>
      </article>
    `;
  } else {
    publicChartList.innerHTML = visibleCharts.map(publicChartCard).join("");
  }

  publicChartStatus.textContent = storageEnabled
    ? "Live gespeichert: öffentlich sichtbar sind nur Vorname und Chart-Ergebnis. Geburtsdatum, Uhrzeit, Ort, Koordinaten und API-Rohdaten bleiben verborgen."
    : "Lokale Vorschau: Für echte öffentliche Speicherung braucht Cloudflare den KV-Speicher PUBLIC_CHARTS.";
}

function prependPublicChart(entry, storageEnabled) {
  publicChartEntries = [entry, ...publicChartEntries.filter((item) => item.id !== entry.id)].slice(0, 40);
  const current = Array.from(publicChartList.querySelectorAll("[data-public-chart-id]")).map((node) => node.dataset.publicChartId);

  if (current.includes(entry.id)) {
    return;
  }

  const html = publicChartCard(entry);
  const mutedCard = publicChartList.querySelector(".public-card.muted");

  if (mutedCard) {
    publicChartList.innerHTML = html;
  } else {
    publicChartList.insertAdjacentHTML("afterbegin", html);
  }

  publicChartStatus.textContent = storageEnabled
    ? "Gespeichert. In der Community-Liste erscheint nur dein Vorname mit dem Chart-Spiegel."
    : "Lokal vorgemerkt. Für echte öffentliche Speicherung braucht Cloudflare die PUBLIC_CHARTS KV-Bindung.";
}

function publicChartCard(entry) {
  const gates = Array.isArray(entry.gates) ? entry.gates.slice(0, 6) : [];
  const centers = Array.isArray(entry.centers) ? entry.centers.slice(0, 4).join(", ") : "";

  return `
    <button class="public-card public-card-button" type="button" data-public-chart-id="${escapeHtml(entry.id)}" aria-haspopup="dialog">
      <div class="public-card-header">
        <div>
          <span>${escapeHtml(entry.provider || "Chart")}</span>
          <h3>${escapeHtml(entry.firstName || "Anonym")}</h3>
        </div>
        <time datetime="${escapeHtml(entry.createdAt || "")}">${escapeHtml(formatPublicDate(entry.createdAt))}</time>
      </div>
      <strong>${escapeHtml(entry.type || "Human Design")} - Profil ${escapeHtml(entry.profile || "n/a")}</strong>
      <p class="public-meta">${escapeHtml(entry.authority || "Autorität offen")} - ${escapeHtml(entry.strategy || "Strategie offen")}${centers ? ` - ${escapeHtml(centers)}` : ""}</p>
      ${gates.length ? `<div class="public-gates">${gates.map((gate) => `<b>Tor ${escapeHtml(gate.gate)}${gate.line ? `.${escapeHtml(gate.line)}` : ""}</b>`).join("")}</div>` : ""}
    </button>
  `;
}

function openPublicChartDialog(entry) {
  publicChartDialogContent.innerHTML = publicChartDialogTemplate(entry);

  if (typeof publicChartDialog.showModal === "function") {
    publicChartDialog.showModal();
  } else {
    publicChartDialog.setAttribute("open", "");
  }
}

function closePublicChartDialog() {
  if (typeof publicChartDialog.close === "function") {
    publicChartDialog.close();
  } else {
    publicChartDialog.removeAttribute("open");
  }
}

function publicChartDialogTemplate(entry) {
  const gates = Array.isArray(entry.gates) ? entry.gates.slice(0, 24) : [];
  const transitGates = Array.isArray(entry.transits?.gates) ? entry.transits.gates.slice(0, 8) : [];
  const channels = Array.isArray(entry.channels) ? entry.channels : [];
  const centers = Array.isArray(entry.centers) ? entry.centers : [];
  const openCenters = Array.isArray(entry.openCenters) ? entry.openCenters : [];
  const profile = entry.profile || "n/a";
  const today = entry.transits?.today || null;
  const cross = entry.incarnationCross || {};

  return `
    <div class="dialog-kicker">${escapeHtml(entry.provider || "Swiss Ephemeris")} - ${escapeHtml(formatPublicDate(entry.createdAt))}</div>
    <header class="dialog-profile-head">
      <div>
        <span class="tiny-label">Öffentliches Chart</span>
        <h2 id="public-chart-dialog-title">${escapeHtml(entry.firstName || "Anonym")}</h2>
      </div>
      <strong>Profil ${escapeHtml(profile)}</strong>
    </header>

    <p class="dialog-profile-copy">${escapeHtml(profileDescriptionForPublic(profile))}</p>

    ${entry.reading?.summary ? `<p class="dialog-profile-copy">${escapeHtml(entry.reading.summary)}</p>` : ""}

    ${today ? `
      <section class="dialog-section dialog-today">
        <span class="tiny-label">Heute beim Speichern</span>
        <h3>${escapeHtml(today.title || "Tagesenergie")}</h3>
        <p class="daily-mantra small-mantra">${escapeHtml(today.mantra || "")}</p>
        <div class="dialog-mini-grid">
          ${dialogMiniCard("Transit", today.transitTheme || entry.transits?.summary || "Aktuelle Aktivierung", today.secondTheme || "")}
          ${dialogMiniCard("Körper", today.bodyCue || "", today.gift || "")}
          ${dialogMiniCard("Prägung", today.conditioning || "", today.wound || "")}
        </div>
        ${Array.isArray(today.prompts) && today.prompts.length ? `<div class="prompt-row">${today.prompts.map((prompt) => `<span>${escapeHtml(prompt)}</span>`).join("")}</div>` : ""}
      </section>
    ` : ""}

    <div class="dialog-stat-grid">
      ${dialogStat("Typ", entry.type || "Human Design", entry.reading?.typeDescription || typePracticeForPublic(entry.type))}
      ${dialogStat("Autorität", entry.authority || "offen", entry.reading?.authorityDescription || authorityPracticeForPublic(entry.authority))}
      ${dialogStat("Strategie", entry.strategy || "offen", entry.reading?.strategyDescription || "Der sauberste erste Schritt für Begegnungen, Entscheidungen und Timing.")}
      ${dialogStat("Signatur", entry.signature || "offen", `Nicht-Selbst: ${entry.notSelf || "offen"}`)}
    </div>

    ${entry.profileLines?.description || entry.profileLines?.personality || entry.profileLines?.design ? `
      <section class="dialog-section">
        <h3>Profil-Linien</h3>
        <div class="dialog-mini-grid">
          ${dialogMiniCard("Profil", `Profil ${profile}`, entry.profileLines?.description || profileDescriptionForPublic(profile))}
          ${dialogMiniCard("Bewusst", entry.profileLines?.personality || "Personality-Linie", formatPublicSource(entry.profileLines?.source?.personalitySun))}
          ${dialogMiniCard("Design", entry.profileLines?.design || "Design-Linie", formatPublicSource(entry.profileLines?.source?.designSun))}
        </div>
      </section>
    ` : ""}

    ${cross.title || cross.gates?.length ? `
      <section class="dialog-section">
        <h3>Inkarnationskreuz</h3>
        <p class="dialog-muted">${escapeHtml(cross.title || "Kreuz-Achsen")}${cross.description ? ` - ${escapeHtml(cross.description)}` : ""}</p>
        ${cross.gates?.length ? `<div class="dialog-gate-list">${cross.gates.map(dialogGate).join("")}</div>` : ""}
      </section>
    ` : ""}

    <section class="dialog-section">
      <h3>Definierte Zentren</h3>
      ${centers.length ? `<div class="dialog-chip-row">${centers.map((center) => `<span>${escapeHtml(center)}</span>`).join("")}</div>` : `<p class="dialog-muted">Keine dauerhaft definierten Zentren in der öffentlichen Kurzansicht.</p>`}
    </section>

    ${openCenters.length ? `
      <section class="dialog-section">
        <h3>Offene Zentren</h3>
        <div class="dialog-chip-row open">${openCenters.map((center) => `<span>${escapeHtml(center)}</span>`).join("")}</div>
      </section>
    ` : ""}

    ${channels.length ? `
      <section class="dialog-section">
        <h3>Kanäle</h3>
        <div class="dialog-channel-list">${channels.map(dialogChannel).join("")}</div>
      </section>
    ` : ""}

    <section class="dialog-section">
      <h3>Tore und Linien</h3>
      ${gates.length ? `<div class="dialog-gate-list">${gates.map(dialogGate).join("")}</div>` : `<p class="dialog-muted">Noch keine Tore in der öffentlichen Kurzansicht.</p>`}
    </section>

    ${transitGates.length ? `
      <section class="dialog-section">
        <h3>Transit-Tore</h3>
        <p class="dialog-muted">${escapeHtml(entry.transits?.summary || "Tagestransite beim Speichern")}</p>
        <div class="dialog-gate-list">${transitGates.map(dialogGate).join("")}</div>
      </section>
    ` : ""}
  `;
}

function dialogStat(label, value, text) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function dialogGate(gate) {
  return `
    <span>
      <strong>Tor ${escapeHtml(gate.gate)}${gate.line ? `.${escapeHtml(gate.line)}` : ""}</strong>
      <em>${escapeHtml([gate.layer, gate.planet, gate.tone || "Aktivierung"].filter(Boolean).join(" - "))}</em>
    </span>
  `;
}

function dialogChannel(channel) {
  return `
    <article>
      <span>${escapeHtml(channel.from || "")} - ${escapeHtml(channel.to || "")}</span>
      <strong>Kanal ${escapeHtml(channel.name || `${channel.gateA}-${channel.gateB}`)}</strong>
      <p>Tore ${escapeHtml(channel.gateA)} und ${escapeHtml(channel.gateB)} bilden diese Verbindung.</p>
    </article>
  `;
}

function dialogMiniCard(label, value, text = "") {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "n/a")}</strong>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
    </article>
  `;
}

function formatPublicSource(source) {
  if (!source) {
    return "Quelle im alten Kurzprofil nicht gespeichert.";
  }

  return `Tor ${source.gate || "?"}.${source.line || "?"}${source.tone ? ` - ${source.tone}` : ""}${source.sign ? ` - ${source.sign}` : ""}`;
}

function createPublicChartPreviewEntry(chart, payload) {
  const hd = chart.humanDesign || {};

  return {
    id: `local-${hash(`${payload.name}|${payload.birthDate}|${payload.birthTime}|${Date.now()}`).toString(16)}`,
    createdAt: new Date().toISOString(),
    firstName: firstNameOnly(payload.name),
    type: chart.type,
    strategy: chart.strategy,
    authority: chart.authority,
    profile: chart.profile,
    signature: chart.signature,
    notSelf: chart.notSelf,
    centers: hd.definedCenters || chart.centers || [],
    openCenters: hd.openCenters || [],
    gates: (hd.gates || chart.gates || []).slice(0, 24).map((gate) => typeof gate === "number" ? { gate } : gate),
    channels: hd.channels || [],
    profileLines: hd.profileLines || {},
    incarnationCross: hd.incarnationCross || {},
    transits: chart.transits || {},
    reading: {
      summary: chart.summary || "",
      typeDescription: hd.typeDescription || "",
      strategyDescription: hd.strategyDescription || "",
      authorityDescription: hd.authorityDescription || "",
      profileDescription: hd.profileLines?.description || ""
    },
    provider: chart.provider || (chart.isMock ? "Preview" : "Swiss Ephemeris"),
    isMock: Boolean(chart.isMock)
  };
}

function readLocalPublicCharts() {
  try {
    return JSON.parse(localStorage.getItem("myhumanos-public-charts") || "[]");
  } catch {
    return [];
  }
}

function rememberLocalPublicChart(entry) {
  const entries = [entry, ...readLocalPublicCharts().filter((item) => item.id !== entry.id)].slice(0, 30);
  localStorage.setItem("myhumanos-public-charts", JSON.stringify(entries));
}

function firstNameOnly(value) {
  const first = String(value || "Anonym").trim().split(/\s+/)[0].replace(/[^\p{L}\p{M}0-9._-]/gu, "");

  return first.slice(0, 24) || "Anonym";
}

function formatPublicDate(value) {
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(value));
  } catch {
    return "heute";
  }
}

function createFallbackChart(payload) {
  const seed = hash(`${payload.birthDate}|${payload.birthTime}|${payload.birthPlace}`);
  const timezone = payload.timezone && payload.timezone !== "auto" ? payload.timezone : "Europe/Berlin";
  const types = ["Generator", "Manifestierender Generator", "Projektor", "Manifestor", "Reflektor"];
  const authorities = ["Sakral", "Emotional", "Milz", "Ego", "Selbst-projiziert"];
  const centers = ["Kopf", "Ajna", "Kehle", "G-Zentrum", "Ego", "Milz", "Sakral", "Solarplexus", "Wurzel"]
    .filter((_, index) => ((seed >> index) & 1) === 1)
    .slice(0, 5);
  const gates = Array.from({ length: 10 }, (_, index) => ((seed + index * 11) % 64) + 1);

  return {
    type: pick(types, seed),
    strategy: "Reagieren",
    authority: pick(authorities, seed >> 2),
    profile: pick(["1/3", "2/4", "3/5", "4/6", "5/1", "6/2"], seed >> 4),
    signature: "Klarheit",
    notSelf: "Widerstand",
    centers,
    gates,
    humanDesign: {
      definedCenters: centers,
      openCenters: centerLayout.map((center) => center.name).filter((center) => !centers.includes(center)),
      gates: gates.map((gate, index) => ({ gate, line: (index % 6) + 1, planet: "Preview", tone: "Aktivierung" }))
    },
    location: {
      city: payload.birthPlace,
      countryCode: "DE",
      latitude: null,
      longitude: null,
      timezone,
      source: "browser-preview"
    },
    time: {
      inputDate: payload.birthDate,
      inputTime: payload.birthTime,
      interpretedAs: timezone,
      utcTime: "",
      timezoneSource: payload.timezone === "auto" ? "fallback" : "manual"
    },
    summary: "Fallback-Preview. Sobald der Worker live erreichbar ist, wird Swiss Ephemeris genutzt.",
    isMock: true
  };
}

function renderReading(chart, payload) {
  const hd = chart.humanDesign || {};
  const gates = hd.gates || chart.gates?.map((gate) => ({ gate, line: 1, planet: "Aktivierung", tone: "Tor" })) || [];
  const definedCenters = hd.definedCenters || chart.centers || [];
  const openCenters = hd.openCenters || centerLayout.map((center) => center.name).filter((center) => !definedCenters.includes(center));
  const points = Array.isArray(chart.points) ? chart.points.slice(0, 12) : [];
  const personalityActivations = Array.isArray(hd.personalityActivations) ? hd.personalityActivations : [];
  const designActivations = Array.isArray(hd.designActivations) ? hd.designActivations : [];
  const channels = Array.isArray(hd.channels) ? hd.channels : [];
  const notes = Array.isArray(hd.calculationNotes) ? hd.calculationNotes : [];
  const profileLines = hd.profileLines || {};
  const profileSource = profileLines.source || {};
  const incarnationCross = hd.incarnationCross || {};
  const transits = chart.transits || {};
  const location = chart.location || {};
  const coordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : "wird vom API-Provider bestimmt";
  const time = chart.time || {};
  const utcTime = time.utcTime ? formatUtcTime(time.utcTime) : "wird vom API-Provider bestimmt";
  const locationSource = locationSourceLabel(location.source, time.timezoneSource);
  latestChartArchive = createChartArchive(chart, payload);

  panel.innerHTML = `
    <div class="reading-header">
      <span class="tiny-label">${chart.isMock ? "Preview" : escapeHtml(chart.provider || "Swiss Ephemeris")}</span>
      <h2>${escapeHtml(chart.type || "Human Design Preview")}</h2>
      <p>${escapeHtml(payload.name || "Dein Chart")} - ${escapeHtml(payload.birthPlace)} - ${escapeHtml(payload.birthDate)} - ${escapeHtml(payload.birthTime)}</p>
    </div>

    <div class="reading-actions">
      <button class="archive-action" type="button" data-save-chart-json>Chart in Ordner speichern</button>
      <span>Speichert den vollständigen JSON-Snapshot lokal auf deinem Gerät.</span>
    </div>

    <div class="core-grid">
      ${coreCard("Strategie", chart.strategy, "Der Eingang, durch den deine Energie weicher ins Leben tritt.")}
      ${coreCard("Autorität", chart.authority, "Der Ort, an dem Entscheidung im Körper klarer wird.")}
      ${coreCard("Profil", chart.profile, "Deine Lernspur zwischen Rolle, Gabe und Begegnung.")}
      ${coreCard("Selbst", chart.signature, "So fühlt es sich an, wenn du weniger gegen dich arbeitest.")}
      ${coreCard("Nicht-Selbst", chart.notSelf, "Das Signal, dass du vielleicht fremde Erwartungen trägst.")}
      ${coreCard("Definition", channels.length ? `${channels.length} Kanal(e)` : "keine kompletten Kanäle", "Komplette Kanäle definieren Zentren, Typ und Autorität.")}
      ${coreCard("Zeitzone", location.timezone || chart.time?.interpretedAs || "Europe/Berlin", "Geburtszeit wird lokal interpretiert.")}
      ${coreCard("UTC", utcTime, "Umrechnung für die Ephemeris-Zeit.")}
      ${coreCard("Koordinaten", coordinates, location.city ? `${location.city}, ${location.countryCode}` : "Geburtsort")}
      ${coreCard("Ort-Quelle", locationSource, "So wurde der Geburtsort aufgelöst.")}
      ${coreCard("Status", chart.isMock ? "Fallback" : "Live", chart.isMock ? "Ohne API berechnet." : "Mit Swiss Ephemeris berechnet.")}
    </div>

    <div class="insight-strip">
      <div>
        <span>Heute wichtig</span>
        <strong>${escapeHtml(transits.today?.transitTheme || dailyFocus(gates))}</strong>
      </div>
      <div>
        <span>Praxis</span>
        <strong>${escapeHtml(transits.today?.mantra || practiceForType(chart.type))}</strong>
      </div>
    </div>

    ${todayTransitSection(transits, chart, openCenters)}

    ${readingCompassSection(chart, hd, definedCenters, openCenters)}

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Profil & Kreuz</span>
        <h3>Die Hauptachsen deines Charts</h3>
      </div>
      <div class="detail-grid">
        ${detailCard("Typ", chart.type, hd.typeDescription || "Typ wird aus Zentren und Kanälen abgeleitet.")}
        ${detailCard("Strategie", chart.strategy, hd.strategyDescription || "Strategie ist dein erster praktischer Einstieg.")}
        ${detailCard("Autorität", chart.authority, hd.authorityDescription || "Autorität zeigt, wie Entscheidung klarer wird.")}
        ${detailCard(`Profil ${chart.profile || "n/a"}`, profileLines.description || "Profil wird aus Personality-Sonne und Design-Sonne gelesen.")}
        ${detailCard("Personality-Linie", profileLines.personality || "n/a", "Bewusste Rolle: die erste Zahl im Profil.")}
        ${detailCard("Design-Linie", profileLines.design || "n/a", "Unbewusste Prägung: die zweite Zahl im Profil.")}
        ${detailCard("Profil-Quelle bewusst", formatProfileSource(profileSource.personalitySun), "Personality Sun: erste Profilzahl.")}
        ${detailCard("Profil-Quelle Design", formatProfileSource(profileSource.designSun), "Design Sun: zweite Profilzahl, 88 Grad Sonnenbogen.")}
        ${detailCard("Inkarnationskreuz", incarnationCross.title || "noch unvollständig", incarnationCross.description || "Sun/Earth-Achsen werden angezeigt, sobald die Daten vorliegen.")}
      </div>
      ${incarnationCross.gates?.length ? `<div class="gate-grid compact-grid">${incarnationCross.gates.map(crossGateCard).join("")}</div>` : ""}
    </section>

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Zentren</span>
        <h3>Definiert und offen</h3>
      </div>
      <div class="center-columns">
        <div><strong>Definiert</strong><ul class="tag-list">${definedCenters.map(tag).join("") || "<li>Keine feste Definition</li>"}</ul></div>
        <div><strong>Offen</strong><ul class="tag-list open">${openCenters.map(tag).join("") || "<li>Alles definiert</li>"}</ul></div>
      </div>
    </section>

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Kanäle</span>
        <h3>Komplette Verbindungen</h3>
      </div>
      ${channels.length ? `<div class="channel-grid">${channels.map(channelCard).join("")}</div>` : `<p class="summary">Keine vollständigen Kanäle erkannt. In diesem Fall bleiben Zentren offen oder die API-Daten sind unvollständig.</p>`}
    </section>

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Bewusst</span>
        <h3>Personality: schwarze Aktivierungen</h3>
      </div>
      <ul class="activation-list">${personalityActivations.length ? personalityActivations.map(activationRow).join("") : gates.slice(0, 14).map(gateActivationFallback).join("")}</ul>
    </section>

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Unbewusst</span>
        <h3>Design: rote Aktivierungen</h3>
      </div>
      <ul class="activation-list design-list">${designActivations.length ? designActivations.map(activationRow).join("") : "<li><strong>Design-Daten fehlen</strong><span>Ohne Design-Sonne ist die zweite Profilzahl unvollständig.</span></li>"}</ul>
    </section>

    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Alle Tore</span>
        <h3>Gate- und Linienübersicht</h3>
      </div>
      <div class="gate-grid">${gates.slice(0, 18).map(gateCard).join("")}</div>
    </section>

    ${transitDetailsSection(transits)}

    ${points.length ? `
      <section class="reading-section">
        <div class="section-heading">
          <span class="tiny-label">Ephemeris</span>
          <h3>Planetenpositionen</h3>
        </div>
        <ul class="point-list">${points.map(pointRow).join("")}</ul>
      </section>
    ` : ""}

    ${notes.length ? `
      <section class="reading-section">
        <div class="section-heading">
          <span class="tiny-label">Berechnung</span>
          <h3>Was dieses Chart verwendet</h3>
        </div>
        <ul class="note-list">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </section>
    ` : ""}

    <p class="summary">${escapeHtml(chart.summary || "")}</p>
  `;
}

function todayTransitSection(transits, chart, openCenters) {
  const today = transits.today;

  if (!today) {
    return `
      <section class="reading-section today-section">
        <div class="section-heading">
          <span class="tiny-label">Heute</span>
          <h3>${escapeHtml(todayFallbackTitle(chart.type))}</h3>
        </div>
        <p class="daily-mantra">${escapeHtml(todayFallbackMantra(chart.type, chart.profile))}</p>
        <div class="today-grid">
          ${todayCard("Selbst", chart.signature || "offen", "Das ist dein weicheres Feedbacksignal, wenn du weniger gegen deine Mechanik arbeitest.")}
          ${todayCard("Nicht-Selbst", chart.notSelf || "offen", "Wenn dieses Gefühl auftaucht, ist es ein Hinweis auf Konditionierung, nicht auf persönliches Versagen.")}
          ${todayCard("Prägung", fallbackWound(chart.type, chart.profile, openCenters), "Beobachten reicht. Es muss heute nicht sofort gelöst werden.")}
        </div>
      </section>
    `;
  }

  return `
    <section class="reading-section today-section">
      <div class="section-heading">
        <span class="tiny-label">Heute</span>
        <h3>${escapeHtml(today.title || "Tagesenergie")}</h3>
      </div>
      <p class="daily-mantra">${escapeHtml(today.mantra || "Heute reicht ein ehrlicher nächster Schritt.")}</p>
      <div class="today-grid">
        ${todayCard("Transit", today.transitTheme || transits.summary || "Aktuelle Tagesaktivierung", today.secondTheme || "Ein einzelner Tagesimpuls kann reichen, um etwas sichtbar zu machen.")}
        ${todayCard("Körper", today.bodyCue || "Verlangsame, bis dein System ehrlicher wird.", today.gift || "")}
        ${todayCard("Konditionierung", today.conditioning || "Offene Zentren zeigen, wo fremde Energie lauter wird.", today.wound || "")}
        ${todayCard("Kanäle", today.channelTheme || "Heute wirkt vor allem über einzelne Tore.", transits.summary || "")}
      </div>
      ${Array.isArray(today.prompts) && today.prompts.length ? `<div class="prompt-row">${today.prompts.slice(0, 3).map((prompt) => `<span>${escapeHtml(prompt)}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

function transitDetailsSection(transits) {
  if (!transits.enabled) {
    return "";
  }

  return `
    <section class="reading-section">
      <div class="section-heading">
        <span class="tiny-label">Transit-Details</span>
        <h3>Aktuelle Aktivierungen</h3>
      </div>
      <p class="summary">${escapeHtml(transits.summary || "")}</p>
      <div class="gate-grid compact-grid">${(transits.gates || []).slice(0, 8).map(gateCard).join("")}</div>
    </section>
  `;
}

function todayCard(label, value, detail = "") {
  return `
    <article class="today-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "n/a")}</strong>
      ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
    </article>
  `;
}

function todayFallbackTitle(type) {
  return {
    Generator: "Heute über Resonanz gehen",
    "Manifestierender Generator": "Heute reagieren, dann bewegen",
    Projektor: "Heute Anerkennung statt Druck suchen",
    Manifestor: "Heute den Impuls klar machen",
    Reflektor: "Heute das Feld lesen"
  }[type] || "Heute dein Feld beobachten";
}

function todayFallbackMantra(type, profile) {
  const base = {
    Generator: "Nicht alles, was möglich ist, ist ein Ja.",
    "Manifestierender Generator": "Ein Kurswechsel kann ein Zeichen von Wahrheit sein.",
    Projektor: "Du musst nicht lauter werden, um gesehen zu werden.",
    Manifestor: "Dein Impuls darf Raum nehmen, wenn du das Feld informierst.",
    Reflektor: "Was heute durch dich geht, muss nicht für immer du sein."
  }[type] || "Heute reicht ein ehrlicher nächster Schritt.";

  return profile === "5/2" ? `${base} Nicht jede Projektion ist ein Ruf.` : base;
}

function fallbackWound(type, profile, openCenters) {
  if (type === "Reflektor") {
    return "Du musst nicht die Stimmung des Raumes reparieren.";
  }

  if (profile === "5/2") {
    return "Nicht jede Erwartung von außen ist deine Aufgabe.";
  }

  if (openCenters.includes("Ego")) {
    return "Du musst deinen Wert heute nicht beweisen.";
  }

  return "Achte darauf, wo du dich anstrengst, jemand anderes zu sein.";
}

function readingCompassSection(chart, hd, definedCenters, openCenters) {
  const typeGuide = typeGuideFor(chart.type);
  const authorityGuide = authorityGuideFor(chart.authority);
  const profileGuide = profileGuideFor(chart.profile);
  const centerGuide = centerGuideFor(definedCenters, openCenters);
  const order = readingOrderFor(chart.type, chart.authority, chart.profile);

  return `
    <section class="reading-section compass-section">
      <div class="section-heading">
        <span class="tiny-label">Reading-Kompass</span>
        <h3>So liest du dein Ergebnis</h3>
      </div>
      <div class="guidance-grid">
        ${guidanceCard(typeGuide.label, typeGuide.title, typeGuide.text, typeGuide.steps)}
        ${guidanceCard(authorityGuide.label, authorityGuide.title, authorityGuide.text, authorityGuide.steps)}
        ${guidanceCard(profileGuide.label, profileGuide.title, profileGuide.text, profileGuide.steps)}
        ${guidanceCard(centerGuide.label, centerGuide.title, centerGuide.text, centerGuide.steps)}
      </div>
      <div class="reading-order">
        <span>Reihenfolge</span>
        <ol>${order.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>
      ${hd.calculationNotes?.length ? `<p class="summary compact-summary">Mechanik zuerst, Deutung danach: Diese Ausgabe trennt dauerhaftes Chart, Design-Ebene und spätere Transite bewusst voneinander.</p>` : ""}
    </section>
  `;
}

function guidanceCard(label, title, text, steps) {
  return `
    <article class="guidance-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
      <ul>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </article>
  `;
}

function typeGuideFor(type) {
  const guides = {
    Generator: {
      label: "Typ",
      title: "Generator: Resonanz vor Aktion",
      text: "Dein Körper erkennt Energie über Antwort. Der wichtigste Shift ist, weniger zu initiieren und mehr auf echte Reize zu reagieren.",
      steps: ["Achte auf Ja/Nein im Körper.", "Folge Zufriedenheit statt Druck.", "Beende Dinge, wenn die Energie klar weg ist."]
    },
    "Manifestierender Generator": {
      label: "Typ",
      title: "Manifestierender Generator: Reaktion mit Tempo",
      text: "Du bist gebaut für Antwort, Bewegung und Korrektur. Nicht jeder Umweg ist falsch; oft zeigt er dir erst, was wirklich stimmt.",
      steps: ["Reagiere zuerst.", "Informiere, wenn andere betroffen sind.", "Erlaube Kurswechsel ohne Schuldgefühl."]
    },
    Projektor: {
      label: "Typ",
      title: "Projektor: erkannt werden",
      text: "Deine Stärke liegt in Wahrnehmung, Führung und Timing. Große Schritte werden sauberer, wenn Anerkennung und Einladung vorhanden sind.",
      steps: ["Prüfe, ob du wirklich gesehen wirst.", "Warte bei großen Lebensfeldern auf Einladung.", "Schütze deine Energie vor Dauerleistung."]
    },
    Manifestor: {
      label: "Typ",
      title: "Manifestor: Impuls mit Raum",
      text: "Deine Energie kann Dinge anstoßen. Informieren nimmt Widerstand aus dem Feld und lässt deinen Impuls klarer landen.",
      steps: ["Spüre den echten inneren Impuls.", "Informiere vor dem Schritt.", "Plane Pausen nach Initiation ein."]
    },
    Reflektor: {
      label: "Typ",
      title: "Reflektor: Spiegel des Feldes",
      text: "Ohne dauerhaft definierte Zentren bist du besonders sensibel für Orte, Menschen und Timing. Klarheit entsteht über Zeit, nicht durch Sofortdruck.",
      steps: ["Nimm wichtige Entscheidungen aus dem Momentdruck.", "Beobachte, wie verschiedene Umgebungen dich verändern.", "Nutze den Mondzyklus als natürlichen Prüfrahmen."]
    }
  };

  return guides[type] || {
    label: "Typ",
    title: type || "Typ offen",
    text: "Der Typ wird aus Zentren und Kanälen abgeleitet.",
    steps: ["Prüfe zuerst Strategie.", "Dann Autorität.", "Dann Details."]
  };
}

function authorityGuideFor(authority) {
  const guides = {
    Emotional: {
      label: "Autorität",
      title: "Emotionale Klarheit braucht Welle",
      text: "Ein echtes Ja entsteht nicht im Peak und nicht im Tief. Es wird über Zeit ruhiger und eindeutiger.",
      steps: ["Schlafe über wichtige Entscheidungen.", "Sprich erst, wenn die Welle abgeklungen ist.", "Vertraue nicht dem ersten Hochgefühl."]
    },
    Sakral: {
      label: "Autorität",
      title: "Sakral antwortet körperlich",
      text: "Klarheit kommt als unmittelbare Körperantwort. Fragen mit Ja/Nein-Struktur helfen mehr als mentale Pro-und-Contra-Listen.",
      steps: ["Stelle konkrete Fragen.", "Achte auf Öffnung oder Rückzug.", "Reagiere auf das, was real vor dir steht."]
    },
    Milz: {
      label: "Autorität",
      title: "Milz ist leise und sofort",
      text: "Die Milz spricht kurz, instinktiv und im Jetzt. Wenn der Moment vorbei ist, wiederholt sie sich oft nicht laut.",
      steps: ["Achte auf den ersten feinen Impuls.", "Mach ihn nicht mental lauter.", "Prüfe Sicherheit im Körper."]
    },
    Ego: {
      label: "Autorität",
      title: "Ego prüft Wille und Versprechen",
      text: "Hier geht es um echte Verpflichtung. Nicht jede gute Idee verdient ein Versprechen.",
      steps: ["Frage: Will ich das wirklich?", "Versprich weniger, aber klarer.", "Achte auf stimmige Gegenleistung."]
    },
    "Selbst-projiziert": {
      label: "Autorität",
      title: "Klarheit beim Sprechen",
      text: "Richtung wird hörbar, wenn du aus dir heraus sprichst. Es geht nicht um Rat, sondern um Resonanz mit deiner eigenen Stimme.",
      steps: ["Sprich laut in sichere Räume.", "Höre auf deine Wortwahl.", "Folge Richtung, nicht Beweis."]
    },
    "Mental / Umgebung": {
      label: "Autorität",
      title: "Umgebung macht Klarheit",
      text: "Die richtige Umgebung und das Aussprechen vor passenden Menschen sind hier wichtiger als eine innere Körperautorität.",
      steps: ["Wechsle bewusst Räume.", "Sprich Dinge laut aus.", "Entscheide nicht aus mentalem Druck."]
    },
    Lunar: {
      label: "Autorität",
      title: "Lunar: Klarheit über Zeit",
      text: "Bei Reflektoren ist der Mondzyklus kein Extra, sondern Teil der Mechanik. Entscheidungen reifen, während das Feld sich zeigt.",
      steps: ["Gib großen Entscheidungen mehrere Wochen.", "Notiere, was an unterschiedlichen Tagen gleich bleibt.", "Vertraue Überraschung mehr als Hast."]
    }
  };

  return guides[authority] || {
    label: "Autorität",
    title: authority || "Autorität offen",
    text: "Autorität zeigt, wo Entscheidung verlässlicher wird als im Kopf.",
    steps: ["Verlangsame wichtige Entscheidungen.", "Beobachte Körper und Umfeld.", "Trenne Wunsch von Klarheit."]
  };
}

function profileGuideFor(profile) {
  const guides = {
    "1/3": ["Forscher / Experimentierer", "Sicherheit entsteht durch Verstehen und gelebte Tests.", ["Baue Fundament.", "Erlaube Versuch und Irrtum.", "Teile nur, was praktisch geprüft ist."]],
    "1/4": ["Forscher / Opportunist", "Tiefe Grundlage trifft Wirkung über vertraute Beziehungen.", ["Recherchiere gründlich.", "Pflege dein Netzwerk.", "Lass Vertrauen die Tür öffnen."]],
    "2/4": ["Eremit / Opportunist", "Talent zeigt sich im Rückzug und wird durch dein Feld gerufen.", ["Schütze Alleinzeit.", "Achte auf echte Rufe.", "Bleib mit vertrauten Menschen verbunden."]],
    "2/5": ["Eremit / Ketzer", "Natürliche Gabe trifft starke Projektionen von außen.", ["Zieh dich regelmäßig zurück.", "Prüfe Erwartungen anderer.", "Löse nur, was wirklich deins ist."]],
    "3/5": ["Experimentierer / Ketzer", "Erfahrung wird zu praktischer Lösungskraft.", ["Lerne durch Reibung.", "Nimm Fehler als Daten.", "Versprich keine Wunder."]],
    "3/6": ["Experimentierer / Vorbild", "Weisheit entsteht aus gelebter Erfahrung und späterer Reifung.", ["Erlaube Umwege.", "Zieh Bilanz aus Erfahrung.", "Werde nicht zu früh endgültig."]],
    "4/1": ["Opportunist / Forscher", "Ein seltener fixer Weg: Beziehungseinfluss mit innerem Fundament.", ["Bleib deiner Grundlage treu.", "Wirke über Netzwerke.", "Verbiege dich nicht für Zugehörigkeit."]],
    "4/6": ["Opportunist / Vorbild", "Beziehung, Vertrauen und Reifung bilden deine Rolle.", ["Wähle dein Umfeld bewusst.", "Lass Reife Zeit haben.", "Führe durch gelebtes Beispiel."]],
    "5/1": ["Ketzer / Forscher", "Praktische Lösungskraft braucht ein solides Fundament.", ["Kläre Erwartungen.", "Baue Belege.", "Wähle Projektionen bewusst aus."]],
    "5/2": ["Ketzer / Eremit", "Du wirst auf Lösungen projiziert, brauchst aber Rückzug, um natürlich zu bleiben.", ["Schütze deinen Raum.", "Sag nicht zu jeder Projektion ja.", "Lass deine Gabe gerufen werden."]],
    "6/2": ["Vorbild / Eremit", "Reife Weisheit und natürliches Talent wachsen über Zeit.", ["Erwarte nicht zu früh Fertigkeit.", "Pflege Rückzug.", "Teile aus gelebter Reife."]],
    "6/3": ["Vorbild / Experimentierer", "Erfahrung, Brüche und Reifung werden zu gelebter Orientierung.", ["Lerne durch Realität.", "Halte Übergänge aus.", "Lass dein Beispiel organisch entstehen."]]
  };
  const [title, text, steps] = guides[profile] || ["Profil", "Das Profil verbindet bewusste Rolle und unbewusste Körperprägung.", ["Lies zuerst die erste Linie.", "Dann die zweite Linie.", "Dann die Spannung zwischen beiden."]];

  return {
    label: "Profil",
    title,
    text,
    steps
  };
}

function centerGuideFor(definedCenters, openCenters) {
  if (!definedCenters.length) {
    return {
      label: "Zentren",
      title: "Alle Zentren offen",
      text: "Das ist die klassische Reflektor-Signatur: Du nimmst Felder stark auf und spiegelst, was dort wirklich wirkt.",
      steps: ["Wähle Räume wie Nahrung.", "Verwechsle aufgenommenen Druck nicht mit Identität.", "Beobachte, wer du an verschiedenen Orten wirst."]
    };
  }

  const firstOpen = openCenters.slice(0, 3).join(", ") || "wenige offene Zentren";

  return {
    label: "Zentren",
    title: `${definedCenters.length} definiert, ${openCenters.length} offen`,
    text: `Definierte Zentren zeigen Konstanz. Offene Zentren wie ${firstOpen} zeigen Lernfelder, Konditionierung und mögliche Weisheit.`,
    steps: ["Vertraue definierter Konstanz.", "Beobachte offene Zentren ohne Scham.", "Prüfe Druck immer über Strategie und Autorität."]
  };
}

function readingOrderFor(type, authority, profile) {
  if (type === "Reflektor") {
    return [
      "Typ zuerst: Du bist ein Spiegel des Feldes, keine dauerhaft festgelegte Energie.",
      `Autorität danach: ${authority || "Lunar"} bedeutet Zeit, Umgebung und Mondzyklus statt Sofortentscheidung.`,
      `Profil lesen: ${profile || "dein Profil"} zeigt, wie du gesehen wirst und wie dein Rückzug funktioniert.`,
      "Dann Tore und Linien: Sie zeigen konkrete Themen, aber definieren dich nicht wie feste Zentren."
    ];
  }

  return [
    "Typ zuerst: Er erklärt, wie deine Aura und Energie grundsätzlich funktionieren.",
    `Autorität danach: ${authority || "deine Autorität"} entscheidet, nicht der Kopf.`,
    `Profil lesen: ${profile || "dein Profil"} beschreibt Rolle, Lernspur und Begegnung.`,
    "Dann Zentren, Kanäle, Tore und Linien als Vertiefung."
  ];
}

function createChartArchive(chart, payload) {
  return {
    savedAt: new Date().toISOString(),
    format: "myhumanos-chart-json-v1",
    payload: {
      name: payload.name || "",
      birthDate: payload.birthDate || "",
      birthTime: payload.birthTime || "",
      birthPlace: payload.birthPlace || "",
      timezone: payload.timezone || "auto"
    },
    chart
  };
}

async function saveLatestChartArchive(button) {
  if (!latestChartArchive) {
    return;
  }

  const originalText = button.textContent;
  const fileName = chartArchiveFileName(latestChartArchive);
  const body = `${JSON.stringify(latestChartArchive, null, 2)}\n`;
  button.disabled = true;
  button.textContent = "Speichere...";

  try {
    if ("showDirectoryPicker" in window) {
      const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([body], { type: "application/json;charset=utf-8" }));
      await writable.close();
    } else if ("showSaveFilePicker" in window) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "MyHumanOS Chart JSON",
            accept: { "application/json": [".json"] }
          }
        ]
      });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([body], { type: "application/json;charset=utf-8" }));
      await writable.close();
    } else {
      downloadChartArchive(fileName, body);
    }

    button.textContent = "Gespeichert";
  } catch (error) {
    if (error?.name !== "AbortError") {
      button.textContent = "Nicht gespeichert";
    } else {
      button.textContent = originalText;
    }
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1800);
  }
}

function downloadChartArchive(fileName, body) {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function chartArchiveFileName(archive) {
  const date = safeFilePart(archive.payload.birthDate || new Date().toISOString().slice(0, 10));
  const name = safeFilePart(archive.payload.name || "chart");
  const type = safeFilePart(archive.chart.type || "human-design");
  const profile = safeFilePart(archive.chart.profile || "profil");

  return `${date}-${name}-${type}-${profile}.json`;
}

function safeFilePart(value) {
  return String(value || "chart")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "chart";
}

function coreCard(label, value, detail) {
  return `<article class="core-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "n/a")}</strong><p>${escapeHtml(detail)}</p></article>`;
}

function detailCard(label, value, detail = "") {
  return `<article class="detail-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "n/a")}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</article>`;
}

function formatProfileSource(source) {
  if (!source) {
    return "n/a";
  }

  const longitude = Number.isFinite(source.longitude) ? `${source.longitude.toFixed(4)} deg` : "";
  const gate = source.gate ? `Tor ${source.gate}.${source.line || "?"}` : "Tor n/a";

  return [gate, source.sign, longitude].filter(Boolean).join(" - ");
}

function formatUtcTime(value) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function locationSourceLabel(source, timezoneSource) {
  if (source === "geocoding") return timezoneSource === "manual" ? "Geocoding + manuelle Zeitbasis" : "Geocoding";
  if (source === "coordinates") return timezoneSource === "manual" ? "Koordinaten + manuelle Zeitbasis" : "Koordinaten";
  if (source === "browser-preview") return "Browser Preview";
  return "Fallback Deutschland";
}

function gateCard(item) {
  return `
    <article class="gate-card">
      <span>${escapeHtml(item.layer || item.planet || "Aktivierung")}</span>
      <strong>Tor ${escapeHtml(item.gate)}.${escapeHtml(item.line || 1)}</strong>
      <p>${escapeHtml(item.planet ? `${item.planet} - ${item.tone || "Aktivierung"}` : item.tone || "Aktivierung")}</p>
    </article>
  `;
}

function crossGateCard(item) {
  return `
    <article class="gate-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>Tor ${escapeHtml(item.gate)}.${escapeHtml(item.line || 1)}</strong>
      <p>${escapeHtml(item.tone || "Aktivierung")}</p>
    </article>
  `;
}

function activationRow(item) {
  return `
    <li>
      <strong>${escapeHtml(item.planet || "Aktivierung")}</strong>
      <span>Tor ${escapeHtml(item.gate)}.${escapeHtml(item.line || 1)} - ${escapeHtml(item.tone || "Aktivierung")} - ${escapeHtml(formatActivationPosition(item))}</span>
    </li>
  `;
}

function gateActivationFallback(item) {
  return `<li><strong>Tor ${escapeHtml(item.gate)}</strong><span>Linie ${escapeHtml(item.line || 1)} - ${escapeHtml(item.tone || "Aktivierung")}</span></li>`;
}

function channelCard(channel) {
  return `
    <article class="channel-card">
      <span>${escapeHtml(channel.from)} - ${escapeHtml(channel.to)}</span>
      <strong>Kanal ${escapeHtml(channel.name || `${channel.gateA}-${channel.gateB}`)}</strong>
      <p>Tore ${escapeHtml(channel.gateA)} und ${escapeHtml(channel.gateB)} definieren diese Verbindung.</p>
    </article>
  `;
}

function pointRow(point) {
  return `<li><strong>${escapeHtml(point.name)}</strong><span>${escapeHtml(formatPoint(point))}</span></li>`;
}

function tag(value) {
  return `<li>${escapeHtml(value)}</li>`;
}

function loadingTemplate() {
  return `
    <div class="empty-state">
      <span class="tiny-label">Swiss Ephemeris</span>
      <h2>Dein Chart wird berechnet.</h2>
      <p>MyHumanOS ruft die geschützte Worker-API auf und übersetzt die Positionen in Human-Design-Gates.</p>
    </div>
  `;
}

function drawChart(chart) {
  const hd = chart.humanDesign || {};
  const definedCenters = normalizeCenters(hd.definedCenters || chart.centers || []);
  const gates = normalizeGates(hd.gates || chart.gates || []);
  const channels = normalizeChannels(hd.channels || []);
  const activeGateMap = createActiveGateMap(gates);

  context.clearRect(0, 0, canvas.width, canvas.height);
  const background = context.createRadialGradient(450, 390, 40, 450, 450, 500);
  background.addColorStop(0, "#352056");
  background.addColorStop(0.52, "#170d24");
  background.addColorStop(1, "#090510");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawChartAtmosphere();
  drawHumanSilhouette();
  drawChannels(channels, activeGateMap);
  drawCenters(definedCenters, activeGateMap);
  drawGateWheel(gates);
  drawChartLabel(chart);
}

function normalizeCenters(centers) {
  const knownCenters = new Set(centerLayout.map((center) => center.name));
  return Array.isArray(centers)
    ? centers.map((center) => String(center)).filter((center) => knownCenters.has(center))
    : [];
}

function normalizeGates(gates) {
  if (!Array.isArray(gates)) {
    return [];
  }

  return gates.map((item) => {
    if (typeof item === "number") {
      return { gate: item, line: null, layer: "", planet: "", tone: "" };
    }

    return {
      ...item,
      gate: Number(item.gate),
      line: Number.isFinite(Number(item.line)) ? Number(item.line) : null
    };
  }).filter((item) => Number.isFinite(item.gate));
}

function normalizeChannels(channels) {
  if (!Array.isArray(channels)) {
    return [];
  }

  return channels.map((channel) => ({
    ...channel,
    gateA: Number(channel.gateA),
    gateB: Number(channel.gateB),
    from: channel.from,
    to: channel.to,
    name: channel.name || `${channel.gateA}-${channel.gateB}`
  })).filter((channel) => Number.isFinite(channel.gateA) && Number.isFinite(channel.gateB));
}

function createActiveGateMap(gates) {
  return gates.reduce((map, gate) => {
    if (!map.has(gate.gate)) {
      map.set(gate.gate, gate);
    }

    return map;
  }, new Map());
}

function drawChartAtmosphere() {
  context.save();
  context.strokeStyle = "rgba(232, 213, 255, 0.08)";
  context.lineWidth = 1;

  for (let ring = 0; ring < 9; ring += 1) {
    context.beginPath();
    context.arc(450, 450, 120 + ring * 38, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}

function drawHumanSilhouette() {
  context.save();
  const glow = context.createRadialGradient(450, 320, 20, 450, 430, 260);
  glow.addColorStop(0, "rgba(201, 167, 255, 0.24)");
  glow.addColorStop(1, "rgba(143, 92, 255, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.ellipse(450, 440, 166, 294, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(232, 213, 255, 0.055)";
  context.strokeStyle = "rgba(232, 213, 255, 0.12)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(450, 98);
  context.bezierCurveTo(498, 124, 496, 192, 468, 238);
  context.bezierCurveTo(526, 282, 574, 382, 586, 528);
  context.bezierCurveTo(546, 586, 514, 656, 486, 782);
  context.lineTo(414, 782);
  context.bezierCurveTo(386, 656, 354, 586, 314, 528);
  context.bezierCurveTo(326, 382, 374, 282, 432, 238);
  context.bezierCurveTo(404, 192, 402, 124, 450, 98);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawGateWheel(gates) {
  const cx = 450;
  const cy = 450;
  const radius = 396;
  const activeGateMap = createActiveGateMap(gates);

  context.save();
  context.strokeStyle = "rgba(232, 213, 255, 0.2)";
  context.lineWidth = 1.5;

  for (let ring = 0; ring < 4; ring += 1) {
    context.beginPath();
    context.arc(cx, cy, radius - ring * 32, 0, Math.PI * 2);
    context.stroke();
  }

  for (let index = 0; index < 64; index += 1) {
    const angle = (Math.PI * 2 * index) / 64 - Math.PI / 2;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * (radius - 25), cy + Math.sin(angle) * (radius - 25));
    context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    context.stroke();

    if (index % 4 === 0) {
      context.fillStyle = "rgba(232, 213, 255, 0.42)";
      context.font = "700 10px Inter, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1), cx + Math.cos(angle) * (radius - 12), cy + Math.sin(angle) * (radius - 12));
    }
  }

  gates.slice(0, 24).forEach((item, index) => {
    const angle = (Math.PI * 2 * ((item.gate || 1) % 64)) / 64 - Math.PI / 2;
    const color = item.layer === "Design" ? colors.violet : [colors.gold, colors.teal, colors.coral, colors.blue][index % 4];
    const x = cx + Math.cos(angle) * (radius - 54);
    const y = cy + Math.sin(angle) * (radius - 54);

    context.beginPath();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = activeGateMap.has(item.gate) ? 14 : 0;
    context.arc(x, y, 18, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;

    context.fillStyle = "#160d20";
    context.font = "900 13px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(item.gate), x, y);
  });

  context.restore();
}

function drawChannels(channels, activeGateMap) {
  const activeChannelKeys = new Set(channels.flatMap((channel) => [
    `${channel.gateA}-${channel.gateB}`,
    `${channel.gateB}-${channel.gateA}`,
    channel.name
  ]));

  channelDefinitions.forEach((channel, index) => {
    const start = centerLayout.find((center) => center.name === channel.from);
    const end = centerLayout.find((center) => center.name === channel.to);
    if (!start || !end) return;
    const activeA = activeGateMap.has(channel.gateA);
    const activeB = activeGateMap.has(channel.gateB);
    const active = activeChannelKeys.has(channel.name) || (activeA && activeB);
    const offset = ((index % 5) - 2) * 2.6;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = (-dy / length) * offset;
    const normalY = (dx / length) * offset;
    const sx = start.x + normalX;
    const sy = start.y + normalY;
    const ex = end.x + normalX;
    const ey = end.y + normalY;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    context.save();
    context.lineCap = "round";
    context.beginPath();
    context.strokeStyle = "rgba(232, 213, 255, 0.12)";
    context.lineWidth = 5;
    context.moveTo(sx, sy);
    context.lineTo(ex, ey);
    context.stroke();

    if (active) {
      const gradient = context.createLinearGradient(sx, sy, ex, ey);
      gradient.addColorStop(0, colors.gold);
      gradient.addColorStop(0.55, "#f3dca0");
      gradient.addColorStop(1, colors.violet);
      context.beginPath();
      context.strokeStyle = gradient;
      context.lineWidth = 8;
      context.shadowColor = "rgba(223, 184, 109, 0.72)";
      context.shadowBlur = 14;
      context.moveTo(sx, sy);
      context.lineTo(ex, ey);
      context.stroke();
    } else {
      if (activeA) drawHalfChannel(sx, sy, mx, my, colors.gold);
      if (activeB) drawHalfChannel(ex, ey, mx, my, colors.violet);
    }

    context.restore();
  });
}

function drawHalfChannel(startX, startY, endX, endY, color) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 6;
  context.shadowColor = color;
  context.shadowBlur = 10;
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
}

function drawCenters(definedCenters, activeGateMap) {
  centerLayout.forEach((center) => {
    const active = definedCenters.includes(center.name);
    const fill = active ? centerFillColors[center.name] || colors.violet : "rgba(246, 239, 255, 0.12)";

    context.save();
    context.beginPath();
    drawCenterShape(center);
    context.fillStyle = fill;
    context.strokeStyle = active ? "rgba(255, 241, 191, 0.96)" : "rgba(232, 213, 255, 0.32)";
    context.lineWidth = active ? 3.5 : 2;
    context.shadowColor = active ? "rgba(223, 184, 109, 0.3)" : "transparent";
    context.shadowBlur = active ? 18 : 0;
    context.fill();
    context.stroke();
    context.restore();

    context.fillStyle = active && ["Kopf", "Ajna", "G-Zentrum", "Wurzel"].includes(center.name) ? "#160d20" : colors.ink;
    context.font = "900 13px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(center.name, center.x, center.y - 7);

    drawCenterGateLabels(center, activeGateMap, active);
  });
}

function drawCenterGateLabels(center, activeGateMap, centerDefined) {
  const activeGates = (centerGateMap[center.name] || []).filter((gate) => activeGateMap.has(gate)).slice(0, 8);
  if (!activeGates.length) {
    return;
  }

  const columns = activeGates.length > 4 ? 4 : activeGates.length;
  const chipWidth = 28;
  const chipHeight = 18;
  const startX = center.x - ((columns - 1) * (chipWidth + 4)) / 2;

  activeGates.forEach((gate, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const x = startX + col * (chipWidth + 4) - chipWidth / 2;
    const y = center.y + 10 + row * 22;
    const activation = activeGateMap.get(gate);
    const isDesign = activation?.layer === "Design";

    context.beginPath();
    roundedRect(x, y, chipWidth, chipHeight, 8);
    context.fillStyle = isDesign ? "rgba(143, 92, 255, 0.92)" : "rgba(255, 241, 191, 0.94)";
    context.strokeStyle = centerDefined ? "rgba(12, 6, 20, 0.5)" : "rgba(255, 241, 191, 0.45)";
    context.lineWidth = 1;
    context.fill();
    context.stroke();

    context.fillStyle = isDesign ? "#fff8ff" : "#1b1025";
    context.font = "900 10px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(gate), x + chipWidth / 2, y + chipHeight / 2 + 0.5);
  });
}

function drawCenterShape(center) {
  const { x, y } = center;
  if (center.shape === "triangle") {
    context.moveTo(x, y - 44); context.lineTo(x - 48, y + 36); context.lineTo(x + 48, y + 36); context.closePath();
  } else if (center.shape === "triangleDown") {
    context.moveTo(x - 50, y - 36); context.lineTo(x + 50, y - 36); context.lineTo(x, y + 44); context.closePath();
  } else if (center.shape === "diamond") {
    context.moveTo(x, y - 52); context.lineTo(x + 56, y); context.lineTo(x, y + 52); context.lineTo(x - 56, y); context.closePath();
  } else if (center.shape === "triangleLeft") {
    context.moveTo(x - 54, y); context.lineTo(x + 42, y - 46); context.lineTo(x + 42, y + 46); context.closePath();
  } else if (center.shape === "triangleRight") {
    context.moveTo(x + 54, y); context.lineTo(x - 42, y - 46); context.lineTo(x - 42, y + 46); context.closePath();
  } else {
    roundedRect(x - 54, y - 34, 108, 68, center.shape === "small" ? 14 : 8);
  }
}

function drawChartLabel(chart) {
  context.fillStyle = colors.ink;
  context.font = "900 26px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(chart.isPlaceholder ? "Bodygraph Preview" : chart.type || "Human Design", 450, 52);
  context.fillStyle = colors.muted;
  context.font = "800 15px Inter, sans-serif";
  context.fillText(chart.isPlaceholder ? "Berechnung startet nach Eingabe deiner Daten" : `${chart.authority || "Autorität"} - Profil ${chart.profile || "n/a"}`, 450, 82);
}

function roundedRect(x, y, width, height, radius) {
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function dailyFocus(gates) {
  const first = gates[0];
  if (!first) return "Achte auf deinen Körper, bevor du entscheidest.";
  return `Tor ${first.gate}.${first.line || 1}: ${first.tone || "Aktivierung"} beobachten.`;
}

function practiceForType(type) {
  return {
    Generator: "Warte auf ein klares Ja im Körper.",
    "Manifestierender Generator": "Reagiere, prüfe Tempo, informiere kurz.",
    Projektor: "Warte auf Anerkennung, bevor du deine Tiefe verschenkst.",
    Manifestor: "Informiere, bevor du initiierst.",
    Reflektor: "Gib deiner Wahrheit Zeit."
  }[type] || "Bleib bei deiner inneren Antwort.";
}

function typePracticeForPublic(type) {
  return practiceForType(type);
}

function authorityPracticeForPublic(authority) {
  return {
    Emotional: "Klarheit entsteht über Zeit, nicht im ersten emotionalen Impuls.",
    Sakral: "Der Körper antwortet unmittelbar mit Ja, Nein oder Noch-nicht.",
    Milz: "Die Wahrheit ist leise, schnell und instinktiv im Jetzt.",
    Ego: "Entscheidung klaert sich über Wille, Herz und echte Zusage.",
    "Selbst-projiziert": "Sprich es aus und höre, welche Richtung wahr klingt.",
    "Mental / Umgebung": "Die richtige Umgebung macht die innere Wahrheit hörbar.",
    Lunar: "Zeit, Mondphasen und wiederkehrende Muster bringen Klarheit."
  }[authority] || "Autorität zeigt, wo Entscheidung im Körper verankert wird.";
}

function profileDescriptionForPublic(profile) {
  return {
    "1/3": "Forscher/Märtyrer: Sicherheit durch Verstehen, Wahrheit durch Erfahrung.",
    "1/4": "Forscher/Opportunist: Tiefe Grundlagen treffen auf ein tragendes Netzwerk.",
    "2/4": "Eremit/Opportunist: natürliche Gabe, die durch die richtigen Menschen gerufen wird.",
    "2/5": "Eremit/Ketzer: Rückzug und Projektion, Gabe und Erwartungsfeld.",
    "3/5": "Märtyrer/Ketzer: Versuch, Irrtum und praktische Lösungen für andere.",
    "3/6": "Märtyrer/Vorbild: Lebenserfahrung reift zu gelassener Orientierung.",
    "4/1": "Opportunist/Forscher: feste innere Basis, die durch Beziehungen wirkt.",
    "4/6": "Opportunist/Vorbild: Netzwerk, Reifung und Weisheit aus gelebter Erfahrung.",
    "5/1": "Ketzer/Forscher: Projektion, Lösungskraft und die Notwendigkeit solider Grundlagen.",
    "5/2": "Ketzer/Eremit: natürliche Gabe im Feld der Erwartungen; nicht jede Projektion gehört dir.",
    "6/2": "Vorbild/Eremit: gereifte Weisheit und Talent, das nicht erzwungen werden will.",
    "6/3": "Vorbild/Märtyrer: Reifung durch Erfahrung, Mut und immer ehrlichere Wahrheit."
  }[profile] || "Das Profil beschreibt die Rolle, durch die Bewusstsein und Körper das Leben lernen.";
}

function formatPoint(point) {
  const degree = Number.isFinite(point.degree) ? `${point.degree.toFixed(1)} Grad ` : "";
  const sign = point.sign || "";
  const house = point.house ? ` - Haus ${point.house}` : "";
  const retrograde = point.retrograde ? " - rückläufig" : "";

  return `${degree}${sign}${house}${retrograde}`.trim();
}

function formatActivationPosition(item) {
  const degree = Number.isFinite(item.degree) ? `${item.degree.toFixed(2)} Grad` : "";
  const sign = item.sign || "";

  return [degree, sign].filter(Boolean).join(" ");
}

function pick(values, seed) {
  return values[Math.abs(seed) % values.length];
}

function hash(value) {
  return Array.from(value).reduce((accumulator, char) => {
    return ((accumulator << 5) - accumulator + char.charCodeAt(0)) >>> 0;
  }, 2166136261);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

