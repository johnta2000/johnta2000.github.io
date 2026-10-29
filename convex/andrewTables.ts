import {defineTable} from "convex/server";
import {v} from "convex/values";
export const andrewTables={andrewRecords:defineTable({key:v.string(),value:v.any(),version:v.number(),updatedAt:v.number(),updatedBy:v.string()}).index("by_key",["key"])};
