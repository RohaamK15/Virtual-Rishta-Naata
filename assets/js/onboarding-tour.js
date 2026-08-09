// First-time coach-mark tour for search.html. Follows the same gate pattern
// as chat.html's Messaging Guidelines panel: a DB column on the member's own
// profile (onboarding_completed_at), not localStorage — this codebase has no
// localStorage usage anywhere, and a DB column means the "seen it" state
// follows the member across devices/browsers the same way chat guidelines do.

const VRN_TOUR_STEPS = [
  {
    selectors: ["#filterPanelDesktop", ".mobile-filter-btn"],
    title: "Find your match",
    body: "Use filters to narrow profiles by gender, age, country, and whether they'd consider a match from Pakistan.",
  },
  {
    selectors: [".profile-card"],
    title: "Browse approved profiles",
    body: "Every profile here has been reviewed and approved by our team — tap one to see their full details.",
  },
  {
    selectors: ['.app-bottom-nav a[href="/messages.html"]'],
    title: "Message your matches",
    body: "Once you've found someone interesting, send them a message directly from their profile — no phone number needed.",
  },
  {
    selectors: ['.app-bottom-nav a[href="/home.html"]'],
    title: "Explore more from Home",
    body: "Head back Home anytime to book a 1-1 Consultation, review pricing, or revisit what makes Virtual Rishta Naata different.",
  },
  {
    selectors: ['.icon-btn[aria-label="My account"]'],
    title: "Manage your account",
    body: "Edit your profile, check your membership, or update your details any time from My Account.",
  },
];

let vrnTourIndex = 0;

function vrnTourFindVisibleTarget(step) {
  for (const sel of step.selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) return el;
  }
  return null;
}

function vrnTourBuildSteps() {
  return VRN_TOUR_STEPS.map((step) => ({ ...step, target: vrnTourFindVisibleTarget(step) })).filter((step) => step.target);
}

function vrnTourEnsureOverlay() {
  let overlay = document.getElementById("tourOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "tourOverlay";
  overlay.className = "tour-overlay";
  overlay.innerHTML = `
    <div class="tour-spotlight" id="tourSpotlight"></div>
    <div class="tour-card" id="tourCard">
      <div class="tour-progress-track"><div class="tour-progress-fill" id="tourProgressFill"></div></div>
      <p class="tour-step-label" id="tourStepLabel"></p>
      <h3 id="tourTitle"></h3>
      <p id="tourBody"></p>
      <div class="tour-actions">
        <button type="button" class="link-btn tour-skip" id="tourSkipBtn">Skip</button>
        <div class="tour-nav-btns">
          <button type="button" class="btn btn-outline btn-sm" id="tourBackBtn">Back</button>
          <button type="button" class="btn btn-primary btn-sm" id="tourNextBtn">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("tourSkipBtn").onclick = vrnCompleteOnboarding;
  document.getElementById("tourBackBtn").onclick = () => vrnTourGoTo(vrnTourIndex - 1);
  document.getElementById("tourNextBtn").onclick = () => {
    if (vrnTourIndex >= window.vrnTourSteps.length - 1) vrnCompleteOnboarding();
    else vrnTourGoTo(vrnTourIndex + 1);
  };
  window.addEventListener("resize", vrnTourReposition);
  window.addEventListener("scroll", vrnTourReposition, true);

  return overlay;
}

function vrnTourReposition() {
  const step = window.vrnTourSteps?.[vrnTourIndex];
  if (!step) return;
  const rect = step.target.getBoundingClientRect();
  const spotlight = document.getElementById("tourSpotlight");
  const card = document.getElementById("tourCard");
  if (!spotlight || !card) return;

  const pad = 8;
  spotlight.style.top = `${rect.top - pad}px`;
  spotlight.style.left = `${rect.left - pad}px`;
  spotlight.style.width = `${rect.width + pad * 2}px`;
  spotlight.style.height = `${rect.height + pad * 2}px`;

  const cardRect = card.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  let top = spaceBelow > cardRect.height + 24 ? rect.bottom + 16 : rect.top - cardRect.height - 16;
  top = Math.max(12, Math.min(top, window.innerHeight - cardRect.height - 12));

  let left = rect.left;
  left = Math.max(12, Math.min(left, window.innerWidth - cardRect.width - 12));

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function vrnTourGoTo(index) {
  const steps = window.vrnTourSteps;
  vrnTourIndex = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[vrnTourIndex];

  document.getElementById("tourStepLabel").textContent = `Step ${vrnTourIndex + 1} of ${steps.length}`;
  document.getElementById("tourTitle").textContent = step.title;
  document.getElementById("tourBody").textContent = step.body;
  document.getElementById("tourProgressFill").style.width = `${((vrnTourIndex + 1) / steps.length) * 100}%`;
  document.getElementById("tourBackBtn").style.visibility = vrnTourIndex === 0 ? "hidden" : "visible";
  document.getElementById("tourNextBtn").textContent = vrnTourIndex === steps.length - 1 ? "Finish" : "Next";

  step.target.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(vrnTourReposition, 300);
}

async function vrnCompleteOnboarding() {
  const overlay = document.getElementById("tourOverlay");
  if (overlay) overlay.remove();
  window.removeEventListener("resize", vrnTourReposition);
  window.removeEventListener("scroll", vrnTourReposition, true);
  try {
    const user = await vrnCurrentUser();
    if (user) await sb.from("profiles").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
  } catch (e) { /* best-effort — a failed write here shouldn't trap the member in the tour */ }
}

async function vrnStartOnboardingTour({ force = false } = {}) {
  if (!force) {
    let me;
    try { me = await vrnMyProfile(); } catch (e) { return; }
    if (!me || me.onboarding_completed_at) return;
  }

  const steps = vrnTourBuildSteps();
  if (!steps.length) return;
  window.vrnTourSteps = steps;

  vrnTourEnsureOverlay();
  vrnTourGoTo(0);
}
