/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lineupFavorites from "../lineupFavorites.js";
import type * as lostLandsSetTimes from "../lostLandsSetTimes.js";
import type * as monitoring from "../monitoring.js";
import type * as rally from "../rally.js";
import type * as sleep from "../sleep.js";
import type * as standups from "../standups.js";
import type * as videoDownloads from "../videoDownloads.js";
import type * as warRoom from "../warRoom.js";
import type * as whoop from "../whoop.js";
import type * as whoopData from "../whoopData.js";
import type * as whoopLib from "../whoopLib.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  lineupFavorites: typeof lineupFavorites;
  lostLandsSetTimes: typeof lostLandsSetTimes;
  monitoring: typeof monitoring;
  rally: typeof rally;
  sleep: typeof sleep;
  standups: typeof standups;
  videoDownloads: typeof videoDownloads;
  warRoom: typeof warRoom;
  whoop: typeof whoop;
  whoopData: typeof whoopData;
  whoopLib: typeof whoopLib;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
