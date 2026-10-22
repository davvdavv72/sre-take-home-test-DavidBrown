// deno-lint-ignore-file no-explicit-any
import { Database } from "@db/sqlite";
import * as oak from "@oak/oak";
import * as path from "@std/path";
import { Port } from "../lib/utils/index.ts";
import listInsights from "./operations/list-insights.ts";
import lookupInsight from "./operations/lookup-insight.ts";
import * as insightsTable from "$tables/insights.ts";

console.log("Loading configuration");

const env = {
  // Containers need 0.0.0.0 to accept traffic from outside the container.
  host: Deno.env.get("SERVER_HOST") ?? "127.0.0.1",
  port: Port.parse(Deno.env.get("SERVER_PORT")),
  dbPath: Deno.env.get("DB_PATH") ?? path.join("tmp", "db.sqlite3"),
};

const dbFilePath = path.resolve(env.dbPath);

console.log(`Opening SQLite database at ${dbFilePath}`);

await Deno.mkdir(path.dirname(dbFilePath), { recursive: true });
const db = new Database(dbFilePath);
db.exec(insightsTable.createTable);

console.log("Initialising server");

const router = new oak.Router();

// Liveness: the process is up and serving HTTP.
router.get("/_health", (ctx) => {
  ctx.response.body = "OK";
  ctx.response.status = 200;
});

// Readiness: the process can reach its database.
router.get("/_ready", (ctx) => {
  try {
    db.prepare("SELECT 1").value();
    ctx.response.body = "OK";
    ctx.response.status = 200;
  } catch (err) {
    console.error("Readiness check failed:", err);
    ctx.response.body = "Database unavailable";
    ctx.response.status = 503;
  }
});

router.get("/insights", (ctx) => {
  const result = listInsights({ db });
  ctx.response.body = result;
  ctx.response.status = 200;
});

router.get("/insights/:id", (ctx) => {
  const params = ctx.params as Record<string, any>;
  const result = lookupInsight({ db, id: params.id });
  ctx.response.body = result;
  ctx.response.status = 200;
});

router.get("/insights/create", (_ctx) => {
  // TODO
});

router.get("/insights/delete", (_ctx) => {
  // TODO
});

const app = new oak.Application();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(
      `Unhandled error on ${ctx.request.method} ${ctx.request.url.pathname}:`,
      err,
    );
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const controller = new AbortController();
const SHUTDOWN_TIMEOUT_MS = 10_000;

app.addEventListener("listen", ({ hostname, port }) => {
  console.log(`Started server on ${hostname}:${port}`);
});

const server = app.listen({
  hostname: env.host,
  port: env.port,
  signal: controller.signal,
});

// Stop accepting connections, give in-flight requests time to finish,
// then close the DB and exit. Exit explicitly: the signal listeners
// would otherwise keep the process alive.
const shutdown = async (signal: Deno.Signal) => {
  console.log(`Received ${signal}, shutting down`);
  controller.abort();
  await Promise.race([
    server,
    new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
  ]);
  db.close();
  console.log("Server stopped");
  Deno.exit(0);
};

// Windows only supports SIGINT and SIGBREAK.
const signals: Deno.Signal[] = Deno.build.os === "windows"
  ? ["SIGINT"]
  : ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  Deno.addSignalListener(signal, () => shutdown(signal));
}
