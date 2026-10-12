import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  const env = {};

  try {
    const contents = readFileSync(path, "utf8");

    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

      const separator = trimmed.indexOf("=");
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error.message}`);
  }

  return env;
}

const root = resolve(import.meta.dirname, "..");
const env = loadEnv(resolve(root, ".env.local"));
const sql = readFileSync(
  resolve(root, "supabase/migrations/202610120001_worship_users.sql"),
  "utf8",
);

const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL || process.env.DATABASE_URL || env.DATABASE_URL;

if (!url) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];

async function runSqlViaManagementApi() {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`SQL query failed (${response.status}): ${body.slice(0, 500)}`);
  }

  console.log("Applied worship user migration through the Supabase Management API.");
}

async function runSqlViaPsql() {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }

  console.log("Applied worship user migration through psql.");
}

if (accessToken) {
  await runSqlViaManagementApi();
} else if (dbUrl) {
  await runSqlViaPsql();
} else {
  console.error("Cannot create the Worship tables from this machine yet.");
  console.error("Add one of these to .env.local, then run npm run auth:migrate:");
  console.error("  SUPABASE_ACCESS_TOKEN   personal access token from https://supabase.com/dashboard/account/tokens");
  console.error("  SUPABASE_DB_URL          postgres connection string from Project Settings → Database");
  process.exit(1);
}
