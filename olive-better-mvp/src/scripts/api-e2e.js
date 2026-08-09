import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../server.js";
import { cleanTrendSignals } from "../core/trends.js";

const requestText = "수면, 영양, 피부를 함께 챙기는 직장인 웰니스 기획전";

function researchFixture(request) {
  const rawSignals = [
    { id: "e2e-1", title: "수면 건강과 마그네슘 루틴 관심 증가", source: "공개 테스트 뉴스", publishedAt: "2026-07-25T00:00:00.000Z" },
    { id: "e2e-2", title: "비타민과 피부 건강을 함께 챙기는 웰니스", source: "공개 테스트 뉴스", publishedAt: "2026-07-24T00:00:00.000Z" }
  ];
  return Promise.resolve({
    status: "live",
    source: "deterministic-e2e-source",
    topic: request,
    fetchedAt: "2026-07-30T04:00:00.000Z",
    rawSignals,
    cleaned: cleanTrendSignals(rawSignals, request, { now: "2026-07-30T04:00:00.000Z" })
  });
}

function heroFixture() {
  return Promise.resolve({
    status: "live",
    provider: "deterministic-e2e-llm",
    generatedAt: "2026-07-30T04:00:00.000Z",
    copy: {
      title: "오늘을 가볍게 만드는 웰니스 루틴",
      subtitle: "공개 근거와 안전 기준을 확인한 상품을 만나보세요.",
      cta: "상품 살펴보기"
    }
  });
}

const server = createAppServer({ researchImpl: researchFixture, heroImpl: heroFixture });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json();
  return { status: response.status, body };
}

try {
  assert.equal((await api("/api/reset", { method: "POST", body: "{}" })).status, 200);
  const created = await api("/api/research", { method: "POST", body: JSON.stringify({ request: requestText }) });
  assert.equal(created.status, 200);
  assert.equal(created.body.publishCheck.ok, true);
  const draft = created.body.draft;

  const judgement = await api(`/api/codex/judgement?draftId=${encodeURIComponent(draft.id)}`);
  assert.equal(judgement.status, 200);
  assert.notEqual(judgement.body.judgement.overall, "blocked");
  assert.equal(judgement.body.judgement.cards.some((card) => card.status === "blocked"), false);

  const edited = await api(`/api/drafts/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({ heroTitle: "근거를 확인한 오늘의 웰니스 루틴" })
  });
  assert.equal(edited.body.publishCheck.ok, true);

  const published = await api(`/api/drafts/${draft.id}/publish`, { method: "POST", body: "{}" });
  assert.equal(published.status, 200);
  assert.deepEqual(Object.keys(published.body.published).sort(), ["id", "publishedAt", "sections", "status"]);
  assert.equal("research" in published.body.published, false);
  assert.equal("evidenceReport" in published.body.published, false);

  const productSections = published.body.published.sections.filter((section) => section.products?.length);
  assert.ok(productSections.length >= 2);
  const reactedSection = productSections.at(-1);
  const reactedProduct = reactedSection.products[0];
  const otherSection = productSections.find((section) => section.id !== reactedSection.id);
  const mismatch = await api("/api/reactions", {
    method: "POST",
    body: JSON.stringify({ type: "click", sectionId: otherSection.id, productId: reactedProduct.id })
  });
  assert.equal(mismatch.status, 400);

  for (const type of ["click", "like", "purchase"]) {
    const reaction = await api("/api/reactions", {
      method: "POST",
      body: JSON.stringify({ type, sectionId: reactedSection.id, productId: reactedProduct.id, customerId: "e2e-customer" })
    });
    assert.equal(reaction.status, 200);
  }

  const rerun = await api("/api/research", { method: "POST", body: JSON.stringify({ request: requestText }) });
  assert.equal(rerun.status, 200);
  assert.equal(rerun.body.draft.reactionImpact.totalEvents, 3);
  assert.equal(rerun.body.draft.reactionImpact.totalScore, 11);
  assert.equal(rerun.body.draft.reactionImpact.topSection, reactedSection.id);
  assert.ok(rerun.body.draft.reactionImpact.productScores[reactedProduct.id] >= 11);
  const boosted = rerun.body.draft.sections.find((section) => section.id === reactedSection.id);
  assert.equal(boosted.reactionBoostApplied, true);
  assert.equal(boosted.productLimit, 10);
  assert.equal(rerun.body.draft.sections[1].id, reactedSection.id);

  console.log(JSON.stringify({
    ok: true,
    draftId: draft.id,
    evidenceCards: judgement.body.judgement.cards.length,
    publishedSections: published.body.published.sections.length,
    reactions: 3,
    reactionScore: 11,
    boostedSection: reactedSection.id,
    boostedProduct: reactedProduct.id,
    providerCalls: 0
  }, null, 2));
} finally {
  server.close();
  await once(server, "close");
}
