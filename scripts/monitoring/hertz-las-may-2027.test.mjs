import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  BOOKING_URL,
  CRITERIA_VERSION,
  ITINERARY,
  VEHICLE_CRITERIA,
  isEligibleVehicleCard,
  parseFixtureHtml,
  runMonitor,
  selectLowestVisibleCard,
} from "./hertz-las-may-2027.mjs";

const fixture = `
  <article data-monitor-vehicle-card data-monitor-passengers="5">
    <h3>Large Sedan — Nissan Altima or similar</h3>
    <span>$82</span><span>/day</span>
    <p>Estimated total $471.00 incl. taxes & fees</p>
  </article>
  <article data-monitor-vehicle-card style="display:none">
    <h3>Hidden slider value</h3><span>$1/day</span>
  </article>
  <article data-monitor-vehicle-card data-monitor-passengers="6">
    <h3>Pickup — RAM 2500 or similar</h3>
    <span>$55/day</span><p>Estimated total $323</p>
  </article>
  <article data-monitor-vehicle-card data-monitor-passengers="7">
    <h3>7 Passenger Std 2WD SUV — Nissan Pathfinder or similar</h3>
    <span>$80/day</span><p>Estimated total $455</p>
  </article>`;

test("selects only 6–12 passenger non-trucks with explicit visible per-day prices", () => {
  const cards = parseFixtureHtml(fixture);
  const { lowest, validCards, pricedCards } = selectLowestVisibleCard(cards);
  assert.equal(pricedCards.length, 3);
  assert.equal(validCards.length, 1);
  assert.equal(lowest.dailyRateUsd, 80);
  assert.match(lowest.vehicle, /Pathfinder/);
  assert.equal(lowest.passengerCapacity, 7);
  assert.equal(lowest.estimatedTotalUsd, 455);
  assert.equal(lowest.taxesFeesVisibility, "not_visible");
});

test("enforces passenger bounds and excludes pickup and truck vehicle types", () => {
  assert.equal(isEligibleVehicleCard({ passengerCapacity: 6, vehicle: "RAM 2500", vehicleClass: "Pickup" }).eligible, false);
  assert.equal(isEligibleVehicleCard({ passengerCapacity: 7, vehicle: "Nissan Pathfinder", vehicleClass: "SUV" }).eligible, true);
  assert.equal(isEligibleVehicleCard({ passengerCapacity: 12, vehicle: "Ford Transit", vehicleClass: "Passenger Van" }).eligible, true);
  assert.equal(isEligibleVehicleCard({ passengerCapacity: 13, vehicle: "Large Van", vehicleClass: "Passenger Van" }).eligible, false);
  assert.equal(VEHICLE_CRITERIA.minPassengers, 6);
  assert.equal(VEHICLE_CRITERIA.maxPassengers, 12);
});

test("extracts Hertz's rendered $N, /day, $total, est. total sequence", () => {
  const cards = parseFixtureHtml(`
    <article data-monitor-vehicle-card>
      <h6>7 Passenger Std 2WD SUV</h6><span>Nissan Pathfinder or similar</span>
      <h5>$80</h5><span>/day</span><h5>$455</h5><span>est. total</span>
    </article>`);
  const { lowest } = selectLowestVisibleCard(cards);
  assert.equal(lowest.dailyRateUsd, 80);
  assert.equal(lowest.estimatedTotalUsd, 455);
  assert.equal(lowest.passengerCapacity, 7);
});

test("ignores bare currency values and hidden vehicle cards", () => {
  const cards = parseFixtureHtml(`
    <article data-monitor-vehicle-card><h3>Visible SUV</h3><span>$399</span></article>
    <article data-monitor-vehicle-card hidden><h3>Hidden Sedan</h3><span>$2/day</span></article>`);
  assert.equal(selectLowestVisibleCard(cards).lowest, null);
});

test("persists required evidence fields for successful fixture runs", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "hertz-monitor-"));
  const htmlPath = resolve(directory, "fixture.html");
  const historyPath = resolve(directory, "history.json");
  const publicHistoryPath = resolve(directory, "public-history.json");
  await writeFile(htmlPath, fixture);

  const { run } = await runMonitor({ htmlPath, historyPath, publicHistoryPath });
  const stored = JSON.parse(await readFile(historyPath, "utf8"));
  const publicStored = JSON.parse(await readFile(publicHistoryPath, "utf8"));
  assert.equal(stored.runs.length, 1);
  assert.equal(run.checkedUrl, BOOKING_URL);
  assert.deepEqual(run.itinerary, ITINERARY);
  assert.equal(run.lowestVisibleDailyRateUsd, 80);
  assert.equal(run.passengerCapacity, 7);
  assert.equal(run.criteriaVersion, CRITERIA_VERSION);
  assert.equal(run.status, "success");
  assert.equal(run.error, null);
  assert.match(run.rawEvidenceExcerpt, /Nissan Pathfinder/);
  assert.deepEqual(stored.vehicleCriteria, VEHICLE_CRITERIA);
  assert.deepEqual(publicStored, stored);
});

test("persists a scoped unavailable run when priced cards do not qualify", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "hertz-monitor-ineligible-"));
  const htmlPath = resolve(directory, "fixture.html");
  const historyPath = resolve(directory, "history.json");
  const publicHistoryPath = resolve(directory, "public-history.json");
  await writeFile(htmlPath, `<article data-monitor-vehicle-card data-monitor-passengers="6"><h3>Pickup — RAM 2500 or similar</h3><span>$55/day</span></article>`);

  await assert.rejects(runMonitor({ htmlPath, historyPath, publicHistoryPath }), /6–12 passenger non-truck/);
  const stored = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(stored.runs[0].status, "no_eligible_vehicle");
  assert.equal(stored.runs[0].visiblePricedVehicleCardCount, 1);
  assert.equal(stored.runs[0].eligibleVehicleCardCount, 0);
  assert.equal(stored.runs[0].criteriaVersion, CRITERIA_VERSION);
});
