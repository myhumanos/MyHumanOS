const form = document.querySelector("#chart-form");
const panel = document.querySelector("#reading-panel");
const canvas = document.querySelector("#chart-canvas");
const providerLabel = document.querySelector("#provider-label");
const publicChartList = document.querySelector("#public-chart-list");
const publicChartStatus = document.querySelector("#public-chart-status");
const context = canvas.getContext("2d");

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

const defaultChart = {
  type: "Generator",
  strategy: "Reagieren",
  authority: "Sakral",
  profile: "2/4",
  signature: "Zufriedenheit",
  notSelf: "Frustration",
  centers: ["Sakral", "G-Zentrum", "Milz"],
  gates: [5, 14, 29, 34, 46, 57],
  humanDesign: {
    definedCenters: ["Sakral", "G-Zentrum", "Milz"],
    openCenters: ["Kopf", "Ajna", "Kehle", "Ego", "Solarplexus", "Wurzel"],
    gates: [
      { gate: 5, line: 2, planet: "Sun", tone: "Rhythmus" },
      { gate: 14, line: 4, planet: "Moon", tone: "Ressourcen" },
      { gate: 29, line: 1, planet: "Venus", tone: "Commitment" }
    ]
  }
};

drawChart(defaultChart);
loadPublicCharts();

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
    providerLabel.textContent = chart.isMock ? "Fallback Preview" : "Swiss Ephemeris live";
    addPublicChartFromResult(chart, payload);
  } catch (error) {
    panel.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Chart berechnen";
  }
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
    return createFallbackChart(payload);
  }

  if (response.ok) return response.json();
  if (response.status === 404 || response.status === 405) return createFallbackChart(payload);
  throw new Error("Die Chart-Auswertung konnte gerade nicht geladen werden.");
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
    ? "Live gespeichert: oeffentlich sichtbar sind nur Vorname und Chart-Ergebnis. Geburtsdatum, Uhrzeit, Ort, Koordinaten und API-Rohdaten bleiben verborgen."
    : "Lokale Vorschau: Fuer echte oeffentliche Speicherung braucht Cloudflare den KV-Speicher PUBLIC_CHARTS.";
}

function prependPublicChart(entry, storageEnabled) {
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
    : "Lokal vorgemerkt. Fuer echte oeffentliche Speicherung braucht Cloudflare die PUBLIC_CHARTS KV-Bindung.";
}

function publicChartCard(entry) {
  const gates = Array.isArray(entry.gates) ? entry.gates.slice(0, 6) : [];
  const centers = Array.isArray(entry.centers) ? entry.centers.slice(0, 4).join(", ") : "";

  return `
    <article class="public-card" data-public-chart-id="${escapeHtml(entry.id)}">
      <div class="public-card-header">
        <div>
          <span>${escapeHtml(entry.provider || "Chart")}</span>
          <h3>${escapeHtml(entry.firstName || "Anonym")}</h3>
        </div>
        <time datetime="${escapeHtml(entry.createdAt || "")}">${escapeHtml(formatPublicDate(entry.createdAt))}</time>
      </div>
      <strong>${escapeHtml(entry.type || "Human Design")} - Profil ${escapeHtml(entry.profile || "n/a")}</strong>
      <p class="public-meta">${escapeHtml(entry.authority || "Autoritaet offen")} - ${escapeHtml(entry.strategy || "Strategie offen")}${centers ? ` - ${escapeHtml(centers)}` : ""}</p>
      ${gates.length ? `<div class="public-gates">${gates.map((gate) => `<b>Tor ${escapeHtml(gate.gate)}${gate.line ? `.${escapeHtml(gate.line)}` : ""}</b>`).join("")}</div>` : ""}
    </article>
  `;
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
    gates: (hd.gates || chart.gates || []).slice(0, 8).map((gate) => typeof gate === "number" ? { gate } : gate),
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
  const location = chart.location || {};
  const coordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : "wird vom API-Provider bestimmt";
  const time = chart.time || {};
  const utcTime = time.utcTime ? formatUtcTime(time.utcTime) : "wird vom API-Provider bestimmt";
  const locationSource = locationSourceLabel(location.source, time.timezoneSource);

  panel.innerHTML = `
    <div class="reading-header">
      <span class="tiny-label">${chart.isMock ? "Preview" : escapeHtml(chart.provider || "Swiss Ephemeris")}</span>
      <h2>${escapeHtml(chart.type || "Human Design Preview")}</h2>
      <p>${escapeHtml(payload.name || "Dein Chart")} - ${escapeHtml(payload.birthPlace)} - ${escapeHtml(payload.birthDate)} - ${escapeHtml(payload.birthTime)}</p>
    </div>

    <div class="core-grid">
      ${coreCard("Strategie", chart.strategy, "Der Eingang, durch den deine Energie weicher ins Leben tritt.")}
      ${coreCard("Autoritaet", chart.authority, "Der Ort, an dem Entscheidung im Koerper klarer wird.")}
      ${coreCard("Profil", chart.profile, "Deine Lernspur zwischen Rolle, Gabe und Begegnung.")}
      ${coreCard("Selbst", chart.signature, "So fuehlt es sich an, wenn du weniger gegen dich arbeitest.")}
      ${coreCard("Nicht-Selbst", chart.notSelf, "Das Signal, dass du vielleicht fremde Erwartungen traegst.")}
      ${coreCard("Zeitzone", location.timezone || chart.time?.interpretedAs || "Europe/Berlin", "Geburtszeit wird lokal interpretiert.")}
      ${coreCard("UTC", utcTime, "Umrechnung fuer die Ephemeris-Zeit.")}
      ${coreCard("Koordinaten", coordinates, location.city ? `${location.city}, ${location.countryCode}` : "Geburtsort")}
      ${coreCard("Ort-Quelle", locationSource, "So wurde der Geburtsort aufgeloest.")}
      ${coreCard("Status", chart.isMock ? "Fallback" : "Live", chart.isMock ? "Ohne API berechnet." : "Mit Swiss Ephemeris berechnet.")}
    </div>

    <div class="insight-strip">
      <div>
        <span>Heute wichtig</span>
        <strong>${dailyFocus(gates)}</strong>
      </div>
      <div>
        <span>Praxis</span>
        <strong>${practiceForType(chart.type)}</strong>
      </div>
    </div>

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
        <span class="tiny-label">Aktivierungen</span>
        <h3>Gates und Linien</h3>
      </div>
      <div class="gate-grid">${gates.slice(0, 14).map(gateCard).join("")}</div>
    </section>

    ${points.length ? `
      <section class="reading-section">
        <div class="section-heading">
          <span class="tiny-label">Ephemeris</span>
          <h3>Planetenpositionen</h3>
        </div>
        <ul class="point-list">${points.map(pointRow).join("")}</ul>
      </section>
    ` : ""}

    <p class="summary">${escapeHtml(chart.summary || "")}</p>
  `;
}

function coreCard(label, value, detail) {
  return `<article class="core-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "n/a")}</strong><p>${escapeHtml(detail)}</p></article>`;
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
      <span>${escapeHtml(item.planet || "Aktivierung")}</span>
      <strong>Tor ${escapeHtml(item.gate)}.${escapeHtml(item.line || 1)}</strong>
      <p>${escapeHtml(item.tone || "Aktivierung")}</p>
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
      <p>MyHumanOS ruft die geschuetzte Worker-API auf und uebersetzt die Positionen in Human-Design-Gates.</p>
    </div>
  `;
}

function drawChart(chart) {
  const hd = chart.humanDesign || {};
  const definedCenters = hd.definedCenters || chart.centers || [];
  const gates = hd.gates || chart.gates?.map((gate) => ({ gate, line: 1 })) || [];

  context.clearRect(0, 0, canvas.width, canvas.height);
  const background = context.createRadialGradient(450, 390, 40, 450, 450, 500);
  background.addColorStop(0, "#2b1840");
  background.addColorStop(0.55, "#160d20");
  background.addColorStop(1, "#0c0711");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawGateWheel(gates);
  drawChannels(gates);
  drawCenters(definedCenters);
  drawChartLabel(chart);
}

function drawGateWheel(gates) {
  const cx = 450;
  const cy = 450;
  const radius = 396;
  context.strokeStyle = "rgba(232, 213, 255, 0.28)";
  context.lineWidth = 2;

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
  }

  gates.slice(0, 18).forEach((item, index) => {
    const angle = (Math.PI * 2 * ((item.gate || 1) % 64)) / 64 - Math.PI / 2;
    const color = [colors.teal, colors.coral, colors.gold, colors.violet, colors.blue, colors.green][index % 6];
    const x = cx + Math.cos(angle) * (radius - 54);
    const y = cy + Math.sin(angle) * (radius - 54);

    context.beginPath();
    context.fillStyle = color;
    context.arc(x, y, 20, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#160d20";
    context.font = "800 14px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(item.gate), x, y);
  });
}

function drawChannels(gates) {
  const activeGates = new Set(gates.map((item) => item.gate));
  const channelPairs = [
    [64, 47, "Kopf", "Ajna"], [61, 24, "Kopf", "Ajna"], [63, 4, "Kopf", "Ajna"],
    [17, 62, "Ajna", "Kehle"], [43, 23, "Ajna", "Kehle"], [11, 56, "Ajna", "Kehle"],
    [1, 8, "G-Zentrum", "Kehle"], [7, 31, "G-Zentrum", "Kehle"], [13, 33, "G-Zentrum", "Kehle"],
    [10, 34, "G-Zentrum", "Sakral"], [14, 2, "Sakral", "G-Zentrum"], [29, 46, "Sakral", "G-Zentrum"],
    [59, 6, "Sakral", "Solarplexus"], [19, 49, "Wurzel", "Solarplexus"], [38, 28, "Wurzel", "Milz"],
    [54, 32, "Wurzel", "Milz"], [21, 45, "Ego", "Kehle"], [26, 44, "Ego", "Milz"]
  ];

  channelPairs.forEach(([a, b, from, to]) => {
    const start = centerLayout.find((center) => center.name === from);
    const end = centerLayout.find((center) => center.name === to);
    if (!start || !end) return;
    const active = activeGates.has(a) && activeGates.has(b);

    context.beginPath();
    context.strokeStyle = active ? colors.gold : "rgba(232, 213, 255, 0.16)";
    context.lineWidth = active ? 7 : 4;
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  });
}

function drawCenters(definedCenters) {
  centerLayout.forEach((center, index) => {
    const active = definedCenters.includes(center.name);
    const fill = active ? [colors.teal, colors.coral, colors.gold, colors.violet, colors.blue][index % 5] : "rgba(232, 213, 255, 0.09)";

    context.beginPath();
    drawCenterShape(center);
    context.fillStyle = fill;
    context.strokeStyle = active ? "#f7f1ff" : "rgba(232, 213, 255, 0.22)";
    context.lineWidth = active ? 3 : 2;
    context.fill();
    context.stroke();

    context.fillStyle = active ? "#160d20" : colors.muted;
    context.font = "800 15px Inter, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(center.name, center.x, center.y);
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
  context.font = "900 28px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(chart.type || "Human Design", 450, 52);
  context.fillStyle = colors.muted;
  context.font = "800 15px Inter, sans-serif";
  context.fillText(`${chart.authority || "Autoritaet"} - Profil ${chart.profile || "n/a"}`, 450, 82);
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
  if (!first) return "Achte auf deinen Koerper, bevor du entscheidest.";
  return `Tor ${first.gate}.${first.line || 1}: ${first.tone || "Aktivierung"} beobachten.`;
}

function practiceForType(type) {
  return {
    Generator: "Warte auf ein klares Ja im Koerper.",
    "Manifestierender Generator": "Reagiere, pruefe Tempo, informiere kurz.",
    Projektor: "Warte auf Anerkennung, bevor du deine Tiefe verschenkst.",
    Manifestor: "Informiere, bevor du initiierst.",
    Reflektor: "Gib deiner Wahrheit Zeit."
  }[type] || "Bleib bei deiner inneren Antwort.";
}

function formatPoint(point) {
  const degree = Number.isFinite(point.degree) ? `${point.degree.toFixed(1)} Grad ` : "";
  const sign = point.sign || "";
  const house = point.house ? ` - Haus ${point.house}` : "";
  const retrograde = point.retrograde ? " - ruecklaeufig" : "";

  return `${degree}${sign}${house}${retrograde}`.trim();
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

