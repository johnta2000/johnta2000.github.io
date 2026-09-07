#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MONITOR_ID = "hertz-las-may-2027";
export const CRITERIA_VERSION = 2;
export const THRESHOLD_DAILY_RATE_USD = 120;
export const BOOKING_URL = "https://www.hertz.com/us/en/book/vehicles?pid=LAST11&pdate=2027-05-20T19%3A00%3A00&did=LAST11&ddate=2027-05-24T17%3A00%3A00&CDP=2278478&travelType=LEISURE&ownershipType=CORPORATE&age=25";
export const ITINERARY = Object.freeze({
  pickupLocation: "Las Vegas - Harry Reid International Airport (LAS)",
  pickupAt: "2027-05-20T19:00:00-07:00",
  returnLocation: "Las Vegas - Harry Reid International Airport (LAS)",
  returnAt: "2027-05-24T17:00:00-07:00",
  timezone: "America/Los_Angeles",
  rateContext: "CDP 2278478 · leisure · corporate ownership · age 25",
});
export const VEHICLE_CRITERIA = Object.freeze({
  minPassengers: 6,
  maxPassengers: 12,
  excludedVehicleTypes: ["pickup", "truck"],
  description: "6–12 passenger vehicles, excluding pickups and trucks",
});

const ROOT = resolve(import.meta.dirname, "../..");
const DEFAULT_HISTORY_PATH = resolve(ROOT, ".github/monitoring-data/hertz-las-may-2027-history.json");
const DEFAULT_PUBLIC_HISTORY_PATH = resolve(ROOT, "hertz-las-may-2027/history.json");
const DEFAULT_PUBLIC_CSV_PATH = resolve(ROOT, "hertz-las-may-2027/history.csv");
const CARD_SELECTOR = [
  '[class~="MuiCard-root"]',
  '[data-testid*="vehicle-card" i]',
  '[data-testid*="vehicleCard" i]',
  '[data-qa*="vehicle-card" i]',
  '[class*="vehicle-card" i]',
  '[class*="vehicleCard"]',
  "article",
].join(",");

const normalizeSpace = (value = "") => String(value).replace(/\s+/g, " ").trim();

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    historyPath: process.env.HERTZ_HISTORY_PATH || DEFAULT_HISTORY_PATH,
    publicHistoryPath: process.env.HERTZ_PUBLIC_HISTORY_PATH || DEFAULT_PUBLIC_HISTORY_PATH,
    publicCsvPath: process.env.HERTZ_PUBLIC_CSV_PATH || DEFAULT_PUBLIC_CSV_PATH,
    screenshotPath: process.env.HERTZ_SCREENSHOT_PATH || null,
    htmlPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--history") options.historyPath = resolve(argv[++index]);
    else if (argument === "--public-history") options.publicHistoryPath = resolve(argv[++index]);
    else if (argument === "--public-csv") options.publicCsvPath = resolve(argv[++index]);
    else if (argument === "--screenshot") options.screenshotPath = resolve(argv[++index]);
    else if (argument === "--html") options.htmlPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const parsePassengerCapacity = (value) => {
  const capacity = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(capacity) && capacity > 0 && capacity <= 30 ? capacity : null;
};

export function isEligibleVehicleCard(card) {
  const passengerCapacity = parsePassengerCapacity(card?.passengerCapacity);
  const vehicleDescription = normalizeSpace(`${card?.vehicleClass || ""} ${card?.vehicle || ""}`);
  const excludedVehicleType = VEHICLE_CRITERIA.excludedVehicleTypes.find((type) => new RegExp(`\\b${type}s?\\b`, "i").test(vehicleDescription)) ?? null;
  return {
    eligible: passengerCapacity != null
      && passengerCapacity >= VEHICLE_CRITERIA.minPassengers
      && passengerCapacity <= VEHICLE_CRITERIA.maxPassengers
      && excludedVehicleType == null,
    passengerCapacity,
    excludedVehicleType,
  };
}

export function selectLowestVisibleCard(cards) {
  const pricedCards = cards
    .filter((card) => card?.visible === true)
    .map((card) => ({
      ...card,
      dailyRateUsd: Number(card.dailyRateUsd),
      estimatedTotalUsd: card.estimatedTotalUsd == null ? null : Number(card.estimatedTotalUsd),
      vehicle: normalizeSpace(card.vehicle) || "Unknown vehicle",
      vehicleClass: normalizeSpace(card.vehicleClass) || null,
      passengerCapacity: parsePassengerCapacity(card.passengerCapacity),
      evidence: normalizeSpace(card.evidence).slice(0, 700),
      taxesFeesVisibility: card.taxesFeesVisibility || "not_visible",
    }))
    .filter((card) => Number.isFinite(card.dailyRateUsd) && card.dailyRateUsd > 0 && card.dailyRateUsd < 10_000)
    .sort((left, right) => left.dailyRateUsd - right.dailyRateUsd);
  const eligibleCards = pricedCards.filter((card) => isEligibleVehicleCard(card).eligible);
  return { lowest: eligibleCards[0] ?? null, validCards: eligibleCards, pricedCards };
}

export function parseFixtureHtml(html) {
  const cards = [];
  const cardPattern = /<(article|div)\b([^>]*\bdata-monitor-vehicle-card(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(cardPattern)) {
    const attributes = match[2];
    const body = match[3].replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
    const hidden = /\b(?:hidden|aria-hidden\s*=\s*["']true["'])/i.test(attributes) || /display\s*:\s*none/i.test(attributes);
    const rate = body.match(/(?:^|\n)\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\n\s*)?\/\s*day\b/im);
    const total = body.match(/\b(?:est(?:imated)?\.?\s+)?total\b[^$\n]{0,45}\$\s*([\d,]+(?:\.\d{2})?)/i)
      || body.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:est(?:imated)?\.?\s+)?total\b/i);
    const lines = body.split(/\n+/).map(normalizeSpace).filter(Boolean);
    const vehicle = lines.find((line) => /(?:sedan|suv|pickup|truck|electric|van|convertible|vehicle|manager special)/i.test(line));
    const capacityAttribute = attributes.match(/\bdata-monitor-passengers\s*=\s*["']?(\d{1,2})/i);
    const capacityText = body.match(/\b(\d{1,2})\s*(?:passengers?|seats?|seater)\b/i);
    if (rate) {
      cards.push({
        visible: !hidden,
        dailyRateUsd: Number(rate[1].replaceAll(",", "")),
        estimatedTotalUsd: total ? Number(total[1].replaceAll(",", "")) : null,
        vehicle: vehicle || "Unknown vehicle",
        vehicleClass: vehicle || null,
        passengerCapacity: Number(capacityAttribute?.[1] || capacityText?.[1]) || null,
        taxesFeesVisibility: /tax(?:es)?|fees?/i.test(body) ? "visible_in_card" : "not_visible",
        evidence: normalizeSpace(body),
      });
    }
  }
  return cards;
}

async function extractVisibleVehicleCards(page) {
  return page.locator(CARD_SELECTOR).evaluateAll((elements) => {
    const normalize = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const visible = (element) => {
      if (!element || element.nodeType !== 1) return false;
      if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const results = [];
    for (const card of elements) {
      if (!visible(card)) continue;
      const text = card.innerText;
      const rate = text.match(/(?:^|\n)\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:\n\s*)?\/\s*day\b/im);
      if (!rate) continue;
      const total = text.match(/\b(?:est(?:imated)?\.?\s+)?total\b[^$\n]{0,45}\$\s*([\d,]+(?:\.\d{2})?)/i)
        || text.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:est(?:imated)?\.?\s+)?total\b/i);
      const headings = [...card.querySelectorAll("h1,h2,h3,h4,h6,[data-testid*=vehicle-name i],[class*=vehicle-name i]")]
        .filter(visible)
        .map((element) => normalize(element.innerText))
        .filter(Boolean);
      const lines = text.split(/\n+/).map(normalize).filter(Boolean);
      const model = lines.find((line) => /\bor similar$/i.test(line));
      const fallback = lines.find((line) => /(?:sedan|suv|pickup|truck|electric|van|convertible|vehicle|manager special)/i.test(line));
      const vehicle = headings[0] && model && headings[0] !== model ? `${headings[0]} — ${model}` : headings[0] || model || fallback;
      const vehicleClass = headings[0] || fallback || null;
      const featureRoot = card.querySelector('[id$="-vehicle_features"]');
      const capacityFromFeature = featureRoot?.firstElementChild?.innerText?.match(/\b(\d{1,2})\b/)?.[1];
      const capacityFromName = vehicleClass?.match(/\b(\d{1,2})\s*(?:pass(?:enger)?|seat(?:er)?)\b/i)?.[1];
      results.push({
        visible: true,
        dailyRateUsd: Number(rate[1].replaceAll(",", "")),
        estimatedTotalUsd: total ? Number(total[1].replaceAll(",", "")) : null,
        vehicle: vehicle || "Unknown vehicle",
        vehicleClass,
        passengerCapacity: Number(capacityFromFeature || capacityFromName) || null,
        taxesFeesVisibility: /tax(?:es)?|fees?/i.test(text) ? "visible_in_card" : "not_visible",
        evidence: normalize(text).slice(0, 700),
      });
    }
    return results;
  });
}

async function collectWithBrowser({ screenshotPath }) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: process.env.HERTZ_HEADLESS !== "false",
    channel: process.env.HERTZ_BROWSER_CHANNEL || undefined,
  });
  try {
    const chromeVersion = browser.version();
    const context = await browser.newContext({
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      viewport: { width: 1440, height: 1100 },
      userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    const page = await context.newPage();
    const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(normalizeSpace(message.text()).slice(0, 300));
    });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(normalizeSpace(error.message).slice(0, 300)));
    page.on("requestfailed", (request) => diagnostics.failedRequests.push(normalizeSpace(`${request.method()} ${request.url()} — ${request.failure()?.errorText || "failed"}`).slice(0, 500)));
    const response = await page.goto(BOOKING_URL, { waitUntil: "domcontentloaded", timeout: 75_000 });
    await page.getByRole("button", { name: "Close", exact: true }).click({ timeout: 5_000 }).catch(() => {});
    await page.locator('[class~="MuiCard-root"], [data-testid*="vehicle-card" i], [data-qa*="vehicle-card" i]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
    for (let step = 0; step < 5; step += 1) {
      await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.8, 600)));
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const cards = await extractVisibleVehicleCards(page);
    if (screenshotPath) {
      await mkdir(resolve(screenshotPath, ".."), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15_000 }).catch(() => {});
    }
    return {
      cards,
      checkedUrl: page.url(),
      pageTitle: await page.title(),
      httpStatus: response?.status() ?? null,
      pageEvidence: normalizeSpace(await page.locator("body").innerText()).slice(0, 700),
      diagnostics: {
        consoleErrors: diagnostics.consoleErrors.slice(0, 5),
        pageErrors: diagnostics.pageErrors.slice(0, 5),
        failedRequests: diagnostics.failedRequests.slice(0, 8),
      },
    };
  } finally {
    await browser.close();
  }
}

async function collectFromFixture(htmlPath) {
  const html = await readFile(htmlPath, "utf8");
  return {
    cards: parseFixtureHtml(html),
    checkedUrl: BOOKING_URL,
    pageTitle: "Fixture",
    httpStatus: 200,
    pageEvidence: normalizeSpace(html.replace(/<[^>]+>/g, " ")).slice(0, 700),
  };
}

async function readHistory(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      monitorId: MONITOR_ID,
      thresholdDailyRateUsd: THRESHOLD_DAILY_RATE_USD,
      bookingUrl: BOOKING_URL,
      itinerary: ITINERARY,
      runs: [],
    };
  }
}

async function writeHistory(path, history) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

const csvCell = (value) => {
  if (value == null) return "";
  const text = String(value).replace(/\u001b\[[0-9;]*m/g, "").replace(/[\r\n]+/g, " ");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function historyToCsv(history) {
  const columns = [
    "checkedAt", "status", "criteriaVersion", "passengerCapacity", "lowestVisibleDailyRateUsd",
    "vehicleClass", "vehicle", "estimatedTotalUsd", "taxesFeesVisibility", "eligibleVehicleCardCount",
    "visiblePricedVehicleCardCount", "source", "checkedUrl", "error",
  ];
  return `${[
    columns.join(","),
    ...(history.runs || []).map((run) => columns.map((column) => csvCell(run[column])).join(",")),
  ].join("\n")}\n`;
}

async function writeText(path, text) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, text, "utf8");
  await rename(temporaryPath, path);
}

export async function runMonitor(options = {}) {
  const startedAt = new Date();
  const started = performance.now();
  const historyPath = options.historyPath || DEFAULT_HISTORY_PATH;
  const history = await readHistory(historyPath);
  let run;

  try {
    const result = options.htmlPath
      ? await collectFromFixture(options.htmlPath)
      : await collectWithBrowser({ screenshotPath: options.screenshotPath });
    const { lowest, validCards, pricedCards } = selectLowestVisibleCard(result.cards);
    if (!lowest) {
      run = {
        id: startedAt.toISOString(),
        checkedAt: startedAt.toISOString(),
        checkedUrl: result.checkedUrl,
        itinerary: ITINERARY,
        lowestVisibleDailyRateUsd: null,
        vehicle: null,
        estimatedTotalUsd: null,
        taxesFeesVisibility: "not_visible",
        rawEvidenceExcerpt: result.pageEvidence,
        status: result.cards.length ? "no_eligible_vehicle" : "no_visible_rate",
        error: result.cards.length
          ? "No visible 6–12 passenger non-truck vehicle card with an explicit $N/day rate was found."
          : "No visible rendered vehicle-card price matching $N/day was found.",
        source: options.htmlPath ? "fixture" : "live_browser",
        durationMs: Math.round(performance.now() - started),
        pageTitle: result.pageTitle,
        httpStatus: result.httpStatus,
        diagnostics: result.diagnostics ?? null,
        validVehicleCardCount: 0,
        eligibleVehicleCardCount: 0,
        visiblePricedVehicleCardCount: pricedCards.length,
        criteriaVersion: CRITERIA_VERSION,
      };
    } else {
      run = {
        id: startedAt.toISOString(),
        checkedAt: startedAt.toISOString(),
        checkedUrl: result.checkedUrl,
        itinerary: ITINERARY,
        lowestVisibleDailyRateUsd: lowest.dailyRateUsd,
        vehicle: lowest.vehicle,
        estimatedTotalUsd: lowest.estimatedTotalUsd,
        passengerCapacity: lowest.passengerCapacity,
        vehicleClass: lowest.vehicleClass,
        taxesFeesVisibility: lowest.taxesFeesVisibility,
        rawEvidenceExcerpt: lowest.evidence,
        status: "success",
        error: null,
        source: options.htmlPath ? "fixture" : "live_browser",
        durationMs: Math.round(performance.now() - started),
        pageTitle: result.pageTitle,
        httpStatus: result.httpStatus,
        diagnostics: result.diagnostics ?? null,
        validVehicleCardCount: validCards.length,
        eligibleVehicleCardCount: validCards.length,
        visiblePricedVehicleCardCount: pricedCards.length,
        eligibleVehicles: validCards.slice(0, 24).map((card) => ({
          vehicle: card.vehicle,
          vehicleClass: card.vehicleClass,
          passengerCapacity: card.passengerCapacity,
          dailyRateUsd: card.dailyRateUsd,
          estimatedTotalUsd: card.estimatedTotalUsd,
          taxesFeesVisibility: card.taxesFeesVisibility,
        })),
        criteriaVersion: CRITERIA_VERSION,
      };
    }
  } catch (error) {
    run = {
      id: startedAt.toISOString(),
      checkedAt: startedAt.toISOString(),
      checkedUrl: BOOKING_URL,
      itinerary: ITINERARY,
      lowestVisibleDailyRateUsd: null,
      vehicle: null,
      estimatedTotalUsd: null,
      taxesFeesVisibility: "unknown",
      rawEvidenceExcerpt: "",
      status: "error",
      error: normalizeSpace(error?.message || error).slice(0, 700),
      source: options.htmlPath ? "fixture" : "live_browser",
      durationMs: Math.round(performance.now() - started),
      pageTitle: null,
      httpStatus: null,
      validVehicleCardCount: 0,
      eligibleVehicleCardCount: 0,
      visiblePricedVehicleCardCount: 0,
      criteriaVersion: CRITERIA_VERSION,
    };
  }

  history.schemaVersion = 2;
  history.monitorId = MONITOR_ID;
  history.criteriaVersion = CRITERIA_VERSION;
  history.vehicleCriteria = VEHICLE_CRITERIA;
  history.thresholdDailyRateUsd = THRESHOLD_DAILY_RATE_USD;
  history.bookingUrl = BOOKING_URL;
  history.itinerary = ITINERARY;
  history.runs = [run, ...(history.runs || []).filter((candidate) => candidate.id !== run.id)];
  await writeHistory(historyPath, history);
  await writeHistory(options.publicHistoryPath || DEFAULT_PUBLIC_HISTORY_PATH, history);
  await writeText(options.publicCsvPath || DEFAULT_PUBLIC_CSV_PATH, historyToCsv(history));

  if (run.status !== "success") throw new Error(run.error);
  return {
    run,
    historyPath,
    publicHistoryPath: options.publicHistoryPath || DEFAULT_PUBLIC_HISTORY_PATH,
    publicCsvPath: options.publicCsvPath || DEFAULT_PUBLIC_CSV_PATH,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMonitor(parseCliArgs()).then(({ run, historyPath }) => {
    console.log(`Hertz LAS: $${run.lowestVisibleDailyRateUsd}/day · ${run.vehicle}`);
    console.log(`Recorded ${run.checkedAt} in ${historyPath}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
