import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../src/server.js";

const signal = { id: "api-signal", title: "비타민과 수면 건강 루틴", source: "API 테스트", url: "", publishedAt: new Date().toISOString(), relevance: 4, adoptedReason: "요청 연결" };
const researchImpl = async (request) => ({ status: "live", source: "API 테스트", topic: request, fetchedAt: new Date().toISOString(), rawSignals: [signal], cleaned: { accepted: [signal], rejected: [], counts: { raw: 1, accepted: 1, rejected: 0 } } });
const heroImpl = async (_context, options) => options.forceFailure ? { status: "failed", provider: null, error: "강제 실패", copy: null } : { status: "live", provider: "api-test", generatedAt: new Date().toISOString(), copy: { title: "오늘의 웰니스", subtitle: "근거를 확인한 안전 추천입니다.", cta: "추천 보기" } };

async function withServer(run) {
  const server = createAppServer({ researchImpl, heroImpl }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "content-type": "application/json" } });
  return { status: response.status, body: await response.json() };
}

test("health와 catalog는 실행 상태와 300개 상품을 반환한다", async () => withServer(async (base) => {
  const health = await request(base, "/api/health"); const catalog = await request(base, "/api/catalog");
  assert.equal(health.body.ok, true); assert.equal(health.body.products, 300); assert.equal(catalog.body.products, 300); assert.ok(catalog.body.eligibleProducts > 0);
}));

test("빈 요청과 잘못된 JSON을 400으로 거부한다", async () => withServer(async (base) => {
  assert.equal((await request(base, "/api/research", { method: "POST", body: "{}" })).status, 400);
  const response = await fetch(`${base}/api/research`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
}));

test("LLM 실패 초안은 생성하지만 발행은 422로 차단한다", async () => withServer(async (base) => {
  const made = await request(base, "/api/research", { method: "POST", body: JSON.stringify({ request: "영양 기획전", forceLlmFailure: true }) });
  assert.equal(made.status, 200); assert.equal(made.body.publishCheck.ok, false);
  const publish = await request(base, `/api/drafts/${made.body.draft.id}/publish`, { method: "POST", body: "{}" });
  assert.equal(publish.status, 422);
}));

test("발행 전 고객 반응은 409이고 초기화는 모든 상태를 지운다", async () => withServer(async (base) => {
  assert.equal((await request(base, "/api/reactions", { method: "POST", body: JSON.stringify({ type: "click", sectionId: "x", productId: "y" }) })).status, 409);
  assert.equal((await request(base, "/api/reset", { method: "POST", body: "{}" })).body.ok, true);
  const state = await request(base, "/api/state"); assert.equal(state.body.latestDraft, null); assert.equal(state.body.published, null); assert.deepEqual(state.body.reactions, []);
}));
