import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createDraft, applyDraftEdit, expandDraftForClient, validateForPublish } from "./core/draft.js";
import { filterEligibleProducts } from "./core/products.js";
import { inferWells } from "./core/trends.js";
import { generateHeroCopy } from "./services/llm.js";
import { researchTrends } from "./services/trendSource.js";
import { createInitialState, resetState } from "./state.js";
import { buildCodexReviewPack, judgeEvidenceCards, searchEvidenceCards } from "./core/codexJudge.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const defaultProducts = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const defaultRules = JSON.parse(await readFile(new URL("../data/rules.json", import.meta.url), "utf8"));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) { const error = new Error("요청 본문이 너무 큽니다."); error.statusCode = 413; throw error; }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { const error = new Error("요청 JSON 형식이 올바르지 않습니다."); error.statusCode = 400; throw error; }
}

export function createAppServer(options = {}) {
  const products = options.products ?? defaultProducts;
  const rules = options.rules ?? defaultRules;
  const researchImpl = options.researchImpl ?? researchTrends;
  const heroImpl = options.heroImpl ?? generateHeroCopy;
  const state = options.state ?? createInitialState();

  const getDraft = (id) => state.drafts.get(id || state.latestDraftId) ?? null;
  const visiblePublished = () => {
    if (!state.published) return null;
    const products = new Map(state.published.products.map((product) => [product.id, product]));
    return {
      id: state.published.id,
      status: "published",
      publishedAt: state.published.publishedAt,
      sections: state.published.sections.map((section) => ({
        id: section.id,
        type: section.type,
        title: section.title,
        subtitle: section.subtitle,
        cta: section.cta,
        well: section.well,
        productId: section.productId,
        productIds: Array.isArray(section.productIds) ? [...section.productIds] : undefined,
        products: Array.isArray(section.productIds) ? section.productIds.map((id) => products.get(id)).filter(Boolean) : undefined,
        signals: Array.isArray(section.signals) ? section.signals.map((signal) => ({ id: signal.id, title: signal.title, source: signal.source, url: signal.url, publishedAt: signal.publishedAt, adoptedReason: signal.adoptedReason })) : undefined,
        reasons: Array.isArray(section.reasons) ? [...section.reasons] : undefined,
        style: section.style ? { tone: section.style.tone, imageUrl: section.style.imageUrl } : undefined,
        reactionBoostApplied: Boolean(section.reactionBoostApplied)
      }))
    };
  };
  const publishedSectionIds = () => new Set((state.published?.sections ?? []).map((section) => section.id));
  const publishedProductIds = () => new Set((state.published?.sections ?? []).flatMap((section) => section.productIds ?? []));

  async function api(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true, now: new Date().toISOString(), products: products.length, hasPublished: Boolean(state.published), reactions: state.reactions.length });
    if (req.method === "GET" && url.pathname === "/api/catalog") {
      const eligible = filterEligibleProducts(products, rules).eligible.length;
      return sendJson(res, 200, { products: products.length, eligibleProducts: eligible, rules: { bannedCounts: { disease: rules.banned_disease.length, exaggerate: rules.banned_exaggerate.length, medicine: rules.banned_medicine.length } } });
    }
    if (req.method === "GET" && url.pathname === "/api/state") return sendJson(res, 200, { latestDraft: expandDraftForClient(getDraft()), published: visiblePublished(), reactions: state.reactions, lastRequest: state.lastRequest });
    if (req.method === "GET" && url.pathname === "/api/codex/review-pack") { const draft = getDraft(url.searchParams.get("draftId")); return sendJson(res, draft ? 200 : 404, { ok: Boolean(draft), reviewPack: buildCodexReviewPack(draft) }); }
    if (req.method === "GET" && url.pathname === "/api/codex/evidence-search") { const draft = getDraft(url.searchParams.get("draftId")); return sendJson(res, draft ? 200 : 404, { ok: Boolean(draft), query: url.searchParams.get("q") ?? "", results: searchEvidenceCards(draft, url.searchParams.get("q")) }); }
    if (req.method === "GET" && url.pathname === "/api/codex/judgement") { const draft = getDraft(url.searchParams.get("draftId")); return sendJson(res, draft ? 200 : 404, { ok: Boolean(draft), judgement: judgeEvidenceCards(draft) }); }
    if (req.method === "POST" && url.pathname === "/api/reset") { resetState(state); return sendJson(res, 200, { ok: true, message: "초안·발행본·고객 반응을 초기화했습니다." }); }

    if (req.method === "POST" && url.pathname === "/api/research") {
      const body = await readJson(req);
      const request = String(body.request || "").trim();
      if (!request) return sendJson(res, 400, { ok: false, error: "MD 기획 요청을 입력해 주세요." });
      state.lastRequest = request;
      const trendResult = await researchImpl(request, { forceFailure: Boolean(body.forceTrendFailure) });
      const selectedWells = inferWells(request, trendResult.cleaned.accepted);
      const preliminary = filterEligibleProducts(products, rules, { wells: selectedWells }).eligible;
      const heroResult = await heroImpl({ request, selectedWells, acceptedSignals: trendResult.cleaned.accepted, products: preliminary.slice(0, 8) }, { forceFailure: Boolean(body.forceLlmFailure) });
      const draft = createDraft({ request, products, rules, trendResult, heroResult, reactions: state.reactions });
      state.drafts.set(draft.id, draft);
      state.latestDraftId = draft.id;
      return sendJson(res, 200, { ok: true, draft: expandDraftForClient(draft), publishCheck: validateForPublish(draft) });
    }

    const edit = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
    if (req.method === "PATCH" && edit) {
      const draft = getDraft(edit[1]);
      if (!draft) return sendJson(res, 404, { ok: false, error: "초안을 찾을 수 없습니다." });
      const next = applyDraftEdit(draft, await readJson(req), rules);
      state.drafts.set(next.id, next);
      return sendJson(res, 200, { ok: true, draft: expandDraftForClient(next), publishCheck: validateForPublish(next) });
    }

    const publish = url.pathname.match(/^\/api\/drafts\/([^/]+)\/publish$/);
    if (req.method === "POST" && publish) {
      const draft = getDraft(publish[1]);
      const check = validateForPublish(draft);
      if (!check.ok) return sendJson(res, 422, { ok: false, blockers: check.blockers });
      state.published = structuredClone({ ...draft, status: "published", publishedAt: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, published: visiblePublished() });
    }

    if (req.method === "GET" && url.pathname === "/api/published") return sendJson(res, 200, { ok: true, published: visiblePublished() });
    if (req.method === "POST" && url.pathname === "/api/reactions") {
      const body = await readJson(req);
      if (!state.published) return sendJson(res, 409, { ok: false, error: "발행된 기획전이 없습니다." });
      const type = String(body.type || "");
      if (!new Set(["click", "like", "purchase"]).has(type)) return sendJson(res, 400, { ok: false, error: "지원하지 않는 반응 유형입니다." });
      if (typeof body.sectionId !== "string" || typeof body.productId !== "string") return sendJson(res, 400, { ok: false, error: "반응에는 노출 영역과 상품이 모두 필요합니다." });
      if (!publishedSectionIds().has(body.sectionId)) return sendJson(res, 400, { ok: false, error: "발행본에 없는 화면 영역입니다." });
      if (!publishedProductIds().has(body.productId)) return sendJson(res, 400, { ok: false, error: "발행본에 노출되지 않은 상품입니다." });
      const matchedSection = state.published.sections.find((section) => section.id === body.sectionId);
      if (!Array.isArray(matchedSection?.productIds) || !matchedSection.productIds.includes(body.productId)) return sendJson(res, 400, { ok: false, error: "상품이 해당 화면 영역에 노출되지 않았습니다." });
      const product = state.published.products.find((item) => item.id === body.productId);
      const reaction = { id: `reaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, type, customerId: String(body.customerId || "guest").slice(0, 80), productId: body.productId || null, sectionId: body.sectionId || null, well: product?.well ?? null, createdAt: new Date().toISOString() };
      state.reactions.push(reaction);
      return sendJson(res, 200, { ok: true, reaction, total: state.reactions.length });
    }
    if (req.method === "GET" && url.pathname === "/api/reactions") return sendJson(res, 200, { ok: true, reactions: state.reactions, total: state.reactions.length });
    return sendJson(res, 404, { ok: false, error: "API 경로를 찾을 수 없습니다." });
  }

  async function staticFile(_req, res, url) {
    let requested;
    try { requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
    catch { return sendText(res, 400, "Bad request"); }
    const clean = normalize(requested).replace(/^([/\\])+/, "");
    const file = join(PUBLIC_DIR, clean);
    if (relative(PUBLIC_DIR, file).startsWith("..")) return sendText(res, 403, "Forbidden");
    try {
      const buffer = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(buffer);
    } catch { sendText(res, 404, "Not found"); }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try { if (url.pathname.startsWith("/api/")) await api(req, res, url); else await staticFile(req, res, url); }
    catch (error) { sendJson(res, error.statusCode || 500, { ok: false, error: error.message || "알 수 없는 오류가 발생했습니다." }); }
  });
  server.appState = state;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  const host = process.env.HOST || "127.0.0.1";
  createAppServer().listen(port, host, () => console.log(`Olive Better MD automation: http://${host}:${port}`));
}
