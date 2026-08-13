const BUSINESS_CONFIG = {
  whatsapp: "60145959752",
  canvaLink: "https://canva.link/b0bny2khpxyc7xx",
  packages: {
    nikah: {
      id: "nikah",
      eventType: "Nikah",
      name: "Nikah Only",
      price: 180,
      normalPrice: 360,
      hours: 3,
      description: "Perfect for intimate solemnization, or any kind of small event.",
      includes: [
        "Unlimited short videos + photos",
        "Real-time IG Story update",
        "Raw footage within 7 days via Google Drive",
      ],
      includedAddons: [],
    },
    sanding: {
      id: "sanding",
      eventType: "Sanding",
      name: "Sanding Only",
      price: 240,
      normalPrice: 480,
      hours: 4,
      description: "Perfect for reception event.",
      includes: [
        "Unlimited short videos + photos",
        "Real-time IG Story update",
        "Raw footage within 7 days via Google Drive",
      ],
      includedAddons: [],
    },
    nikahSanding: {
      id: "nikahSanding",
      eventType: "Nikah + Sanding",
      name: "Nikah + Sanding",
      price: 360,
      normalPrice: 720,
      hours: 6,
      description: "Perfect for solemnization + reception event.",
      includes: [
        "Unlimited short videos + photos",
        "Real-time IG Story update",
        "1-minute highlight reel / 60 sec",
        "Raw footage within 7 days via Google Drive",
        "FREE family wish",
        "FREE Instagram Story template",
      ],
      includedAddons: ["highlight", "template", "familyWish"],
    },
    small: {
      id: "small",
      eventType: "Small Event",
      name: "Small Event",
      price: null,
      normalPrice: null,
      hours: null,
      description: "Custom quotation for intimate events outside the standard package list.",
      includes: ["Package and coverage will be reviewed by Antara Akad."],
      includedAddons: [],
    },
  },
  addons: {
    template: {
      id: "template",
      name: "Customized Template",
      price: 10,
      description: "Personalised Instagram Story template.",
      includedLabel: "Instagram Story Template",
    },
    highlight: {
      id: "highlight",
      name: "1-Min Highlight Reel",
      price: 50,
      description: "60-second edited highlight.",
      includedLabel: "1-Min Highlight Reel",
    },
    extraHour: {
      id: "extraHour",
      name: "Extra Hour Coverage",
      price: 60,
      description: "Additional coverage by the hour.",
    },
  },
};

const STORAGE_KEY = "antara-akad-booking-state";

const EVENT_TO_PACKAGE = {
  Nikah: "nikah",
  Sanding: "sanding",
  "Nikah + Sanding": "nikahSanding",
  "Small Event": "small",
};

const QUESTION_META = {
  eventType: { number: "01 / 09", title: "WHAT EVENT ARE<br>YOU PLANNING?" },
  eventLocation: { number: "02 / 09", title: "WHERE IS YOUR<br>EVENT LOCATED?" },
  dateTime: { number: "03 / 09", title: "WHEN IS<br>YOUR EVENT?" },
  makeup: { number: "04 / 09", title: "DO YOU NEED US<br>DURING MAKEUP?" },
  makeupLocation: { number: "05 / 09", title: "WHERE WILL YOUR<br>MAKEUP SESSION BE?" },
  outdoor: { number: "06 / 09", title: "DO YOU NEED US<br>DURING OUTDOOR?" },
  outdoorLocation: { number: "07 / 09", title: "WHERE WILL YOUR<br>OUTDOOR SESSION BE?" },
  name: { number: "08 / 09", title: "WHAT SHOULD WE<br>CALL YOU? 🤍" },
  phone: { number: "09 / 09", title: "WHAT'S THE BEST<br>NUMBER TO REACH YOU?" },
  summary: { number: "YOUR EVENT", title: "REVIEW<br>DETAILS" },
};

let state = loadState();

function defaultState() {
  return {
    stepId: "eventType",
    data: {
      eventType: "",
      eventLocation: "",
      eventDate: "",
      startTime: "",
      endTime: "",
      makeup: "",
      makeupLocation: "",
      outdoor: "",
      outdoorLocation: "",
      name: "",
      phone: "+60",
    },
    selectedPackageId: "",
    addons: {
      template: false,
      highlight: false,
      extraHours: 0,
      transportAck: false,
    },
    availability: null,
  };
}

function loadState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultState(), ...JSON.parse(saved) } : defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatMoney(amount) {
  if (amount === null) return "Custom quotation";
  return `RM${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(amount)}`;
}

function formatDate(date) {
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function formatShortDate(date) {
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+08:00`)).toUpperCase();
}

function formatTime(value) {
  if (!value) return "N/A";
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(2026, 0, 1, hour, minute));
}

function getSteps() {
  return [
    "eventType",
    "eventLocation",
    "dateTime",
    "makeup",
    ...(state.data.makeup === "YES" ? ["makeupLocation"] : []),
    "outdoor",
    ...(state.data.outdoor === "YES" ? ["outdoorLocation"] : []),
    "name",
    "phone",
    "summary",
  ];
}

function startFlow(preselectedEventType) {
  if (preselectedEventType) {
    state.data.eventType = preselectedEventType;
    state.selectedPackageId = EVENT_TO_PACKAGE[preselectedEventType] ?? "";
    state.stepId = "eventLocation";
  }
  state.stepId = state.stepId || "eventType";
  saveState();
  renderQuestion();
  showScreen("flow-screen");
}

function setStep(stepId) {
  state.stepId = stepId;
  saveState();
  renderQuestion();
}

function nextStep() {
  const steps = getSteps();
  const index = steps.indexOf(state.stepId);
  setStep(steps[Math.min(index + 1, steps.length - 1)]);
}

function previousStep() {
  const steps = getSteps();
  const index = steps.indexOf(state.stepId);
  if (index <= 0) {
    showScreen("welcome-screen");
    return;
  }
  setStep(steps[index - 1]);
}

function updateProgress() {
  const steps = getSteps();
  const index = steps.indexOf(state.stepId);
  const percent = Math.max(7, ((index + 1) / steps.length) * 100);
  document.getElementById("progress-bar").style.width = `${percent}%`;
}

function renderQuestion(error = "") {
  updateProgress();
  const meta = QUESTION_META[state.stepId];
  const card = document.getElementById("question-card");
  card.innerHTML = `
    <p class="step-count">${meta.number}</p>
    <h2 id="flow-title">${meta.title}</h2>
    ${renderStepBody(state.stepId)}
    ${error ? `<p class="field-error" role="alert">${error}</p>` : ""}
    <div class="flow-actions">
      ${
        state.stepId === "summary"
          ? `<button class="btn ghost" type="button" data-action="edit-details">EDIT DETAILS</button>
             <button class="btn primary" type="button" data-action="check-availability">CHECK AVAILABILITY →</button>`
          : `<button class="btn primary" type="button" data-action="continue-flow">CONTINUE →</button>`
      }
    </div>
  `;
}

function renderStepBody(stepId) {
  switch (stepId) {
    case "eventType":
      return `<div class="option-grid">${["Nikah", "Sanding", "Nikah + Sanding", "Small Event"]
        .map((option) => optionButton("eventType", option))
        .join("")}</div>`;
    case "eventLocation":
      return field("eventLocation", "Event Location", "Paste Google Maps / Waze link or venue name", "textarea");
    case "dateTime":
      return `
        <div class="field-grid">
          ${field("eventDate", "Event date", "", "date", `min="${todayIso()}"`)}
          ${field("startTime", "Start event time", "", "time")}
          ${field("endTime", "End event time", "", "time")}
        </div>
      `;
    case "makeup":
      return `<div class="option-grid">${["YES", "NO"].map((option) => optionButton("makeup", option)).join("")}</div>`;
    case "makeupLocation":
      return field("makeupLocation", "Makeup Location", "Paste Google Maps / Waze link", "textarea");
    case "outdoor":
      return `<div class="option-grid">${["YES", "NO"].map((option) => optionButton("outdoor", option)).join("")}</div>`;
    case "outdoorLocation":
      return field("outdoorLocation", "Outdoor Photoshoot Location", "Paste Google Maps / Waze link", "textarea");
    case "name":
      return field("name", "Name", "Sarah", "text", `autocomplete="name"`);
    case "phone":
      return field("phone", "Phone number", "+60", "tel", `inputmode="tel" autocomplete="tel"`);
    case "summary":
      return summaryPanel();
    default:
      return "";
  }
}

function optionButton(key, option) {
  const selected = state.data[key] === option ? " selected" : "";
  return `<button class="option-card${selected}" type="button" data-option-key="${key}" data-option-value="${option}">${option}</button>`;
}

function field(key, label, placeholder, type, attrs = "") {
  const value = state.data[key] ?? "";
  const input =
    type === "textarea"
      ? `<textarea id="${key}" data-field="${key}" placeholder="${placeholder}" ${attrs}>${escapeHtml(value)}</textarea>`
      : `<input id="${key}" data-field="${key}" type="${type}" value="${escapeHtml(value)}" placeholder="${placeholder}" ${attrs} />`;
  return `<div class="field"><label for="${key}">${label}</label>${input}</div>`;
}

function summaryPanel() {
  return `
    <section class="summary-panel">
      <h3>${safe(state.data.eventType)}</h3>
      ${summaryLine("Date", formatDate(state.data.eventDate))}
      ${summaryLine("Time", `${formatTime(state.data.startTime)} — ${formatTime(state.data.endTime)}`)}
      ${summaryLine("Event Location", safe(state.data.eventLocation))}
      ${summaryLine("Makeup", state.data.makeup === "YES" ? safe(state.data.makeupLocation) : "N/A")}
      ${summaryLine("Outdoor", state.data.outdoor === "YES" ? safe(state.data.outdoorLocation) : "N/A")}
      ${summaryLine("Name", safe(state.data.name))}
      ${summaryLine("Phone", safe(state.data.phone))}
    </section>
  `;
}

function summaryLine(label, value) {
  return `<div class="summary-line"><span>${label}</span><strong>${value || "N/A"}</strong></div>`;
}

function validateCurrentStep() {
  const d = state.data;
  switch (state.stepId) {
    case "eventType":
      return d.eventType ? "" : "Choose the event you are planning.";
    case "eventLocation":
      return d.eventLocation.trim().length >= 3 ? "" : "Add your venue name, Google Maps link, or Waze link.";
    case "dateTime":
      if (!d.eventDate) return "Choose your event date.";
      if (d.eventDate < todayIso()) return "Past dates cannot be selected.";
      if (!d.startTime || !d.endTime) return "Add your start and end time.";
      if (d.endTime <= d.startTime) return "End time must be later than start time.";
      return "";
    case "makeup":
      return d.makeup ? "" : "Choose YES or NO.";
    case "makeupLocation":
      return d.makeupLocation.trim().length >= 3 ? "" : "Add your makeup location link or address.";
    case "outdoor":
      return d.outdoor ? "" : "Choose YES or NO.";
    case "outdoorLocation":
      return d.outdoorLocation.trim().length >= 3 ? "" : "Add your outdoor photoshoot location link or address.";
    case "name":
      return d.name.trim().length >= 2 ? "" : "Tell us what we should call you.";
    case "phone":
      return isValidMalaysiaPhone(d.phone) ? "" : "Use a Malaysian phone number, for example +60123456789.";
    default:
      return "";
  }
}

function isValidMalaysiaPhone(value) {
  const normalized = value.replace(/[\s-]/g, "");
  return /^(\+?60)1\d{8,9}$/.test(normalized);
}

function normalizePhone(value) {
  const stripped = value.replace(/[\s-]/g, "");
  if (stripped.startsWith("+60")) return stripped;
  if (stripped.startsWith("60")) return `+${stripped}`;
  if (stripped.startsWith("0")) return `+6${stripped}`;
  return stripped;
}

async function checkDateAvailability() {
  const error = validateFullQuestionnaire();
  if (error) {
    setStep(error.stepId);
    renderQuestion(error.message);
    return;
  }

  renderResult("checking");
  showScreen("result-screen");
  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(state.data.eventDate)}`);
    const payload = await response.json();
    state.availability = payload;
    saveState();
    if (!response.ok || payload.status === "error") {
      renderResult("error");
      return;
    }
    renderResult(payload.status);
  } catch {
    state.availability = { status: "error", date: state.data.eventDate };
    saveState();
    renderResult("error");
  }
}

async function fetchAvailabilityForSelectedDate() {
  const response = await fetch(`/api/availability?date=${encodeURIComponent(state.data.eventDate)}`);
  const payload = await response.json();
  state.availability = payload;
  saveState();
  if (!response.ok || payload.status === "error") return "error";
  return payload.status;
}

function validateFullQuestionnaire() {
  for (const stepId of getSteps().filter((item) => item !== "summary")) {
    state.stepId = stepId;
    const message = validateCurrentStep();
    if (message) return { stepId, message };
  }
  state.data.phone = normalizePhone(state.data.phone);
  state.selectedPackageId = EVENT_TO_PACKAGE[state.data.eventType] ?? "";
  saveState();
  return null;
}

function renderResult(status) {
  const result = document.getElementById("result-screen");
  if (status === "checking") {
    result.innerHTML = `
      <div class="result-inner">
        <div class="loader-mark" aria-hidden="true"></div>
        <p class="eyebrow">ONE MOMENT</p>
        <h2>CHECKING<br>YOUR DATE</h2>
        <p>We're checking Antara Akad's calendar 🤍</p>
      </div>
    `;
    return;
  }

  if (status === "available") {
    result.innerHTML = `
      <div class="result-inner">
        <p class="eyebrow">YOUR DATE</p>
        <h2>IS<br>AVAILABLE</h2>
        <span class="result-date">${formatShortDate(state.data.eventDate)}</span>
        <p>Good news 🤍 Antara Akad is currently available for your event date.</p>
        <button class="btn primary" type="button" data-action="choose-package">CHOOSE YOUR PACKAGE →</button>
      </div>
    `;
    return;
  }

  if (status === "unavailable") {
    result.innerHTML = `
      <div class="result-inner">
        <p class="eyebrow">YOUR DATE</p>
        <h2>FULLY<br>BOOKED</h2>
        <span class="result-date">${formatShortDate(state.data.eventDate)}</span>
        <p><strong>We're very sorry 😔</strong></p>
        <p>Antara Akad is already booked on your selected date.</p>
        <button class="btn primary" type="button" data-action="try-another-date">TRY ANOTHER DATE</button>
        <button class="btn ghost" type="button" data-action="contact-us">CONTACT US</button>
      </div>
    `;
    return;
  }

  result.innerHTML = `
    <div class="result-inner">
      <p class="eyebrow">CALENDAR</p>
      <h2>WE COULDN'T<br>CONFIRM YOUR DATE</h2>
      <p>You can still send us your details and we'll check it manually on WhatsApp.</p>
      <button class="btn primary" type="button" data-action="whatsapp-manual">CHECK VIA WHATSAPP</button>
    </div>
  `;
}

function renderAllPackages() {
  document.getElementById("all-package-list").innerHTML = Object.values(BUSINESS_CONFIG.packages)
    .map((pkg) => packageCard(pkg, "CHECK THIS DATE"))
    .join("");
}

function renderMatchedPackage() {
  const pkg = getSelectedPackage();
  document.getElementById("matched-package").innerHTML = packageCard(
    pkg,
    pkg.price === null ? "REQUEST QUOTATION" : "SELECT PACKAGE →",
    true,
  );
  showScreen("package-screen");
}

function packageCard(pkg, cta, single = false) {
  const price = pkg.price === null ? "CUSTOM<br>QUOTATION" : formatMoney(pkg.price);
  const normal = pkg.normalPrice === null ? "" : `<span class="normal-price">${formatMoney(pkg.normalPrice)}</span>`;
  const coverage = pkg.hours === null ? "CUSTOM COVERAGE" : `${pkg.hours} HOURS`;
  return `
    <article class="package-card" ${single ? "" : `data-package-event="${pkg.eventType}"`}>
      <h3>${pkg.name}</h3>
      <span class="coverage">${coverage}</span>
      <div class="package-price"><span class="promo-price">${price}</span>${normal}</div>
      <p>${pkg.description}</p>
      <ul>${pkg.includes.map((item) => `<li>${item}</li>`).join("")}</ul>
      <button class="btn" type="button" data-action="${single ? "select-package" : "start-package-flow"}" data-package-event="${pkg.eventType}">${cta}</button>
    </article>
  `;
}

function getSelectedPackage() {
  return BUSINESS_CONFIG.packages[state.selectedPackageId] ?? BUSINESS_CONFIG.packages[EVENT_TO_PACKAGE[state.data.eventType]] ?? BUSINESS_CONFIG.packages.nikah;
}

function renderAddons() {
  const pkg = getSelectedPackage();
  const included = new Set(pkg.includedAddons);
  const rows = [
    addonRow(BUSINESS_CONFIG.addons.template, included.has("template")),
    addonRow(BUSINESS_CONFIG.addons.highlight, included.has("highlight")),
    extraHourRow(),
  ];
  if (included.has("familyWish")) {
    rows.splice(2, 0, `<article class="addon-card"><div><h3>Family Wish</h3><p>A warm message segment for family.</p></div><span class="included-pill">INCLUDED</span></article>`);
  }
  document.getElementById("addon-list").innerHTML = rows.join("");
  document.getElementById("transport-ack").checked = state.addons.transportAck;
  renderSelectionSummary();
  showScreen("addon-screen");
}

function addonRow(addon, isIncluded) {
  if (isIncluded) {
    return `
      <article class="addon-card">
        <div><h3>${addon.includedLabel}</h3><p>${addon.description}</p></div>
        <span class="included-pill">INCLUDED</span>
      </article>
    `;
  }
  const selected = state.addons[addon.id] ? " selected" : "";
  return `
    <article class="addon-card">
      <div>
        <h3>${addon.name}</h3>
        <p>${formatMoney(addon.price)} · ${addon.description}</p>
      </div>
      <button class="toggle${selected}" type="button" data-addon-toggle="${addon.id}" aria-pressed="${state.addons[addon.id]}">
        ${state.addons[addon.id] ? "ADDED" : "ADD"}
      </button>
    </article>
  `;
}

function extraHourRow() {
  return `
    <article class="addon-card">
      <div>
        <h3>Extra Hour Coverage</h3>
        <p>RM60 / hour · + RM60 each</p>
      </div>
      <div class="stepper" aria-label="Extra hour coverage">
        <button type="button" data-extra-hour="-1" aria-label="Decrease extra hours">−</button>
        <output>${state.addons.extraHours}</output>
        <button type="button" data-extra-hour="1" aria-label="Increase extra hours">+</button>
      </div>
    </article>
  `;
}

function calculateTotal() {
  const pkg = getSelectedPackage();
  if (pkg.price === null) return null;
  let total = pkg.price;
  const included = new Set(pkg.includedAddons);
  if (state.addons.template && !included.has("template")) total += BUSINESS_CONFIG.addons.template.price;
  if (state.addons.highlight && !included.has("highlight")) total += BUSINESS_CONFIG.addons.highlight.price;
  total += state.addons.extraHours * BUSINESS_CONFIG.addons.extraHour.price;
  return total;
}

function selectionItems() {
  const pkg = getSelectedPackage();
  const included = new Set(pkg.includedAddons);
  const items = [{ name: pkg.name, value: formatMoney(pkg.price) }];
  if (included.has("template")) items.push({ name: "Instagram Story Template", value: "INCLUDED" });
  if (included.has("highlight")) items.push({ name: "1-Min Highlight Reel", value: "INCLUDED" });
  if (included.has("familyWish")) items.push({ name: "Family Wish", value: "INCLUDED" });
  if (state.addons.template && !included.has("template")) items.push({ name: "Customized Template", value: formatMoney(10) });
  if (state.addons.highlight && !included.has("highlight")) items.push({ name: "1-Min Highlight Reel", value: formatMoney(50) });
  if (state.addons.extraHours > 0) items.push({ name: `Extra Hour × ${state.addons.extraHours}`, value: formatMoney(state.addons.extraHours * 60) });
  return items;
}

function renderSelectionSummary() {
  const total = calculateTotal();
  document.getElementById("sticky-total").textContent = formatMoney(total);
  document.getElementById("selection-summary").innerHTML = `
    <p class="eyebrow">YOUR SELECTION</p>
    <h3>Estimated Total</h3>
    ${selectionItems().map((item) => `<div class="selection-line"><span>${item.name}</span><strong>${item.value}</strong></div>`).join("")}
    <div class="estimated-total">
      <strong>${formatMoney(total)}</strong>
      <small>+ Transportation Fee</small>
      <p>Transportation fee will be calculated separately based on location.</p>
    </div>
  `;
}

async function submitRequest() {
  const transportError = document.getElementById("transport-error");
  if (!state.addons.transportAck) {
    transportError.hidden = false;
    transportError.textContent = "Please acknowledge the transportation fee before submitting.";
    document.getElementById("transport-ack").focus();
    return;
  }
  transportError.hidden = true;

  const submitButton = document.getElementById("submit-request");
  submitButton.disabled = true;
  submitButton.textContent = "CHECKING DATE...";
  try {
    const latestStatus = await fetchAvailabilityForSelectedDate();
    if (latestStatus !== "available") {
      submitButton.disabled = false;
      submitButton.textContent = "SUBMIT REQUEST →";
      renderResult(latestStatus);
      showScreen("result-screen");
      return;
    }
  } catch {
    state.availability = { status: "error", date: state.data.eventDate };
    saveState();
    submitButton.disabled = false;
    submitButton.textContent = "SUBMIT REQUEST →";
    renderResult("error");
    showScreen("result-screen");
    return;
  }

  const message = buildWhatsAppMessage(false);
  sessionStorage.removeItem(STORAGE_KEY);
  window.location.href = `https://wa.me/${BUSINESS_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppMessage(manualOnly) {
  const pkg = getSelectedPackage();
  const total = calculateTotal();
  const paidAddons = selectionItems()
    .slice(1)
    .map((item) => `${item.name} - ${item.value}`);
  const addons = paidAddons.length ? paidAddons.join("\n") : "N/A";
  return [
    "Hi awak! 🤍",
    "",
    "Terima kasih sebab berminat dengan service WCC by Antara Akad.",
    "",
    "Untuk pakej dan details service, awak boleh refer pada link di bawah:",
    `🔗 ${BUSINESS_CONFIG.canvaLink}`,
    "",
    "Ini details event saya:",
    "",
    `👰🏻‍♀️ Name: ${safeText(state.data.name)}`,
    `📱 Phone number: ${safeText(state.data.phone)}`,
    "",
    `💍 Event type: ${safeText(state.data.eventType)}`,
    "",
    `🗓️ Event date: ${formatDate(state.data.eventDate)}`,
    `🕣 Start event time: ${formatTime(state.data.startTime)}`,
    `🕜 End event time: ${formatTime(state.data.endTime)}`,
    "",
    `📍 Makeup location: ${state.data.makeup === "YES" ? safeText(state.data.makeupLocation) : "N/A"}`,
    `📍 Outdoor photoshoot location: ${state.data.outdoor === "YES" ? safeText(state.data.outdoorLocation) : "N/A"}`,
    `📍 Event location: ${safeText(state.data.eventLocation)}`,
    "",
    "Pakej yang saya pilih:",
    "",
    `🤍 ${manualOnly ? "Manual availability check" : pkg.name}`,
    pkg.price === null || manualOnly ? "Custom quotation" : formatMoney(pkg.price),
    "",
    "Add-ons:",
    manualOnly ? "N/A" : addons,
    "",
    "Estimated Total:",
    manualOnly ? "To be checked manually" : formatMoney(total),
    "",
    "* Transportation Fee",
    "",
    "Saya faham transportation fee tidak termasuk dalam estimated total dan akan dikira berdasarkan lokasi majlis.",
    "Saya faham availability masih tertakluk kepada final confirmation by Antara Akad.",
    "",
    "Boleh kita proceed untuk review request saya ya 🤍",
  ].join("\n");
}

function safeText(value) {
  return value && String(value).trim() ? String(value).trim() : "N/A";
}

function safe(value) {
  return escapeHtml(safeText(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;

  const action = target.dataset.action;
  if (target.dataset.optionKey) {
    state.data[target.dataset.optionKey] = target.dataset.optionValue;
    if (target.dataset.optionKey === "eventType") state.selectedPackageId = EVENT_TO_PACKAGE[target.dataset.optionValue] ?? "";
    if (target.dataset.optionKey === "makeup" && target.dataset.optionValue === "NO") state.data.makeupLocation = "";
    if (target.dataset.optionKey === "outdoor" && target.dataset.optionValue === "NO") state.data.outdoorLocation = "";
    saveState();
    renderQuestion();
    return;
  }

  if (target.dataset.addonToggle) {
    state.addons[target.dataset.addonToggle] = !state.addons[target.dataset.addonToggle];
    saveState();
    renderAddons();
    return;
  }

  if (target.dataset.extraHour) {
    state.addons.extraHours = Math.max(0, state.addons.extraHours + Number(target.dataset.extraHour));
    saveState();
    renderAddons();
    return;
  }

  switch (action) {
    case "start-flow":
      startFlow();
      break;
    case "start-package-flow":
      startFlow(target.dataset.packageEvent);
      break;
    case "skip-explore":
      showScreen("main-screen");
      break;
    case "flow-back":
      previousStep();
      break;
    case "continue-flow": {
      const error = validateCurrentStep();
      if (error) renderQuestion(error);
      else nextStep();
      break;
    }
    case "edit-details":
    case "try-another-date":
      setStep(action === "try-another-date" ? "dateTime" : "eventType");
      showScreen("flow-screen");
      break;
    case "check-availability":
      checkDateAvailability();
      break;
    case "choose-package":
      renderMatchedPackage();
      break;
    case "result-back":
      showScreen("result-screen");
      break;
    case "package-back":
      renderMatchedPackage();
      break;
    case "select-package":
      state.selectedPackageId = EVENT_TO_PACKAGE[target.dataset.packageEvent] ?? state.selectedPackageId;
      saveState();
      renderAddons();
      break;
    case "contact-us":
    case "whatsapp-manual":
      window.location.href = `https://wa.me/${BUSINESS_CONFIG.whatsapp}?text=${encodeURIComponent(buildWhatsAppMessage(true))}`;
      break;
  }
});

document.addEventListener("input", (event) => {
  const field = event.target.dataset?.field;
  if (!field) return;
  state.data[field] = event.target.value;
  saveState();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "transport-ack") {
    state.addons.transportAck = event.target.checked;
    saveState();
    renderSelectionSummary();
  }
});

document.getElementById("submit-request").addEventListener("click", submitRequest);

renderAllPackages();
showScreen("welcome-screen");
