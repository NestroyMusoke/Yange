import { spawn } from "node:child_process";

const spawnOptions = { stdio: "inherit" };
function startWorkspace(workspace) {
  if (process.platform === "win32") {
    // Node 25 no longer launches .cmd shims directly on Windows.
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm.cmd run dev --workspace ${workspace}`], spawnOptions);
  }
  return spawn("npm", ["run", "dev", "--workspace", workspace], spawnOptions);
}
const processes = [
  startWorkspace("@yange/api"),
  startWorkspace("@yange/web"),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill("SIGTERM");
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`A Yange development process stopped (${signal ?? code}).`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
