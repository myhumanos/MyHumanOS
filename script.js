document.getElementById("year").textContent = new Date().getFullYear();

const types = [
  { name: "Generator", strategy: "Respond, then commit", authority: "Sacral clarity", vibe: "Your energy grows when you stop chasing and start responding to what is actually alive in front of you." },
  { name: "Manifesting Generator", strategy: "Respond, then inform", authority: "Sacral clarity", vibe: "You are built for speed, experiments and nonlinear paths. Let life give you something real to respond to first." },
  { name: "Projector", strategy: "Wait for recognition", authority: "Emotional clarity", vibe: "Your gift is seeing systems. Do not force access. Let the right people invite your perspective." },
  { name: "Manifestor", strategy: "Inform before initiating", authority: "Splenic impulse", vibe: "You move energy by initiating. Peace comes when you communicate before you disrupt the room." },
  { name: "Reflector", strategy: "Wait a lunar cycle", authority: "Lunar/environmental clarity", vibe: "You are not here to be consistent. You are here to sample life and reveal the truth of the environment." }
];
const profiles = ["1/3 Investigator - Martyr", "1/4 Investigator - Opportunist", "2/4 Hermit - Opportunist", "2/5 Hermit - Heretic", "3/5 Martyr - Heretic", "3/6 Martyr - Role Model", "4/6 Opportunist - Role Model", "4/1 Opportunist - Investigator", "5/1 Heretic - Investigator", "5/2 Heretic - Hermit", "6/2 Role Model - Hermit", "6/3 Role Model - Martyr"];
const centers = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"];
const gateThemes = ["Self-expression", "Stillness", "Beginnings", "Direction", "Patience", "Friction", "Leadership", "Contribution", "Focus", "Behavior", "Peace", "Caution", "Listening", "Grace", "Extremes", "Skills", "Opinions", "Correction", "Wanting", "Contemplation", "Biting Through", "Grace", "Splitting Apart", "Return", "Innocence", "Taming Power", "Nourishment", "Preponderance", "The Abysmal", "The Clinging", "Influence", "Duration", "Retreat", "Power", "Progress", "Darkening", "Family", "Opposition", "Obstruction", "Deliverance", "Decrease", "Increase", "Breakthrough", "Coming to Meet", "Gathering", "Pushing Up", "Oppression", "The Well", "Revolution", "The Cauldron", "Shock", "Keeping Still", "Development", "Marrying Maiden", "Abundance", "The Wanderer", "Gentle Wind", "Joy", "Dispersion", "Limitation", "Inner Truth", "Small Exceeding", "After Completion", "Before Completion"];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick(arr, seed, off = 0) {
  return arr[(seed + off) % arr.length];
}

function uniqueGates(seed) {
  const out = [];
  let x = seed;
  while (out.length < 8) {
    x = (x * 9301 + 49297) % 233280;
    const gate = (x % 64) + 1;
    if (!out.includes(gate)) {
      out.push(gate);
    }
  }
  return out;
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

function localPreview(data) {
  const seed = hash(`${data.name}|${data.date}|${data.time}|${data.place}`);
  const type = pick(types, seed);
  const profile = pick(profiles, seed, 3);
  const gates = uniqueGates(seed);
  const defined = centers.filter((_, index) => ((seed >> index) & 1)).slice(0, 5);
  const openness = centers.filter((center) => !defined.includes(center));
  return { ...data, type, profile, gates, defined, openness, vibe: type.vibe, isMock: true };
}

function renderLocalPreview(data) {
  const preview = localPreview(data);
  return `
    <span class="result-kicker">Launch chart preview</span>
    <h3>${escapeHtml(preview.name || "Your")} - ${escapeHtml(preview.type.name)}</h3>
    <div class="result-grid">
      <div><span>Profile</span><strong>${escapeHtml(preview.profile)}</strong></div>
      <div><span>Strategy</span><strong>${escapeHtml(preview.type.strategy)}</strong></div>
      <div><span>Authority</span><strong>${escapeHtml(preview.type.authority)}</strong></div>
      <div><span>Place</span><strong>${escapeHtml(preview.place)}</strong></div>
    </div>
    <p class="guidance">${escapeHtml(preview.vibe)}</p>
    <div class="mini-section"><span>Active gate preview</span><div class="gate-list">${preview.gates.map((gate) => `<b>Gate ${gate}<small>${escapeHtml(gateThemes[gate - 1])}</small></b>`).join("")}</div></div>
    <div class="mini-section"><span>Defined centers preview</span><p>${preview.defined.length ? escapeHtml(preview.defined.join(" - ")) : "No fixed center preview"}</p></div>
    <div class="mini-section"><span>Open centers preview</span><p>${escapeHtml(preview.openness.slice(0, 5).join(" - "))}</p></div>
    <p class="disclaimer">Fallback preview. The server API is not available yet or the Astrology API key is missing.</p>
  `;
}

function formatPoint(point) {
  if (!point) return "n/a";
  const degree = Number.isFinite(point.degree) ? `${point.degree.toFixed(1)} deg ` : "";
  const sign = point.sign || "";
  const house = point.house ? ` - House ${point.house}` : "";
  return `${degree}${sign}${house}`.trim() || "calculated";
}

function renderApiChart(chart, data) {
  const points = Array.isArray(chart.points) ? chart.points.slice(0, 12) : [];
  const gates = Array.isArray(chart.gates) ? chart.gates.slice(0, 8) : [];
  const highlights = Array.isArray(chart.centers) ? chart.centers.slice(0, 6) : [];
  const metrics = chart.metrics || [
    { label: "Sun", value: chart.strategy },
    { label: "Moon", value: chart.authority },
    { label: "Ascendant", value: chart.profile }
  ];

  return `
    <span class="result-kicker">${escapeHtml(chart.provider || "Swiss Ephemeris")}</span>
    <h3>${escapeHtml(data.name || "Your")} - ${escapeHtml(chart.type || "Natal Chart")}</h3>
    <div class="result-grid">
      ${metrics.map((metric) => `<div><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value || "n/a")}</strong></div>`).join("")}
      <div><span>Place</span><strong>${escapeHtml(data.place)}</strong></div>
    </div>
    <p class="guidance">${escapeHtml(chart.summary || "Swiss Ephemeris chart calculated successfully.")}</p>
    ${points.length ? `<div class="mini-section"><span>Planet positions</span><div class="gate-list">${points.map((point) => `<b>${escapeHtml(point.name)}<small>${escapeHtml(formatPoint(point))}</small></b>`).join("")}</div></div>` : ""}
    ${highlights.length ? `<div class="mini-section"><span>Chart highlights</span><p>${escapeHtml(highlights.join(" - "))}</p></div>` : ""}
    ${gates.length ? `<div class="mini-section"><span>Chart markers</span><p>${gates.map((gate) => `Gate ${gate}`).join(" - ")}</p></div>` : ""}
    <p class="disclaimer">Live API result. isMock: ${chart.isMock ? "true" : "false"}</p>
  `;
}

async function fetchChart(data) {
  const response = await fetch("/api/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      birthDate: data.date,
      birthTime: data.time,
      birthPlace: data.place
    })
  });

  if (!response.ok) {
    throw new Error(`Chart API failed with status ${response.status}`);
  }

  return response.json();
}

const form = document.getElementById("chartForm");
const result = document.getElementById("chartResult");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {
    name: document.getElementById("name").value.trim(),
    date: document.getElementById("date").value,
    time: document.getElementById("time").value,
    place: document.getElementById("place").value.trim()
  };
  const submit = form.querySelector('button[type="submit"]');
  const originalText = submit.textContent;

  result.classList.remove("empty");
  result.innerHTML = '<span class="result-kicker">Calculating</span><h3>Calling Swiss Ephemeris...</h3><p>Please wait a moment.</p>';
  submit.disabled = true;
  submit.textContent = "Calculating...";

  try {
    const chart = await fetchChart(data);
    result.innerHTML = chart.isMock ? renderLocalPreview(data) : renderApiChart(chart, data);
  } catch {
    result.innerHTML = renderLocalPreview(data);
  } finally {
    submit.disabled = false;
    submit.textContent = originalText;
  }
});
