loadTransitProfile();

async function loadTransitProfile() {
  try {
    const response = await fetch("/api/auth/profile", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    const profile = data.profile;
    if (!profile) return;

    setText("#transit-profile-line", `Persönliche Tagestransite für ${profile.name || "dein Profil"}: ${profile.type || "Human Design"}, ${profile.authority || "Autorität offen"}, Profil ${profile.profile || "--"}, ${profile.birthTime || "Uhrzeit offen"} ${profile.birthPlace ? `in ${profile.birthPlace}` : ""}.`);
    setText("#transit-type-pill", profile.type || "Chart");
    setText("#transit-profile-pill", `Profil ${profile.profile || "--"}`);
    setText("#transit-authority-pill", profile.authority || "Autorität");
    setText("#transit-place-pill", profile.birthPlace || "Ort offen");
  } catch {
    // Static Justin profile stays visible when no account is active.
  }
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
