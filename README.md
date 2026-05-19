# Workflow

1. Ask
2. Plan
3. Implement
4. Review Diff
5. Run/Test
6. Commit

# MMP Budget Dashboard

Run locally:

```bash
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

Local demo admin:

```text
_admin / admin123
```

Only `_admin` / `admin` role can upload Excel files and approve users.
New users must register and wait for `_admin` approval before login.

Production setup:

```bash
copy .env.example .env.local
npm.cmd run db:migrate
npm.cmd run db:seed-admin
npm.cmd run build
```

Required production variables:

```text
DATABASE_URL
ADMIN_EMAIL
ADMIN_PASSWORD
```

Optional:

```text
BLOB_READ_WRITE_TOKEN
SOURCE_FILE_STORAGE=vercel_blob_public
```

For large files on Vercel, set:

```text
BLOB_READ_WRITE_TOKEN
SOURCE_FILE_STORAGE=vercel_blob_public
```

This enables browser-to-Blob upload so Excel files larger than the Vercel Function request limit can be imported. Do not enable public Blob source-file archive unless the organization accepts that original Excel files are stored behind hard-to-guess public URLs. The secure default is to store dashboard summaries in Postgres and not archive source files.
