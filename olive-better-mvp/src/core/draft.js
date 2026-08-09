import { checkDraftSafety, safePlainText } from "./safety.js";
import { filterEligibleProducts, publicProduct, rankProducts, summarizeExclusions, summarizeReactions } from "./products.js";
import { inferWells } from "./trends.js";
import { WELL_META } from "./constants.js";

function makeId(now = new Date()) {
  return `draft-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackCopy(wells, request) {
  return { title: `${WELL_META[wells[0]]?.ko ?? "웰니스"} 루틴 기획전`, subtitle: `${safePlainText(request, 60)} 방향에 맞춰 안전 후보를 준비했습니다.`, cta: "기획전 살펴보기" };
}

function heroMatches(draft) {
  const section = draft?.sections?.find((item) => item.type === "hero");
  return Boolean(section && section.title === draft.hero.copy.title && section.subtitle === draft.hero.copy.subtitle && section.cta === draft.hero.copy.cta);
}

function syncHero(draft) {
  const section = draft.sections.find((item) => item.type === "hero");
  if (section) Object.assign(section, draft.hero.copy);
}

function buildEvidence(draft) {
  const publish = validateForPublish(draft);
  const firstProduct = draft.products[0];
  return [
    {
      id: "request-interpretation", system: "요청 해석", status: "pass",
      summary: `요청을 ${draft.selectedWells.map((well) => WELL_META[well]?.ko).join(", ")} 방향으로 읽었습니다.`,
      evidence: [`원문: ${draft.request}`, `선택 Well: ${draft.selectedWells.join(", ")}`],
      nextAction: "방향이 다르면 요청에 원하는 건강 관심사를 더 구체적으로 적어주세요."
    },
    {
      id: "trend-research", system: "공개 검색 근거", status: draft.research.status === "failed" ? "blocked" : draft.research.acceptedSignals.length ? "pass" : "warn",
      summary: `${draft.research.source}에서 채택 ${draft.research.acceptedSignals.length}개, 제외 ${draft.research.rejectedSignals.length}개를 구분했습니다.`,
      evidence: [`검색 상태: ${draft.research.status}`, `검색 주제: ${draft.research.topic}`, draft.research.fallbackReason ? `이전 성공 결과 사용: ${draft.research.fallbackReason}` : "실시간 또는 주입된 검색 결과 사용"],
      nextAction: "채택 제목과 제외 이유가 요청에 맞는지 확인하세요."
    },
    {
      id: "product-safety", system: "상품 안전 필터", status: draft.products.length ? "pass" : "blocked",
      summary: `품절·기능 누락·Well 불일치·금지 상품명을 제외하고 ${draft.products.length}개 후보가 남았습니다.`,
      evidence: draft.exclusionSummary.length ? draft.exclusionSummary.slice(0, 6).map((item) => `${item.reason}: ${item.count}개`) : ["제외 상품 없음"],
      nextAction: "후보가 부족하면 상품 기능 정보와 재고를 확인하세요."
    },
    {
      id: "recommendation-ranking", system: "추천 순서", status: "pass",
      summary: "평점·리뷰·할인·요청·공개 근거·고객 반응을 점수로 합산했습니다.",
      evidence: [firstProduct ? `현재 1순위: ${firstProduct.name}` : "현재 후보 없음", `반응 점수: ${draft.reactionImpact.totalScore}점`],
      nextAction: "원하는 상품은 운영자 화면에서 위로 이동하거나 제외할 수 있습니다."
    },
    {
      id: "ui-composition", system: "화면 자동 구성", status: "pass",
      summary: `${draft.sections.length}개 화면 영역을 요청과 고객 반응 순서로 조립했습니다.`,
      evidence: draft.sections.map((section, index) => `${index + 1}. ${section.title || section.id} · ${section.type}`),
      nextAction: "영역 위로 버튼으로 고객에게 보일 순서를 바꿀 수 있습니다."
    },
    {
      id: "hero-copy", system: "대표 배너 LLM", status: draft.hero.llm.status === "live" ? "pass" : "blocked",
      summary: draft.hero.llm.status === "live" ? `${draft.hero.llm.provider}에서 배너 문구를 받았습니다.` : "실제 또는 명시적 데모 LLM 문구가 없어 발행을 막았습니다.",
      evidence: [`제목: ${draft.hero.copy.title}`, `버튼: ${draft.hero.copy.cta}`, draft.hero.llm.error ? `오류: ${draft.hero.llm.error}` : `생성 시각: ${draft.hero.llm.generatedAt}`],
      nextAction: draft.hero.llm.status === "live" ? "문구 의미와 안전 상태를 확인하세요." : "서버 LLM 설정을 확인한 뒤 다시 생성하세요."
    },
    {
      id: "copy-safety", system: "고객 문구 안전", status: draft.safety.safe ? "pass" : "blocked",
      summary: draft.safety.safe ? "검수 문구와 실제 노출 문구가 금지 표현 검사를 통과했습니다." : "고객에게 보이면 안 되는 표현이 있습니다.",
      evidence: draft.safety.safe ? ["질병 치료·예방 단정 없음", "과장·의약품 오인 표현 없음"] : draft.safety.violations.map((item) => `${item.field}: ${item.message}`),
      nextAction: draft.safety.safe ? "발행 통제를 확인하세요." : "대표 문구를 수정해야 합니다."
    },
    {
      id: "customer-feedback", system: "고객 반응 재적용", status: draft.reactionImpact.totalEvents ? "pass" : "warn",
      summary: draft.reactionImpact.totalEvents ? `${draft.reactionImpact.totalEvents}건을 다음 추천과 영역 순서에 반영했습니다.` : "아직 고객 반응이 없어 기본 추천을 사용했습니다.",
      evidence: [`클릭 1점·좋아요 3점·구매 7점`, `총 ${draft.reactionImpact.totalScore}점`, draft.reactionImpact.topSection ? `가장 반응이 큰 영역: ${draft.reactionImpact.topSection}` : "반응 영역 없음"],
      nextAction: "발행 후 고객 반응을 기록하고 같은 요청으로 재생성하세요."
    },
    {
      id: "publish-control", system: "발행 통제", status: publish.ok ? "pass" : "blocked",
      summary: publish.ok ? "필수 검사를 모두 통과해 고객 화면에 발행할 수 있습니다." : `${publish.blockers.length}개 문제 때문에 고객 노출을 막았습니다.`,
      evidence: publish.ok ? ["발행 차단 사유 없음"] : publish.blockers,
      nextAction: publish.ok ? "미리보기 확인 후 발행하세요." : "표시된 문제를 해결한 뒤 다시 발행하세요."
    }
  ];
}

function orderSections(sections, reactions) {
  const hero = sections.find((item) => item.type === "hero");
  const rest = sections.filter((item) => item.type !== "hero").sort((a, b) => {
    const delta = (reactions.sectionScores?.[b.id] ?? 0) - (reactions.sectionScores?.[a.id] ?? 0);
    return delta || (a.rank ?? 99) - (b.rank ?? 99);
  });
  return hero ? [hero, ...rest] : rest;
}

export function createDraft({ request, products, rules, trendResult, heroResult, reactions = [], now = new Date() }) {
  const accepted = trendResult?.cleaned?.accepted ?? [];
  const selectedWells = inferWells(request, accepted);
  const reactionImpact = summarizeReactions(reactions);
  const wells = new Set(selectedWells);
  if (reactionImpact.topWell) wells.add(reactionImpact.topWell);
  let { eligible, excluded } = filterEligibleProducts(products, rules, { wells: [...wells] });
  let broadened = false;
  if (eligible.length < 8) {
    ({ eligible, excluded } = filterEligibleProducts(products, rules));
    broadened = true;
  }
  const ranked = rankProducts(eligible, { request, acceptedSignals: accepted, reactionSummary: reactionImpact });
  const publicProducts = ranked.map(publicProduct);
  const copy = heroResult?.status === "live" ? heroResult.copy : fallbackCopy(selectedWells, request);
  const primary = publicProducts[0];
  const sections = [
    { id: "hero-main", type: "hero", rank: 0, title: copy.title, subtitle: copy.subtitle, cta: copy.cta, productId: primary?.id ?? null, style: { tone: selectedWells[0]?.toLowerCase() || "nourish", imageUrl: primary?.imageUrl || "" } },
    { id: "signals", type: "signal-board", rank: 1, title: "추천에 사용한 공개 근거", signals: accepted.slice(0, 4) }
  ];
  selectedWells.forEach((well, index) => {
    const id = `well-${well}`;
    const boosted = (reactionImpact.sectionScores?.[id] ?? 0) > 0;
    const limit = boosted ? 10 : index === 0 ? 8 : 6;
    const productIds = ranked.filter((product) => product.well === well).slice(0, limit).map((product) => product.id);
    if (productIds.length) sections.push({ id, type: index === 0 ? "product-carousel" : "product-grid", rank: 2 + index, title: WELL_META[well].title, well, productIds, reactionBoostApplied: boosted, productLimit: limit });
  });
  sections.push({ id: "why", type: "reason-list", rank: 10, title: "이렇게 추천했어요", reasons: [`${selectedWells.map((well) => WELL_META[well].label).join(", ")} 방향으로 요청을 해석했습니다.`, `${excluded.length}개 상품을 안전 기준으로 제외했습니다.`, reactionImpact.totalEvents ? `고객 반응 ${reactionImpact.totalEvents}건을 순서와 상품 수에 반영했습니다.` : "고객 반응이 없어 기본 점수로 구성했습니다."] });
  const draft = {
    id: makeId(now), request: safePlainText(request, 500), createdAt: now.toISOString(), status: "draft", selectedWells,
    assumptions: [broadened ? "선택 Well 후보가 적어 전체 안전 상품으로 범위를 넓혔습니다." : null, trendResult?.status === "fallback" ? "공개 검색 실패로 이전 성공 결과를 사용했습니다." : null, heroResult?.status !== "live" ? "LLM 문구 생성 실패로 발행 전 연결 확인이 필요합니다." : null].filter(Boolean),
    research: { status: trendResult?.status ?? "failed", source: trendResult?.source ?? "unknown", topic: trendResult?.topic ?? "", fetchedAt: trendResult?.fetchedAt ?? null, fallbackReason: trendResult?.fallbackReason ?? null, error: trendResult?.error ?? null, acceptedSignals: accepted, rejectedSignals: trendResult?.cleaned?.rejected ?? [], counts: trendResult?.cleaned?.counts ?? { raw: 0, accepted: 0, rejected: 0 } },
    hero: { copy, llm: { status: heroResult?.status ?? "failed", provider: heroResult?.provider ?? null, error: heroResult?.error ?? null, generatedAt: heroResult?.generatedAt ?? null } },
    products: publicProducts,
    excludedProducts: excluded.slice(0, 80).map((item) => ({ product: publicProduct(item.product), reasons: item.reasons })),
    exclusionSummary: summarizeExclusions(excluded),
    sections: orderSections(sections, reactionImpact),
    reactionImpact,
    operatorEdits: [], hiddenProductIds: []
  };
  draft.safety = checkDraftSafety(draft, rules);
  draft.evidenceReport = buildEvidence(draft);
  return draft;
}

export function applyDraftEdit(draft, edit, rules) {
  const next = structuredClone(draft);
  let heroChanged = false;
  for (const [input, key, max] of [["heroTitle", "title", 80], ["heroSubtitle", "subtitle", 180], ["heroCta", "cta", 40]]) {
    if (typeof edit[input] === "string") { next.hero.copy[key] = safePlainText(edit[input], max); heroChanged = true; }
  }
  if (heroChanged) syncHero(next);
  if (edit.excludeProductId) {
    if (!next.hiddenProductIds.includes(edit.excludeProductId)) next.hiddenProductIds.push(edit.excludeProductId);
    for (const section of next.sections) if (Array.isArray(section.productIds)) section.productIds = section.productIds.filter((id) => id !== edit.excludeProductId);
  }
  if (edit.moveProductId && ["up", "down"].includes(edit.direction)) {
    for (const section of next.sections) {
      if (!Array.isArray(section.productIds)) continue;
      const index = section.productIds.indexOf(edit.moveProductId);
      if (index < 0) continue;
      const target = edit.direction === "up" ? Math.max(0, index - 1) : Math.min(section.productIds.length - 1, index + 1);
      const [item] = section.productIds.splice(index, 1);
      section.productIds.splice(target, 0, item);
      break;
    }
  }
  if (Array.isArray(edit.sectionOrder)) {
    const order = new Map(edit.sectionOrder.map((id, index) => [id, index]));
    const hero = next.sections.find((item) => item.type === "hero");
    const rest = next.sections.filter((item) => item.type !== "hero").sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    next.sections = hero ? [hero, ...rest] : rest;
  }
  next.operatorEdits.push({ at: new Date().toISOString(), edit });
  next.safety = checkDraftSafety(next, rules);
  next.evidenceReport = buildEvidence(next);
  return next;
}

export function validateForPublish(draft) {
  const blockers = [];
  if (!draft) blockers.push("발행할 초안이 없습니다.");
  if (draft?.research?.status === "failed") blockers.push("공개 검색 또는 검증된 이전 결과가 없습니다.");
  if (draft?.hero?.llm?.status !== "live") blockers.push("대표 배너 문구가 LLM에서 생성되지 않았습니다.");
  if (!draft?.safety?.safe) blockers.push("고객 문구 안전 검사를 통과하지 못했습니다.");
  if (draft && !heroMatches(draft)) blockers.push("검수 문구와 실제 노출 배너가 일치하지 않습니다.");
  const productSections = draft?.sections?.filter((section) => Array.isArray(section.productIds)) ?? [];
  if (!productSections.some((section) => section.productIds.length)) blockers.push("노출 가능한 추천 상품이 없습니다.");
  return { ok: blockers.length === 0, blockers };
}

export function expandDraftForClient(draft) {
  if (!draft) return null;
  const byId = new Map(draft.products.map((product) => [product.id, product]));
  return { ...draft, sections: draft.sections.map((section) => ({ ...section, products: Array.isArray(section.productIds) ? section.productIds.map((id) => byId.get(id)).filter(Boolean) : undefined })) };
}

