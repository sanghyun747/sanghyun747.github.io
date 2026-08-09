import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createAppServer } from "../src/server.js";
import { generateHeroCopy } from "../src/services/llm.js";

const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const rules = JSON.parse(await readFile(new URL("../data/rules.json", import.meta.url), "utf8"));

function trend(request) {
  const signal = { id: "test-signal", title: "수면 건강과 영양 균형 웰니스 루틴", source: "테스트 공개 근거", url: "https://example.test/evidence", publishedAt: new Date().toISOString(), relevance: 5, adoptedReason: "요청 키워드와 연결됨" };
  return { status: "live", source: "테스트 검색", topic: request, fetchedAt: new Date().toISOString(), rawSignals: [signal], cleaned: { accepted: [signal], rejected: [], counts: { raw: 1, accepted: 1, rejected: 0 } } };
}

function hero() {
  return { status: "live", provider: "test-provider", generatedAt: new Date().toISOString(), copy: { title: "균형 있는 오늘의 웰니스", subtitle: "공개 근거와 안전 기준을 확인한 상품을 만나보세요.", cta: "추천 상품 보기" } };
}

async function withServer(run) {
  const server = createAppServer({ products, rules, researchImpl: async (request) => trend(request), heroImpl: async () => hero() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { server.close(); await once(server, "close"); }
}

async function json(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "content-type": "application/json" } });
  return { response, payload: await response.json() };
}

async function publishedFixture(base) {
  const research = await json(base, "/api/research", { method: "POST", body: JSON.stringify({ request: "수면과 영양을 함께 챙기는 웰니스 기획전" }) });
  assert.equal(research.response.status, 200);
  const draft = research.payload.draft;
  const publish = await json(base, `/api/drafts/${draft.id}/publish`, { method: "POST", body: "{}" });
  assert.equal(publish.response.status, 200);
  return publish.payload.published;
}

test("잘못된 LLM 본문은 기본 문구로 위장한 live 성공이 아니다", async () => {
  const result = await generateHeroCopy({ request: "영양 기획전", selectedWells: ["NOURISH"], acceptedSignals: [], products: [] }, {
    env: { OPENAI_API_KEY: "test-only", OPENAI_BASE_URL: "https://example.test", OPENAI_MODEL: "test-model" },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "JSON이 아닌 응답" } }] }), { status: 200 })
  });
  assert.equal(result.status, "failed");
});

test("고객 발행 API는 내부 초안·제외 상품·운영자 편집 정보를 반환하지 않는다", async () => {
  await withServer(async (base) => {
    await publishedFixture(base);
    const { payload } = await json(base, "/api/published");
    for (const privateField of ["research", "hero", "products", "excludedProducts", "exclusionSummary", "evidenceReport", "operatorEdits", "hiddenProductIds", "reactionImpact", "assumptions"]) {
      assert.equal(Object.hasOwn(payload.published, privateField), false, `${privateField} leaked`);
    }
  });
});

test("반응은 상품이 실제 포함된 영역과 정확히 짝지어야 한다", async () => {
  await withServer(async (base) => {
    const published = await publishedFixture(base);
    const sections = published.sections.filter((section) => Array.isArray(section.productIds) && section.productIds.length);
    assert.ok(sections.length >= 2);
    const mismatch = await json(base, "/api/reactions", { method: "POST", body: JSON.stringify({ type: "like", sectionId: sections[0].id, productId: sections[1].productIds[0], customerId: "security-test" }) });
    assert.equal(mismatch.response.status, 400);
    const missing = await json(base, "/api/reactions", { method: "POST", body: JSON.stringify({ type: "click", customerId: "security-test" }) });
    assert.equal(missing.response.status, 400);
  });
});
