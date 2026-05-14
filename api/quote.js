const vm = require("node:vm");

const VERKAUFEN_BASE_URL = "https://www.verkaufen.ch";
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

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const provider = url.searchParams.get("provider");
    const model = url.searchParams.get("model");
    const storage = url.searchParams.get("storage") || "128";
    const condition = url.searchParams.get("condition") || "excellent";

    if (provider !== "verkaufen") {
      sendJson(response, 501, { error: "Only verkaufen.ch live quotes are implemented right now." });
      return;
    }

    if (!model) {
      sendJson(response, 400, { error: "Missing model parameter." });
      return;
    }

    const quote = await getVerkaufenQuote({ model, storage, condition });
    sendJson(response, 200, quote);
  } catch (error) {
    sendJson(response, 502, {
      error: "Live quote unavailable.",
      detail: error.message,
    });
  }
};
