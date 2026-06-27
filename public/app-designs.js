const modes = {
  "stella-soft": {
    title: "MyHumanOS als weiche mobile Begleiter-App",
    summary: "Stella-inspiriert im Sinne von mobilem Wellness-Flow: klare Tageskarte, eigenes Chart, AI-Frage und persönlicher Rhythmus. Eigenes UI, weniger kopiert, stärker MyHumanOS.",
    detail: "Soft OS",
    look: "iOS, hell, weich",
    focus: "Daily Insight + Chart",
    risk: "Kann zu Wellness-generisch wirken"
  },
  "ritual-feed": {
    title: "MyHumanOS als täglicher Ritual-Feed",
    summary: "Mehr Tagebuch, mehr Readings, mehr Wiederkehr. Die App fühlt sich wie ein ruhiger Morgen-Companion an, nicht wie ein reiner Rechner.",
    detail: "Ritual Feed",
    look: "Warm, editorial, journalnah",
    focus: "Habit, Journal, Tagesimpuls",
    risk: "Chart-Funktion darf nicht untergehen"
  },
  "bodygraph-pro": {
    title: "MyHumanOS als professionelles Chart-Tool",
    summary: "Mehr Klarheit, mehr Daten, mehr Explorer. Diese Richtung macht MyHumanOS zur mobilen Analyse-App für Gates, Zentren, Kanäle und Transite.",
    detail: "Bodygraph Pro",
    look: "Clean, technisch, sehr strukturiert",
    focus: "Explorer + Swiss Ephemeris",
    risk: "Kann weniger emotional wirken"
  },
  "social-pulse": {
    title: "MyHumanOS als Human-Design-Community",
    summary: "Public Charts, Kompatibilität, Freunde und kleine Vergleiche. Die App fühlt sich lebendig an, bleibt aber privacy-first.",
    detail: "Social Pulse",
    look: "Frisch, sozial, app-store-ready",
    focus: "Compatibility + Community",
    risk: "Braucht starke Datenschutzsignale"
  }
};

const title = document.querySelector("#mode-title");
const summary = document.querySelector("#mode-summary");
const detailTitle = document.querySelector("#mode-detail-title");
const look = document.querySelector("#mode-look");
const focus = document.querySelector("#mode-focus");
const risk = document.querySelector("#mode-risk");
const controls = document.querySelectorAll("[data-mode-option]");

controls.forEach((control) => {
  control.addEventListener("click", () => setMode(control.dataset.modeOption));
});

function setMode(modeName) {
  const mode = modes[modeName] || modes["stella-soft"];

  document.body.dataset.mode = modeName;
  title.textContent = mode.title;
  summary.textContent = mode.summary;
  detailTitle.textContent = mode.detail;
  look.textContent = mode.look;
  focus.textContent = mode.focus;
  risk.textContent = mode.risk;

  controls.forEach((control) => {
    control.classList.toggle("active", control.dataset.modeOption === modeName);
  });
}
