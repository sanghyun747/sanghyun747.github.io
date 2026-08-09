import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { createAppServer } from "../server.js";
import { cleanTrendSignals } from "../core/trends.js";

const runFile = promisify(execFile);
const cli = process.env.AGENT_BROWSER_CLI || "agent-browser";
const session = `olive-better-${process.pid}`;
const screenshots = new URL("../../screenshots/", import.meta.url);
await mkdir(screenshots, { recursive: true });

function researchFixture(request) {
  const rawSignals = [
    { id: "browser-1", title: "수면 건강과 마그네슘 웰니스 루틴", source: "공개 테스트 뉴스", publishedAt: "2026-07-25T00:00:00.000Z" },
    { id: "browser-2", title: "영양과 피부 건강을 함께 챙기는 생활 습관", source: "공개 테스트 뉴스", publishedAt: "2026-07-24T00:00:00.000Z" }
  ];
  return Promise.resolve({ status: "live", source: "deterministic-browser-source", topic: request, fetchedAt: "2026-07-30T04:00:00.000Z", rawSignals, cleaned: cleanTrendSignals(rawSignals, request, { now: "2026-07-30T04:00:00.000Z" }) });
}

function heroFixture() {
  return Promise.resolve({ status: "live", provider: "deterministic-browser-llm", generatedAt: "2026-07-30T04:00:00.000Z", copy: { title: "근거로 고른 오늘의 웰니스", subtitle: "안전 기준과 공개 신호를 확인한 루틴을 만나보세요.", cta: "상품 살펴보기" } });
}

async function browser(...args) {
  const executable = cli.toLowerCase().endsWith(".js") ? process.execPath : cli;
  const cliArgs = cli.toLowerCase().endsWith(".js") ? [cli] : [];
  const { stdout, stderr } = await runFile(executable, [...cliArgs, "--session", session, "--json", ...args], {
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, AGENT_BROWSER_ALLOWED_DOMAINS: "127.0.0.1", AGENT_BROWSER_DEFAULT_TIMEOUT: "20000" }
  });
  if (stderr.trim()) throw new Error(stderr.trim());
  const output = stdout.trim();
  if (!output) return null;
  const parsed = JSON.parse(output);
  if (parsed.success === false) throw new Error(parsed.error || `browser command failed: ${args.join(" ")}`);
  return parsed.data ?? parsed;
}

async function pageFacts() {
  const facts = await browser("eval", `JSON.stringify({text:document.body.innerText,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2||document.body.scrollWidth>window.innerWidth+2,cards:document.querySelectorAll('.evidence-card').length,products:document.querySelectorAll('.product-card').length})`);
  const value = facts?.result ?? facts;
  return typeof value === "string" ? JSON.parse(value) : value;
}

const server = createAppServer({ researchImpl: researchFixture, heroImpl: heroFixture });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

try {
  await browser("set", "viewport", "1440", "1100");
  await browser("open", base);
  await browser("fill", "#mdRequest", "수면, 영양, 피부를 함께 챙기는 직장인 웰니스 기획전");
  await browser("click", "button[type='submit']");
  await browser("wait", ".evidence-card");
  const operator = await pageFacts();
  assert.ok(operator.cards >= 8, `operator facts: ${JSON.stringify(operator)}`);
  assert.match(operator.text, /다음 행동/);
  assert.match(operator.text, /공개 검색 신호와 제외 이유/);
  assert.equal(operator.overflow, false);
  await browser("screenshot", new URL("operator.png", screenshots).pathname.replace(/^\//, ""), "--full");

  await browser("find", "text", "검사 통과본 발행", "click");
  await browser("wait", "600");
  const publishedState = await fetch(`${base}/api/published`).then((response) => response.json());
  assert.ok(publishedState.published);
  await browser("open", `${base}/customer.html`);
  await browser("wait", ".product-card");
  const customerDesktop = await pageFacts();
  assert.ok(customerDesktop.products > 0);
  assert.match(customerDesktop.text, /근거로 고른 오늘의 웰니스/);
  assert.equal(customerDesktop.overflow, false);
  await browser("click", ".product-card .card-actions button:nth-child(1)");
  await browser("wait", "1000");
  await browser("click", ".product-card .card-actions button:nth-child(2)");
  await browser("wait", "1000");
  await browser("click", ".product-card .card-actions button:nth-child(3)");
  await browser("wait", "1000");
  await browser("screenshot", new URL("customer.png", screenshots).pathname.replace(/^\//, ""), "--full");

  const reactions = await fetch(`${base}/api/reactions`).then((response) => response.json());
  assert.equal(reactions.total, 3);

  await browser("set", "viewport", "390", "844");
  await browser("reload");
  await browser("wait", ".product-card");
  const customerMobile = await pageFacts();
  assert.equal(customerMobile.overflow, false);
  await browser("screenshot", new URL("customer-mobile.png", screenshots).pathname.replace(/^\//, ""), "--full");

  await browser("set", "viewport", "1440", "1100");
  await browser("open", base);
  await browser("wait", ".evidence-card");
  await browser("click", "#rerun");
  await browser("wait", "1000");
  const rerun = await pageFacts();
  assert.match(rerun.text, /고객 반응이 다음 초안에 미친 영향/);
  assert.match(rerun.text, /점수 11/);
  assert.equal(rerun.overflow, false);

  const pageErrors = await browser("errors");
  const errorPayload = pageErrors?.errors ?? pageErrors?.result ?? pageErrors;
  const noPageErrors = !errorPayload
    || (Array.isArray(errorPayload) && errorPayload.length === 0)
    || (typeof errorPayload === "string" && (/no page errors|no errors/i.test(errorPayload) || errorPayload.trim() === "[]"));
  assert.ok(noPageErrors, `page errors: ${JSON.stringify(pageErrors)}`);
  console.log(JSON.stringify({ ok: true, operatorEvidenceCards: operator.cards, customerProducts: customerDesktop.products, reactions: reactions.total, mobileOverflow: customerMobile.overflow, rerunApplied: true, consoleErrors: 0, providerCalls: 0 }, null, 2));
} finally {
  try { await browser("close"); } catch {}
  server.close();
  await once(server, "close");
}
