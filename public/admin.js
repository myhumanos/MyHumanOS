loadAdmin();

async function loadAdmin() {
  const status = document.querySelector("#admin-status");
  const list = document.querySelector("#admin-user-list");
  try {
    const response = await fetch("/api/auth/admin", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Admin-Daten konnten nicht geladen werden.");
    renderStatus(status, data.status || {});
    renderUsers(list, data.users || []);
  } catch (error) {
    if (status) status.innerHTML = `<article><span>Login</span><strong>Nicht erlaubt</strong><p>${escapeHtml(error.message)}</p></article>`;
    if (list) list.innerHTML = `<article class="public-card muted"><span>Bitte mit Admin-Account einloggen.</span></article>`;
  }
}

function renderStatus(target, status) {
  if (!target) return;
  target.innerHTML = `
    <article><span>KV Speicher</span><strong>${status.storageEnabled ? "aktiv" : "fehlt"}</strong></article>
    <article><span>AstroAPI Key</span><strong>${status.astrologyKeyConfigured ? "gesetzt" : "fehlt"}</strong></article>
    <article><span>Transite</span><strong>${status.transitsEnabled ? "live" : "sparsam"}</strong></article>
    <article><span>Refinement</span><strong>${escapeHtml(status.designRefinementSteps || "1")}</strong></article>
  `;
}

function renderUsers(target, users) {
  if (!target) return;
  if (!users.length) {
    target.innerHTML = `<article class="public-card muted"><span>Noch keine Accounts.</span></article>`;
    return;
  }
  target.innerHTML = users.map((user) => {
    const profile = user.profile || {};
    return `
      <article class="admin-user-card">
        <div>
          <span>${escapeHtml(user.isAdmin ? "Admin" : "User")}</span>
          <strong>${escapeHtml(user.email)}</strong>
          <p>${escapeHtml([profile.name, profile.type, profile.profile].filter(Boolean).join(" - ") || "Noch kein Profil gespeichert")}</p>
        </div>
        <dl>
          <div><dt>Autorität</dt><dd>${escapeHtml(profile.authority || "offen")}</dd></div>
          <div><dt>Ort</dt><dd>${escapeHtml(profile.birthPlace || "offen")}</dd></div>
          <div><dt>Gespeichert</dt><dd>${escapeHtml(formatDate(profile.savedAt || user.updatedAt || user.createdAt))}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function formatDate(value) {
  if (!value) return "offen";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
