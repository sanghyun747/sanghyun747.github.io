import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("고객 스크립트는 발행본과 반응 API만 사용한다", async () => {
  const source = await readFile(new URL("../public/customer.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/published/); assert.match(source, /\/api\/reactions/);
  for (const forbidden of [/\/api\/state/, /\/api\/research/, /\/api\/drafts/, /\/api\/codex/]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /아직 발행된 기획전이 없습니다/);
});

test("운영자 UI는 요청, 근거 판단, 다음 행동, 발행 흐름을 설명한다", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const phrase of ["기획 요청", "자동 조사", "검토", "발행", "고객 화면 열기"]) assert.match(html, new RegExp(phrase));
  for (const phrase of ["왜 이 결과인지", "다음 행동", "공개 검색 신호", "고객 반응"]) assert.match(script, new RegExp(phrase));
  assert.match(script, /지원하지 않는 영역을 안전하게 건너뜁니다/);
});

test("데모 상품은 300개이며 알려진 Well 분포와 일치한다", async () => {
  const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
  const counts = Object.groupBy(products, (item) => item.well);
  assert.equal(products.length, 300);
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([well, rows]) => [well, rows.length])), { CARE: 56, EAT: 52, FIT: 69, GLOW: 17, NOURISH: 61, RELAX: 45 });
});
