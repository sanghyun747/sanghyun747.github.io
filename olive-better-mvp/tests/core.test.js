import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkDraftSafety, checkTextSafety } from "../src/core/safety.js";
import { filterEligibleProducts, isFunctionalAllowed } from "../src/core/products.js";
import { cleanTrendSignals, inferWells } from "../src/core/trends.js";
import { createDraft, applyDraftEdit, expandDraftForClient, validateForPublish } from "../src/core/draft.js";
import { judgeEvidenceCards, searchEvidenceCards } from "../src/core/codexJudge.js";
import { parseGoogleNewsRss } from "../src/services/trendSource.js";
import { generateHeroCopy } from "../src/services/llm.js";

const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const rules = JSON.parse(await readFile(new URL("../data/rules.json", import.meta.url), "utf8"));

function trends(request, raw = [{ title: "수면 건강과 영양 균형 웰니스 루틴", source: "테스트 뉴스", publishedAt: "2026-07-29T00:00:00.000Z" }]) {
  return { status: "live", source: "테스트 검색", topic: request, fetchedAt: "2026-07-30T00:00:00.000Z", rawSignals: raw, cleaned: cleanTrendSignals(raw, request, { now: "2026-07-30T00:00:00.000Z" }) };
}

function hero(copy = {}) {
  return { status: "live", provider: "test-provider", generatedAt: "2026-07-30T00:00:00.000Z", copy: { title: copy.title || "오늘의 균형 있는 웰니스", subtitle: copy.subtitle || "안전 기준과 공개 근거를 확인한 추천입니다.", cta: copy.cta || "추천 상품 보기" } };
}

test("문구 안전 검사는 띄어쓰기와 기호 우회를 잡는다", () => {
  const result = checkTextSafety("피로 치 료와 1 위 의-약품처럼 보이는 문구", rules);
  assert.equal(result.safe, false);
  for (const term of ["치료", "1위", "의약품"]) assert.ok(result.violations.some((item) => item.term === term));
});

test("상품 필터는 품절, 기능 누락, Well 불일치, 금지 상품명과 중복을 제외한다", () => {
  const base = { ...products.find((item) => item.well === "FIT" && item.functional === "체지방 감소"), stock: 10 };
  const sample = [
    { ...base, id: "ok", goodsNumber: "ok", name: "안전 후보" },
    { ...base, id: "sold", goodsNumber: "sold", name: "품절 후보", stock: 0 },
    { ...base, id: "missing", goodsNumber: "missing", name: "기능 없음", functional: "" },
    { ...base, id: "mismatch", goodsNumber: "mismatch", name: "불일치", well: "EAT" },
    { ...base, id: "banned", goodsNumber: "banned", name: "[1위] 상품" },
    { ...base, id: "dupe", goodsNumber: "ok", name: "다른 이름" }
  ];
  const result = filterEligibleProducts(sample, rules, { wells: ["FIT", "EAT"] });
  assert.equal(result.eligible.length, 1);
  for (const reason of ["품절", "건강 기능 정보 없음", "Well과 건강 기능 불일치", "상품명 금지 표현 포함", "중복 상품"]) assert.ok(result.excluded.some((item) => item.reasons.includes(reason)));
});

test("너무 일반적인 기능 단어는 구체적인 허용 기능과 일치하지 않는다", () => {
  assert.equal(isFunctionalAllowed({ well: "CARE", functional: "건강" }, rules), false);
});

test("트렌드 정제는 채택과 제외 이유를 분리한다", () => {
  const raw = [
    { title: "수면 건강과 마그네슘 웰니스 루틴", source: "뉴스", publishedAt: "2026-07-20T00:00:00.000Z" },
    { title: "수면 건강과 마그네슘 웰니스 루틴", source: "복제", publishedAt: "2026-07-20T00:00:00.000Z" },
    { title: "수면제 처방이 필요한가요?", source: "질의", publishedAt: "2026-07-20T00:00:00.000Z" },
    { title: "무료배송 특가 광고", source: "광고", publishedAt: "2026-07-20T00:00:00.000Z" }
  ];
  const result = cleanTrendSignals(raw, "수면 건강 릴랙스 기획전", { now: "2026-07-30T00:00:00.000Z" });
  assert.equal(result.accepted.length, 1);
  assert.ok(result.rejected.some((item) => item.reasons.includes("중복 신호")));
  assert.ok(result.rejected.some((item) => item.reasons.includes("의약품·질병 관련 정보")));
  assert.ok(result.rejected.some((item) => item.reasons.includes("광고성 정보")));
});

test("다른 요청은 다른 Well과 상품 영역을 만든다", () => {
  const relax = createDraft({ request: "수면과 휴식을 챙기는 기획전", products, rules, trendResult: trends("수면과 휴식"), heroResult: hero() });
  const care = createDraft({ request: "눈 건강과 간 건강을 챙기는 기획전", products, rules, trendResult: trends("눈 간", [{ title: "눈 건강과 간 건강 관리 흐름", source: "뉴스", publishedAt: "2026-07-29T00:00:00.000Z" }]), heroResult: hero() });
  assert.notDeepEqual(relax.selectedWells, care.selectedWells);
  assert.ok(relax.sections.some((item) => item.id === "well-RELAX"));
  assert.ok(care.sections.some((item) => item.id === "well-CARE"));
});

test("문구 수정은 검수 문구와 고객 노출 배너를 함께 바꾸고 재검사한다", () => {
  const request = "영양 기획전";
  const unsafe = createDraft({ request, products, rules, trendResult: trends(request), heroResult: hero({ title: "피로 치료를 위한 루틴" }) });
  assert.equal(validateForPublish(unsafe).ok, false);
  const edited = applyDraftEdit(unsafe, { heroTitle: "영양 균형을 돕는 데일리 루틴" }, rules);
  assert.equal(edited.sections.find((item) => item.type === "hero").title, edited.hero.copy.title);
  assert.equal(validateForPublish(edited).ok, true);
  const stale = structuredClone(edited);
  stale.sections.find((item) => item.type === "hero").title = "피로 치료 루틴";
  stale.safety = checkDraftSafety(stale, rules);
  assert.equal(validateForPublish(stale).ok, false);
});

test("고객 반응은 다음 초안의 영역 순서와 상품 수에 반영된다", () => {
  const request = "수면과 영양을 챙기는 기획전";
  const first = createDraft({ request, products, rules, trendResult: trends(request), heroResult: hero() });
  const section = first.sections.find((item) => item.id === "well-RELAX");
  const productId = section.productIds[0];
  const next = createDraft({ request, products, rules, trendResult: trends(request), heroResult: hero(), reactions: [
    { type: "click", sectionId: section.id, productId, well: "RELAX" },
    { type: "like", sectionId: section.id, productId, well: "RELAX" },
    { type: "purchase", sectionId: section.id, productId, well: "RELAX" }
  ] });
  assert.equal(next.sections[1].id, "well-RELAX");
  assert.equal(next.reactionImpact.totalEvents, 3);
  assert.equal(next.reactionImpact.totalScore, 11);
  assert.equal(next.sections.find((item) => item.id === "well-RELAX").productLimit, 10);
});

test("Codex 판단과 검색은 구조화된 근거 카드를 사용한다", () => {
  const draft = createDraft({ request: "수면 영양 기획전", products, rules, trendResult: trends("수면 영양"), heroResult: hero() });
  const judgement = judgeEvidenceCards(draft);
  assert.equal(judgement.counts.blocked, 0);
  assert.ok(searchEvidenceCards(draft, "상품").some((item) => item.id === "product-safety"));
  assert.ok(expandDraftForClient(draft).sections.some((item) => Array.isArray(item.products) && item.products.length));
});

test("Google News RSS 파서는 공개 응답을 신호로 변환한다", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[수면 건강 웰니스 루틴 - 매체]]></title><link>https://example.com/a</link><source>매체</source><pubDate>Mon, 20 Jul 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  const result = parseGoogleNewsRss(xml, "2026-07-30T00:00:00.000Z");
  assert.equal(result[0].title, "수면 건강 웰니스 루틴");
  assert.equal(result[0].source, "매체");
});

test("유효한 LLM 응답은 CTA를 안전한 행동 문구로 정규화한다", async () => {
  const payload = { choices: [{ message: { content: JSON.stringify({ title: "직장인 웰니스", subtitle: "영양과 수면 루틴을 챙겨보세요.", cta: "브랜드 인기 상품, 특별 기획" }) } }] };
  const result = await generateHeroCopy({ request: "수면 영양", selectedWells: ["NOURISH"], acceptedSignals: [], products: [] }, { env: { OPENAI_API_KEY: "test-only", OPENAI_BASE_URL: "https://example.test" }, fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) });
  assert.equal(result.status, "live");
  assert.equal(result.copy.cta, "기획전 상품 보기");
});

test("알 수 없는 요청도 기본 추천 Well을 만든다", () => {
  assert.deepEqual(inferWells("특별한 키워드가 없는 행사"), ["NOURISH", "EAT"]);
});
