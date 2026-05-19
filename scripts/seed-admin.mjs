import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connection) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const email = (process.env.ADMIN_EMAIL || "_admin").toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 10) {
  console.error("ADMIN_PASSWORD must be set and at least 10 characters.");
  process.exit(1);
}

const sql = neon(connection);
const passwordHash = await bcrypt.hash(password, 12);
await sql`
  insert into users (id, email, name, password_hash, role, status, approved_at)
  values ('usr_admin', ${email}, '_admin', ${passwordHash}, 'admin', 'approved', now())
  on conflict (email) do update
    set password_hash = excluded.password_hash,
        role = 'admin',
        status = 'approved',
        approved_at = now()
`;
console.log(`Admin user ready: ${email}`);
