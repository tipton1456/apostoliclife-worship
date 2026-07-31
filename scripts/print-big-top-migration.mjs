#!/usr/bin/env node
/**
 * Prints the Big Top Supabase SQL migration so you can paste it into
 * Supabase Dashboard → SQL Editor → Run.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = resolve(
  root,
  "supabase/migrations/202607310001_big_top_checkin.sql"
);

console.log(readFileSync(sqlPath, "utf8"));
console.log("\n-- Paste the SQL above into Supabase SQL Editor and click Run.");
