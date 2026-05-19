import { spawn } from "node:child_process";
import process from "node:process";

const commands = [
  ["api", "node", ["server/index.mjs"]],
  ["web", "npx.cmd", ["vite", "--host", "0.0.0.0"]]
];

const children = commands.map(([label, command, args]) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown();
    }
  });
  return child;
});

function shutdown() {
  for (const child of children) child.kill();
  process.exit();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
