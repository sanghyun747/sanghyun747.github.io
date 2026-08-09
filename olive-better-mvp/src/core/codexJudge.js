import { validateForPublish } from "./draft.js";

const REQUIRED = ["request-interpretation", "trend-research", "product-safety", "recommendation-ranking", "ui-composition", "hero-copy", "copy-safety", "customer-feedback", "publish-control"];

function judgementCard(item) {
  const status = ["blocked", "failed"].includes(item.status) ? "blocked" : ["warn", "no-data"].includes(item.status) ? "warn" : "pass";
  return { id: item.id, title: item.system, status, severity: status === "blocked" ? "blocker" : status === "warn" ? "warning" : "info", summary: item.summary, evidence: item.evidence ?? [], nextAction: item.nextAction };
}

export function buildCodexReviewPack(draft) {
  if (!draft) return { available: false, message: "검토할 초안이 없습니다." };
  return {
    generatedAt: new Date().toISOString(), available: true, draftId: draft.id, request: draft.request, selectedWells: draft.selectedWells,
    publishCheck: validateForPublish(draft), evidenceReport: draft.evidenceReport,
    sectionSummary: draft.sections.map((section, index) => ({ order: index + 1, id: section.id, type: section.type, itemCount: section.productIds?.length ?? section.signals?.length ?? section.reasons?.length ?? 0 })),
    endpoints: { reviewPack: `/api/codex/review-pack?draftId=${draft.id}`, search: `/api/codex/evidence-search?draftId=${draft.id}&q=상품`, judgement: `/api/codex/judgement?draftId=${draft.id}` }
  };
}

export function searchEvidenceCards(draft, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return draft?.evidenceReport ?? [];
  return (draft?.evidenceReport ?? []).filter((item) => [item.id, item.system, item.status, item.summary, item.nextAction, ...(item.evidence ?? [])].join("\n").toLowerCase().includes(q));
}

export function judgeEvidenceCards(draft) {
  if (!draft) return { overall: "blocked", summary: "검토할 초안이 없습니다.", counts: { pass: 0, warn: 0, blocked: 1 }, cards: [{ id: "draft", title: "초안", status: "blocked", severity: "blocker", summary: "먼저 초안을 생성하세요.", evidence: [], nextAction: "MD 요청을 입력합니다." }] };
  const cards = (draft.evidenceReport ?? []).map(judgementCard);
  const present = new Set(cards.map((item) => item.id));
  for (const id of REQUIRED.filter((id) => !present.has(id))) cards.push({ id, title: id, status: "blocked", severity: "blocker", summary: "필수 근거 카드가 누락됐습니다.", evidence: [], nextAction: "초안 생성 로직을 확인하세요." });
  const blocked = cards.filter((item) => item.status === "blocked").length;
  const warn = cards.filter((item) => item.status === "warn").length;
  const pass = cards.length - blocked - warn;
  return { generatedAt: new Date().toISOString(), draftId: draft.id, overall: blocked ? "blocked" : warn ? "needs-review" : "ready", summary: blocked ? `${blocked}개 차단 항목을 먼저 해결하세요.` : warn ? `${warn}개 주의 항목을 확인하면 발행할 수 있습니다.` : "모든 자동 판단 기준을 통과했습니다.", counts: { pass, warn, blocked }, cards };
}
