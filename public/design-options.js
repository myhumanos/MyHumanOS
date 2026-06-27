const themes = {
  "operating-system": {
    title: "MyHumanOS als klares energetisches Betriebssystem",
    summary: "Eine reduzierte, produktnahe Richtung: weniger Ritual, mehr Präzision. Ideal, wenn Chart, Autorität, Profil und Gates wie ein persönliches Dashboard wirken sollen.",
    feel: "Präzise",
    conversion: "Hoch",
    effort: "Mittel",
    recommendation: "Als robuste Basis würde ich mit HumanOS Dashboard starten.",
    next: "Diese Richtung lässt sich am besten mit der vorhandenen Rechnerstruktur verbinden und kann später mit emotionaleren Sanctuary-Elementen angereichert werden."
  },
  "editorial-oracle": {
    title: "MyHumanOS als persönliches Reading-Magazin",
    summary: "Eine warme, redaktionelle Richtung mit starken Textachsen, ruhigen Flächen und hochwertiger Typografie. Gut, wenn die Deutung und das Wiedererkennen im Vordergrund stehen.",
    feel: "Intim",
    conversion: "Mittel",
    effort: "Niedrig",
    recommendation: "Editorial Oracle eignet sich als schnelle Premium-Iteration.",
    next: "Die bestehende Seite könnte mit weniger Strukturumbau umgebaut werden: größere Textführung, ruhigere Karten und mehr Fokus auf das Reading nach der Berechnung."
  },
  "celestial-sanctuary": {
    title: "MyHumanOS als atmosphärischer Sanctuary-Raum",
    summary: "Eine emotionale Richtung mit viel Tiefe, Bildwelt und Ritualgefühl. Sie passt, wenn die Marke mystischer, langsamer und stärker als Rückzugsort erscheinen soll.",
    feel: "Magnetisch",
    conversion: "Mittel",
    effort: "Hoch",
    recommendation: "Celestial Sanctuary ist stark für Brand, aber schwerer für Produktklarheit.",
    next: "Ich würde diese Richtung selektiv einsetzen: Hero, Lexikon und Community-Story können atmosphärisch sein, der Rechner selbst sollte klar bleiben."
  },
  "community-lab": {
    title: "MyHumanOS als lebendige Chart-Community",
    summary: "Eine soziale, moderne Richtung für Öffentliche Charts, Vergleichbarkeit und wiederkehrende Nutzung. Sie wirkt weniger esoterisch und mehr wie ein intelligentes Community-Tool.",
    feel: "Aktiv",
    conversion: "Hoch",
    effort: "Mittel",
    recommendation: "Community Lab ist sinnvoll, wenn Public Charts ein Kernfeature werden.",
    next: "Diese Richtung braucht klare Datenschutzsignale, Filter, Vergleichsansichten und gute leere Zustände, damit die Community-Funktion vertrauenswürdig wirkt."
  }
};

const title = document.querySelector("#theme-title");
const summary = document.querySelector("#theme-summary");
const feel = document.querySelector("#theme-feel");
const conversion = document.querySelector("#theme-conversion");
const effort = document.querySelector("#theme-effort");
const recommendation = document.querySelector("#theme-recommendation");
const next = document.querySelector("#theme-next");
const controls = document.querySelectorAll("[data-theme-option]");

controls.forEach((control) => {
  control.addEventListener("click", () => setTheme(control.dataset.themeOption));
});

function setTheme(themeName) {
  const theme = themes[themeName] || themes["operating-system"];

  document.body.dataset.theme = themeName;
  title.textContent = theme.title;
  summary.textContent = theme.summary;
  feel.textContent = theme.feel;
  conversion.textContent = theme.conversion;
  effort.textContent = theme.effort;
  recommendation.textContent = theme.recommendation;
  next.textContent = theme.next;

  controls.forEach((control) => {
    const selected = control.dataset.themeOption === themeName;
    control.classList.toggle("active", selected);
    control.classList.toggle("selected", selected);
  });
}
