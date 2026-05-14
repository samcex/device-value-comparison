const vm = require("node:vm");

const VERKAUFEN_BASE_URL = "https://www.verkaufen.ch";
const MOBILEUP_BASE_URL = "https://www.mobileup.ch";
const CACHE_TTL_MS = 1000 * 60 * 20;
const cache = new Map();

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  response.end(JSON.stringify(payload));
}

async function fetchText(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  const result = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 DeviceValueFinder/1.0",
      Accept: "text/html,application/javascript,application/json",
    },
  });

  if (!result.ok) {
    throw new Error(`Fetch failed ${result.status} for ${url}`);
  }

  const value = await result.text();
  cache.set(url, { timestamp: Date.now(), value });
  return value;
}

function normalizeModelName(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/^(apple|samsung)\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveVerkaufenArticlePath(model) {
  const searchUrl = `${VERKAUFEN_BASE_URL}/api/ArticleApi/ListBuyArticles/${encodeURIComponent(model)}`;
  const payload = await fetchText(searchUrl);
  const matches = JSON.parse(payload);
  const normalizedTarget = normalizeModelName(model);

  const exact = matches.find((item) => normalizeModelName(item.Name) === normalizedTarget);
  const selected = exact || matches[0];

  if (!selected?.Url) {
    throw new Error(`No verkaufen.ch article found for ${model}`);
  }

  return selected.Url;
}

function makeJqueryShim() {
  return {
    map: (items, iteratee) => Array.from(items).map(iteratee),
    each: (items, iteratee) => Array.from(items).forEach((value, index) => iteratee(index, value)),
    grep: (items, predicate) => Array.from(items).filter(predicate),
  };
}

function selectAnswer(reduction, { storage, condition }) {
  const key = reduction.key || "";
  const conditionMap = {
    excellent: "Wie neu",
    good: "Sehr gut",
    fair: "Gut",
  };

  if (key.includes("Speicherplatz")) {
    const target = Number(storage) >= 1024 ? "1TB" : `${storage}GB`;
    return reduction.answers.find((answer) => answer.translation?.de?.replace(/\s/g, "") === target);
  }

  if (key.includes("Funktion")) {
    return reduction.answers.find((answer) => answer.translation?.de === "Ja");
  }

  if (key.includes("Akku")) {
    return reduction.answers.find((answer) => answer.key.endsWith("AkkuJa"));
  }

  if (key.includes("Vorderseite") || key.includes("Mittelcover") || key.includes("Rückseite")) {
    return reduction.answers.find((answer) => answer.translation?.de === conditionMap[condition]);
  }

  return reduction.answers.find((answer) => answer.autoSelect) || reduction.answers[0];
}

async function getVerkaufenQuote({ model, storage, condition }) {
  const articlePath = await resolveVerkaufenArticlePath(model);
  const pageUrl = `${VERKAUFEN_BASE_URL}${articlePath}`;
  const pageHtml = await fetchText(pageUrl);

  const calculatorBundlePath = pageHtml.match(/<script src="([^"]*purchase\.calculator[^"]*)"/)?.[1];
  const calculationPath = pageHtml.match(/<script type="text\/javascript" src="([^"]*buycalculation[^"]*)"/)?.[1];

  if (!calculatorBundlePath || !calculationPath) {
    throw new Error(`Could not find calculator scripts for ${model}`);
  }

  const [calculatorBundle, calculationData] = await Promise.all([
    fetchText(`${VERKAUFEN_BASE_URL}${calculatorBundlePath}`),
    fetchText(`${VERKAUFEN_BASE_URL}${calculationPath}`),
  ]);

  const context = {
    frontend: {},
    jQuery: makeJqueryShim(),
  };
  context.$ = context.jQuery;
  vm.createContext(context);
  vm.runInContext(calculatorBundle, context);
  vm.runInContext(calculationData, context);

  const answers = context.purchaseCalculatorData.reductions
    .map((reduction) => selectAnswer(reduction, { storage, condition }))
    .filter(Boolean)
    .map((answer) => answer.id);

  const calculator = new context.frontend.purchase.Calculator(context.purchaseCalculatorData);
  const quote = calculator.calculate(answers, "de");

  if (!quote.finished || typeof quote.finalPrice !== "number") {
    throw new Error(`Calculator did not finish for ${model}`);
  }

  return {
    provider: "verkaufen",
    providerName: "verkaufen.ch",
    value: quote.finalPrice,
    valueText: quote.finalPriceText,
    model,
    storage: Number(storage),
    condition,
    articleUrl: pageUrl,
    source: "live",
    fetchedAt: new Date().toISOString(),
  };
}

function slugifyMobileupModel(model) {
  return model
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/\bgen\b/g, "")
    .replace(/\b3rd\b/g, "2022")
    .replace(/\b2nd\b/g, "2020")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMobileupPath(model) {
  const slug = slugifyMobileupModel(model);
  const brandPath = model.toLowerCase().includes("galaxy") ? "samsung" : "iphone";
  const normalizedSlug = brandPath === "samsung" && /^samsung-galaxy-s\d{2}$/.test(slug) ? `${slug}-5g` : slug;
  return `/verkaufen/smartphones/${brandPath}/${normalizedSlug}`;
}

function extractMobileupVariations(html) {
  const marker = '\\"buybackVariationsServer\\":';
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error("mobileup buyback variation data not found");
  }

  let depth = 0;
  let end = -1;
  for (let index = start + marker.length; index < html.length; index += 1) {
    const character = html[index];
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error("mobileup buyback variation data was incomplete");
  }

  const escapedJson = html.slice(start + marker.length, end);
  return JSON.parse(escapedJson.replace(/\\"/g, '"'));
}

function calculateMobileupPrice(variation, condition) {
  const details = variation.buybackTechDetails || {};
  const conditionKeys = {
    excellent: {
      screenCondition: "perfectScreen",
      caseCondition: "perfectCase",
      batteryCondition: "perfectBattery",
    },
    good: {
      screenCondition: "displayDeductionLightScratches",
      caseCondition: "caseDeductionLightScratches",
      batteryCondition: "perfectBattery",
    },
    fair: {
      screenCondition: "displayDeductionHeavyScratches",
      caseCondition: "caseDeductionHeavyScratches",
      batteryCondition: "batteryDeduction",
    },
  }[condition] || {
    screenCondition: "displayDeductionLightScratches",
    caseCondition: "caseDeductionLightScratches",
    batteryCondition: "perfectBattery",
  };

  let price = variation.maxBuybackPrice || 0;
  for (const value of Object.values(conditionKeys)) {
    if (value !== "perfectScreen" && value !== "perfectCase" && value !== "perfectBattery") {
      price -= Number(details[value] || 0);
    }
  }

  return Math.max(variation.minBuybackPrice || 0, price);
}

async function getMobileupQuote({ model, storage, condition }) {
  const path = getMobileupPath(model);
  const pageUrl = `${MOBILEUP_BASE_URL}${path}`;
  const pageHtml = await fetchText(pageUrl);
  const variations = extractMobileupVariations(pageHtml);
  const targetStorage = Number(storage) >= 1024 ? 1000 : Number(storage);
  const selectedVariation =
    variations.find((variation) => Number(variation.buybackTechDetails?.storageSize) === targetStorage) ||
    variations[0];

  if (!selectedVariation) {
    throw new Error(`No mobileup buyback variation found for ${model}`);
  }

  const value = calculateMobileupPrice(selectedVariation, condition);

  return {
    provider: "mobileup",
    providerName: "mobileup.ch",
    value,
    valueText: `CHF ${value}`,
    model,
    storage: Number(storage),
    condition,
    articleUrl: pageUrl,
    source: "live",
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const provider = url.searchParams.get("provider");
    const model = url.searchParams.get("model");
    const storage = url.searchParams.get("storage") || "128";
    const condition = url.searchParams.get("condition") || "excellent";

    if (!model) {
      sendJson(response, 400, { error: "Missing model parameter." });
      return;
    }

    const quote =
      provider === "verkaufen"
        ? await getVerkaufenQuote({ model, storage, condition })
        : provider === "mobileup"
          ? await getMobileupQuote({ model, storage, condition })
          : null;

    if (!quote) {
      sendJson(response, 501, { error: "Live quote provider is not implemented." });
      return;
    }

    sendJson(response, 200, quote);
  } catch (error) {
    sendJson(response, 502, {
      error: "Live quote unavailable.",
      detail: error.message,
    });
  }
};
