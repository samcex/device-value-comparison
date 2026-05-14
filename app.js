const modelCatalog = {
  iphone: [
    { name: "iPhone 15 Pro Max", base: 515 },
    { name: "iPhone 15 Pro", base: 455 },
    { name: "iPhone 15 Plus", base: 375 },
    { name: "iPhone 15", base: 345 },
    { name: "iPhone 14 Pro Max", base: 360 },
    { name: "iPhone 14 Pro", base: 310 },
    { name: "iPhone 14 Plus", base: 245 },
    { name: "iPhone 14", base: 225 },
    { name: "iPhone 13 Pro Max", base: 255 },
    { name: "iPhone 13 Pro", base: 225 },
    { name: "iPhone 13 Mini", base: 145 },
    { name: "iPhone 13", base: 165 },
    { name: "iPhone 12 Pro Max", base: 185 },
    { name: "iPhone 12 Pro", base: 160 },
    { name: "iPhone 12 Mini", base: 90 },
    { name: "iPhone 12", base: 110 },
    { name: "iPhone 11 Pro Max", base: 120 },
    { name: "iPhone 11 Pro", base: 105 },
    { name: "iPhone 11", base: 82 },
    { name: "iPhone XS Max", base: 65 },
    { name: "iPhone XS", base: 55 },
    { name: "iPhone XR", base: 52 },
    { name: "iPhone SE 3rd Gen", base: 75 },
    { name: "iPhone SE 2nd Gen", base: 38 },
  ],
  samsung: [
    { name: "Galaxy S25 Ultra", base: 555 },
    { name: "Galaxy S25+", base: 460 },
    { name: "Galaxy S25", base: 395 },
    { name: "Galaxy S24 Ultra", base: 440 },
    { name: "Galaxy S24+", base: 360 },
    { name: "Galaxy S24", base: 320 },
    { name: "Galaxy S23 Ultra", base: 285 },
    { name: "Galaxy S23+", base: 225 },
    { name: "Galaxy S23", base: 205 },
    { name: "Galaxy S23 FE", base: 145 },
    { name: "Galaxy S22 Ultra", base: 210 },
    { name: "Galaxy S22+", base: 175 },
    { name: "Galaxy S22", base: 155 },
    { name: "Galaxy S21 Ultra", base: 150 },
    { name: "Galaxy S21+", base: 120 },
    { name: "Galaxy S21", base: 105 },
    { name: "Galaxy S21 FE", base: 90 },
    { name: "Galaxy Z Fold6", base: 590 },
    { name: "Galaxy Z Fold5", base: 430 },
    { name: "Galaxy Z Fold4", base: 285 },
    { name: "Galaxy Z Flip6", base: 365 },
    { name: "Galaxy Z Flip5", base: 260 },
    { name: "Galaxy Z Flip4", base: 155 },
    { name: "Galaxy A55", base: 115 },
    { name: "Galaxy A54", base: 90 },
    { name: "Galaxy A53", base: 65 },
  ],
  ipad: [
    { name: "iPad Pro 13 M4", base: 980 },
    { name: "iPad Pro 11 M4", base: 760 },
    { name: "iPad Pro 12.9 M2", base: 620 },
    { name: "iPad Pro 11 M2", base: 520 },
    { name: "iPad Pro 12.9 M1", base: 490 },
    { name: "iPad Pro 11 M1", base: 410 },
    { name: "iPad Air M2", base: 500 },
    { name: "iPad Air M1", base: 390 },
    { name: "iPad Air 4th Gen", base: 260 },
    { name: "iPad 10th Gen", base: 250 },
    { name: "iPad 9th Gen", base: 170 },
    { name: "iPad Mini 6", base: 280 },
  ],
  macbook: [
    { name: "MacBook Pro 16 M3 Max", base: 1900 },
    { name: "MacBook Pro 16 M3 Pro", base: 1550 },
    { name: "MacBook Pro 14 M3", base: 1250 },
    { name: "MacBook Pro 14 M2 Pro", base: 1050 },
    { name: "MacBook Pro 16 M1 Pro", base: 980 },
    { name: "MacBook Pro 14 M1 Pro", base: 890 },
    { name: "MacBook Air 15 M3", base: 930 },
    { name: "MacBook Air 13 M3", base: 790 },
    { name: "MacBook Air 15 M2", base: 760 },
    { name: "MacBook Air M2", base: 690 },
    { name: "MacBook Pro 13 M1", base: 580 },
    { name: "MacBook Air M1", base: 450 },
  ],
};

const providerAdapters = [
  {
    id: "verkaufen",
    name: "verkaufen.ch",
    speed: "Fast bank transfer",
    inspection: "Standard condition check",
    payoutBias: 1,
    categoryBias: { iphone: 1, samsung: 0.96, ipad: 0.98, macbook: 0.98 },
  },
  {
    id: "mobileup",
    name: "mobileup.ch",
    speed: "Prepaid shipping label",
    inspection: "Strong mobile-device pricing",
    payoutBias: 0.98,
    categoryBias: { iphone: 1.01, samsung: 1.03, ipad: 0.97, macbook: 0.92 },
  },
  {
    id: "revendo",
    name: "revendo.ch",
    speed: "Store and shipping options",
    inspection: "Apple-focused refurbishment",
    payoutBias: 0.99,
    categoryBias: { iphone: 1.03, samsung: 0.9, ipad: 1.01, macbook: 1.04 },
  },
];

const storageMultiplier = {
  64: 0.92,
  128: 1,
  256: 1.08,
  512: 1.17,
  1024: 1.27,
};

const conditionMultiplier = {
  excellent: 1,
  good: 0.88,
  fair: 0.68,
};

const form = document.querySelector("#quote-form");
const categorySelect = document.querySelector("#category");
const modelSelect = document.querySelector("#model");
const quotesEl = document.querySelector("#quotes");

function formatCHF(value) {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(value);
}

function populateModels() {
  const models = modelCatalog[categorySelect.value];
  modelSelect.replaceChildren(
    ...models.map((model) => {
      const option = document.createElement("option");
      option.value = model.name;
      option.textContent = model.name;
      return option;
    }),
  );
}

function getSelectedDevice() {
  const category = categorySelect.value;
  const model = modelCatalog[category].find((item) => item.name === modelSelect.value);
  const formData = new FormData(form);

  return {
    category,
    model: model.name,
    base: model.base,
    storage: Number(formData.get("storage")),
    condition: formData.get("condition"),
    age: Number(formData.get("age")),
    hasBox: document.querySelector("#has-box").checked,
    hasCharger: document.querySelector("#has-charger").checked,
    unlocked: document.querySelector("#unlocked").checked,
  };
}

function calculateReadiness(device) {
  let score = 74;
  if (device.hasBox) score += 6;
  if (device.hasCharger) score += 5;
  if (device.unlocked) score += 8;
  if (device.condition === "excellent") score += 7;
  if (device.condition === "fair") score -= 9;
  return Math.max(42, Math.min(100, score));
}

function estimateQuote(provider, device) {
  const accessoryAdjustment = (device.hasBox ? 4 : 0) + (device.hasCharger ? 4 : 0) + (device.unlocked ? 8 : -16);
  const agePenalty = Math.max(0.78, 1 - device.age * 0.05);
  const providerAdjustment = { verkaufen: -2, mobileup: -2, revendo: 5 }[provider.id] ?? 0;
  const baseline =
    device.base *
    storageMultiplier[device.storage] *
    conditionMultiplier[device.condition] *
    agePenalty *
    provider.payoutBias *
    provider.categoryBias[device.category];

  return Math.max(20, Math.round((baseline + accessoryAdjustment + providerAdjustment) / 5) * 5);
}

function getQuotes(device) {
  return providerAdapters
    .map((provider) => ({
      ...provider,
      value: estimateQuote(provider, device),
    }))
    .sort((a, b) => b.value - a.value);
}

function renderQuotes(device) {
  const quotes = getQuotes(device);
  const best = quotes[0];
  const lowest = quotes[quotes.length - 1];
  const readiness = calculateReadiness(device);

  document.querySelector("#results-title").textContent = `${device.model}, ${device.storage} GB`;
  document.querySelector("#best-value").textContent = formatCHF(best.value);
  document.querySelector("#best-provider").textContent = best.name;
  document.querySelector("#spread-value").textContent = formatCHF(best.value - lowest.value);
  document.querySelector("#readiness-value").textContent = `${readiness}%`;
  document.querySelector("#confidence-pill").textContent = `${device.condition} condition`;

  quotesEl.replaceChildren(
    ...quotes.map((quote, index) => {
      const article = document.createElement("article");
      article.className = "quote-card";
      const percentage = Math.round((quote.value / best.value) * 100);
      article.innerHTML = `
        <div class="quote-main">
          <div class="provider-row">
            <span class="rank-badge">${index + 1}</span>
            <div>
              <div class="provider-name">${quote.name}</div>
              <small>${quote.inspection}</small>
            </div>
          </div>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="quote-meta">
            <span class="meta-chip">${quote.speed}</span>
            <span class="meta-chip">${percentage}% of top offer</span>
            <span class="meta-chip">${index === 0 ? "Best value" : `${formatCHF(best.value - quote.value)} below best`}</span>
          </div>
        </div>
        <div class="quote-value">
          <strong>${formatCHF(quote.value)}</strong>
          <span>${index === 0 ? "Recommended" : "Comparable offer"}</span>
        </div>
      `;
      return article;
    }),
  );
}

categorySelect.addEventListener("change", () => {
  populateModels();
  renderQuotes(getSelectedDevice());
});

form.addEventListener("change", () => renderQuotes(getSelectedDevice()));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderQuotes(getSelectedDevice());
});

populateModels();
renderQuotes(getSelectedDevice());
