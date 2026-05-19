import fs from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connection) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const sql = neon(connection);
const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
for (const statement of schema.split(";").map((item) => item.trim()).filter(Boolean)) {
  await sql(`${statement};`);
}
console.log("Database migration complete.");
