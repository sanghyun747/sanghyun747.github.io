const view = { draft: null, published: null, reactions: [], lastRequest: "", judgement: null, searchResults: null };
const $ = (selector, root = document) => root.querySelector(selector);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || payload.blockers?.join(" / ") || "요청에 실패했습니다.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function badge(text, status = "neutral") { return node("span", `badge ${status}`, text); }
function money(value) { return `${Number(value || 0).toLocaleString("ko-KR")}원`; }

function setProgress(message, tone = "neutral", label = "자동화 상태") {
  const banner = $("#progressBanner");
  banner.className = `progress-banner ${tone}`;
  banner.replaceChildren();
  const copy = node("div");
  copy.append(node("span", "step-label", label), node("strong", "", message));
  banner.append(copy);
}

function productCard(product, sectionId) {
  const card = $("#productTemplate").content.firstElementChild.cloneNode(true);
  const image = $(".product-image", card);
  $("span", image).textContent = product.brand?.slice(0, 6) || "BETTER";
  if (product.imageUrl) {
    const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.src = product.imageUrl; img.onerror = () => img.remove(); image.append(img);
  }
  $(".product-brand", card).textContent = product.brand || "브랜드";
  $("h3", card).textContent = product.name;
  $(".functional", card).textContent = product.functional || "기능 정보 없음";
  $(".product-meta", card).textContent = `${product.wellLabel} · ${money(product.price)} · ★ ${product.rating}`;
  const actions = $(".card-actions", card);
  for (const [direction, label] of [["up", "위로"], ["down", "아래로"]]) {
    const button = node("button", "button small", label); button.type = "button"; button.addEventListener("click", () => patchDraft({ moveProductId: product.id, direction })); actions.append(button);
  }
  const exclude = node("button", "button small danger", "제외"); exclude.type = "button"; exclude.addEventListener("click", () => patchDraft({ excludeProductId: product.id })); actions.append(exclude);
  card.dataset.sectionId = sectionId;
  return card;
}

function renderSection(section, draft) {
  const panel = node("section", "panel");
  if (section.type === "hero") {
    const hero = node("div", "hero-preview");
    const copy = node("div"); copy.append(node("span", "step-label", "고객 대표 배너"), node("h2", "", section.title), node("p", "", section.subtitle), badge(section.cta, "pass"));
    hero.append(copy, node("div", "hero-visual", section.well || draft.selectedWells[0] || "WELL")); panel.append(hero); return panel;
  }
  const header = node("div", "panel-header");
  const title = node("div"); title.append(node("h2", "", section.title || section.id), node("p", "", `${section.type} · ${section.id}`));
  const marks = node("div", "badge-row"); if (section.well) marks.append(badge(section.well)); if (section.reactionBoostApplied) marks.append(badge("고객 반응 반영", "warn"));
  header.append(title, marks); panel.append(header);
  if (["product-carousel", "product-grid"].includes(section.type)) {
    const grid = node("div", section.type === "product-carousel" ? "product-rail" : "product-grid");
    for (const product of section.products || []) grid.append(productCard(product, section.id));
    if (!grid.children.length) grid.append(node("p", "muted", "노출 가능한 상품이 없습니다.")); panel.append(grid);
  } else if (section.type === "signal-board") {
    const list = node("ul", "compact-list");
    for (const signal of section.signals || []) list.append(node("li", "", `${signal.title} · ${signal.source}`));
    if (!list.children.length) list.append(node("li", "muted", "채택한 공개 신호가 없습니다.")); panel.append(list);
  } else if (section.type === "reason-list") {
    const list = node("ul", "compact-list"); for (const reason of section.reasons || []) list.append(node("li", "", reason)); panel.append(list);
  } else panel.append(node("p", "muted", `지원하지 않는 영역을 안전하게 건너뜁니다: ${section.type || "unknown"}`));
  return panel;
}

function reviewPanel(draft) {
  const panel = node("section", "panel");
  const header = node("div", "panel-header");
  const title = node("div"); title.append(node("span", "step-label", "STEP 3 · 운영자 확인"), node("h2", "", "대표 문구를 확인하고 발행하세요"), node("p", "", "수정 저장 시 안전 검사를 다시 실행하고 실제 고객 배너와 함께 바꿉니다."));
  header.append(title, badge(draft.safety.safe ? "문구 안전 통과" : "문구 수정 필요", draft.safety.safe ? "pass" : "blocked")); panel.append(header);
  const form = node("div", "edit-grid");
  const titleInput = document.createElement("input"); titleInput.value = draft.hero.copy.title; titleInput.setAttribute("aria-label", "배너 제목");
  const subtitle = document.createElement("input"); subtitle.value = draft.hero.copy.subtitle; subtitle.setAttribute("aria-label", "배너 설명");
  const cta = document.createElement("input"); cta.value = draft.hero.copy.cta; cta.setAttribute("aria-label", "배너 버튼 문구");
  const save = node("button", "button secondary", "문구 수정 저장"); save.type = "button"; save.addEventListener("click", () => patchDraft({ heroTitle: titleInput.value, heroSubtitle: subtitle.value, heroCta: cta.value }));
  form.append(titleInput, subtitle, cta, save); panel.append(form);
  const publish = node("div", "publish-box");
  const check = view.judgement?.overall;
  const copy = node("div"); copy.append(node("strong", "", check === "blocked" ? "차단 원인을 먼저 해결해야 합니다" : "고객 화면에 발행할 준비를 확인하세요"), node("p", "", view.judgement?.summary || "Codex 자동 판단을 불러오는 중입니다."));
  const button = node("button", "button primary", "검사 통과본 발행"); button.type = "button"; button.disabled = check === "blocked"; button.addEventListener("click", publishDraft);
  publish.append(copy, button); panel.append(publish);
  return panel;
}

function evidencePanel(draft) {
  const panel = node("section", "panel");
  const judgement = view.judgement;
  const header = node("div", "panel-header");
  const title = node("div"); title.append(node("span", "step-label", "STEP 2 · CODEX 근거 판단"), node("h2", "", "왜 이 결과인지 한눈에 확인하세요"), node("p", "", "각 카드는 확인한 사실, 판단 이유, 다음 행동을 같은 순서로 보여줍니다."));
  const summary = node("div", "decision-summary");
  for (const [key, label] of [["pass", "통과"], ["warn", "확인"], ["blocked", "차단"]]) { const item = node("span"); item.append(node("b", "", String(judgement?.counts?.[key] ?? 0)), document.createTextNode(label)); summary.append(item); }
  header.append(title, summary); panel.append(header);
  const grid = node("div", "evidence-grid");
  for (const item of judgement?.cards || draft.evidenceReport || []) {
    const status = item.status === "blocked" || item.status === "failed" ? "blocked" : item.status === "warn" || item.status === "no-data" ? "warn" : "pass";
    const card = node("article", `evidence-card ${status}`); const top = node("header"); top.append(node("h3", "", item.title || item.system), badge(status === "pass" ? "통과" : status === "warn" ? "확인" : "차단", status)); card.append(top, node("p", "", item.summary));
    const list = node("ul"); for (const line of (item.evidence || []).slice(0, 5)) list.append(node("li", "", line)); card.append(list, node("div", "next-action", `다음 행동 · ${item.nextAction}`)); grid.append(card);
  }
  panel.append(grid);
  const tools = node("div", "edit-grid");
  const search = document.createElement("input"); search.placeholder = "근거 검색: 상품, LLM, 고객, 발행"; search.setAttribute("aria-label", "Codex 근거 검색어");
  const run = node("button", "button secondary", "근거 카드 검색"); run.type = "button"; run.addEventListener("click", () => searchEvidence(search.value));
  const refresh = node("button", "button", "자동 판단 갱신"); refresh.type = "button"; refresh.addEventListener("click", loadJudgement);
  tools.append(search, run, refresh); panel.append(tools);
  if (view.searchResults) {
    const result = node("div", "panel"); result.append(node("h3", "", `검색 결과 ${view.searchResults.length}개`));
    const list = node("ul", "compact-list"); for (const item of view.searchResults) list.append(node("li", "", `${item.system}: ${item.summary}`)); result.append(list); panel.append(result);
  }
  return panel;
}

function researchPanel(draft) {
  const panel = node("section", "panel");
  const header = node("div", "panel-header"); const title = node("div"); title.append(node("h2", "", "공개 검색 신호와 제외 이유"), node("p", "", `검색 주제 · ${draft.research.topic}`));
  const marks = node("div", "badge-row"); marks.append(badge(draft.research.status, draft.research.status === "failed" ? "blocked" : draft.research.status === "fallback" ? "warn" : "pass")); marks.append(badge(draft.research.source)); header.append(title, marks); panel.append(header);
  if (draft.research.fallbackReason) panel.append(node("p", "next-action", `이전 성공 결과를 사용한 이유 · ${draft.research.fallbackReason}`));
  const columns = node("div", "two-column");
  for (const [label, items, accepted] of [["채택한 신호", draft.research.acceptedSignals, true], ["제외한 신호", draft.research.rejectedSignals, false]]) {
    const wrap = node("div"); wrap.append(node("h3", "", `${label} ${items.length}개`)); const list = node("ul", "compact-list");
    for (const item of items.slice(0, 7)) list.append(node("li", "", accepted ? `${item.title} · ${item.source}` : `${item.title} · ${item.reasons.join(", ")}`)); if (!list.children.length) list.append(node("li", "muted", "표시할 신호 없음")); wrap.append(list); columns.append(wrap);
  }
  panel.append(columns); return panel;
}

function feedbackPanel(draft) {
  const panel = node("section", "panel"); const header = node("div", "panel-header");
  const title = node("div"); title.append(node("h2", "", "고객 반응이 다음 초안에 미친 영향"), node("p", "", "상세 1점, 좋아요 3점, 구매 7점으로 추천과 영역 순서를 조정합니다."));
  const marks = node("div", "badge-row"); marks.append(badge(`이벤트 ${draft.reactionImpact.totalEvents}`, draft.reactionImpact.totalEvents ? "pass" : "neutral"), badge(`점수 ${draft.reactionImpact.totalScore}`)); if (draft.reactionImpact.topSection) marks.append(badge(`상위 ${draft.reactionImpact.topSection}`, "warn")); header.append(title, marks); panel.append(header); return panel;
}

function layoutPanel(draft) {
  const panel = node("section", "panel"); const header = node("div", "panel-header"); const title = node("div"); title.append(node("h2", "", "고객 화면 영역 순서"), node("p", "", "버튼을 누르면 해당 영역을 한 단계 위로 이동합니다.")); header.append(title); panel.append(header);
  const controls = node("div", "section-order");
  const ids = draft.sections.filter((item) => item.type !== "hero").map((item) => item.id);
  for (const section of draft.sections.filter((item) => item.type !== "hero")) { const button = node("button", "button small", `↑ ${section.title}`); button.type = "button"; button.addEventListener("click", () => { const order = [...ids]; const index = order.indexOf(section.id); if (index > 0) [order[index - 1], order[index]] = [order[index], order[index - 1]]; patchDraft({ sectionOrder: order }); }); controls.append(button); }
  panel.append(controls); return panel;
}

function renderDraft() {
  const root = $("#draftRoot"); root.replaceChildren();
  const draft = view.draft;
  if (!draft) { const empty = node("section", "empty-state"); empty.append(node("span", "", "01"), node("h2", "", "먼저 기획 요청을 보내주세요"), node("p", "", "자동화가 무엇을 채택하고 제외했는지 카드마다 쉬운 말로 설명합니다.")); root.append(empty); return; }
  root.append(reviewPanel(draft), evidencePanel(draft), researchPanel(draft), feedbackPanel(draft));
  for (const section of draft.sections) root.append(renderSection(section, draft));
  root.append(layoutPanel(draft));
}

async function loadJudgement() {
  if (!view.draft) return;
  try { view.judgement = (await api(`/api/codex/judgement?draftId=${encodeURIComponent(view.draft.id)}`)).judgement; renderDraft(); }
  catch (error) { setProgress(error.message, "blocked"); }
}

async function searchEvidence(query) {
  if (!view.draft) return;
  try { view.searchResults = (await api(`/api/codex/evidence-search?draftId=${encodeURIComponent(view.draft.id)}&q=${encodeURIComponent(query)}`)).results; renderDraft(); }
  catch (error) { setProgress(error.message, "blocked"); }
}

async function generate(event) {
  event?.preventDefault();
  const request = $("#mdRequest").value.trim();
  if (!request) return setProgress("MD 요청을 입력해 주세요.", "blocked");
  setProgress("공개 근거와 상품을 조사하고 있습니다…", "warn", "자동 조사 진행 중");
  try {
    const payload = await api("/api/research", { method: "POST", body: JSON.stringify({ request, forceTrendFailure: $("#forceTrendFailure").checked, forceLlmFailure: $("#forceLlmFailure").checked }) });
    view.draft = payload.draft; view.lastRequest = request; view.judgement = null; view.searchResults = null;
    setProgress(payload.publishCheck.ok ? "초안이 준비됐습니다. 근거를 확인하고 발행하세요." : `초안은 만들었지만 ${payload.publishCheck.blockers.length}개 문제로 발행이 차단됐습니다.`, payload.publishCheck.ok ? "pass" : "warn");
    renderDraft(); await loadJudgement();
  } catch (error) { setProgress(error.message, "blocked"); }
}

async function patchDraft(edit) {
  if (!view.draft) return;
  try {
    const payload = await api(`/api/drafts/${view.draft.id}`, { method: "PATCH", body: JSON.stringify(edit) });
    view.draft = payload.draft; view.judgement = null; view.searchResults = null; setProgress(payload.publishCheck.ok ? "수정 사항을 저장하고 안전 검사를 다시 통과했습니다." : `수정은 저장했지만 발행 문제가 ${payload.publishCheck.blockers.length}개 남았습니다.`, payload.publishCheck.ok ? "pass" : "warn"); renderDraft(); await loadJudgement();
  } catch (error) { setProgress(error.message, "blocked"); }
}

async function publishDraft() {
  try { await api(`/api/drafts/${view.draft.id}/publish`, { method: "POST", body: "{}" }); setProgress("발행 완료. 고객 화면에는 이 발행본만 표시됩니다.", "pass", "STEP 4 · 발행 완료"); }
  catch (error) { setProgress(`발행 차단 · ${error.message}`, "blocked"); }
}

async function resetAll() {
  try { await api("/api/reset", { method: "POST", body: "{}" }); Object.assign(view, { draft: null, published: null, reactions: [], lastRequest: "", judgement: null, searchResults: null }); renderDraft(); setProgress("초안·발행본·고객 반응을 모두 초기화했습니다.", "pass"); }
  catch (error) { setProgress(error.message, "blocked"); }
}

async function bootstrap() {
  const [health, catalog, state] = await Promise.all([api("/api/health"), api("/api/catalog"), api("/api/state")]);
  $("#serverBadge").className = "status-pill pass"; $("#serverBadge").textContent = `서버 정상 · 상품 ${health.products}`;
  $("#catalogSummary").textContent = `전체 ${catalog.products}개 · 안전 기본 후보 ${catalog.eligibleProducts}개 · 금지표현 규칙 ${Object.values(catalog.rules.bannedCounts).reduce((sum, value) => sum + value, 0)}개`;
  view.draft = state.latestDraft; view.published = state.published; view.reactions = state.reactions; view.lastRequest = state.lastRequest;
  if (view.lastRequest) $("#mdRequest").value = view.lastRequest;
  renderDraft(); if (view.draft) await loadJudgement();
}

$("#requestForm").addEventListener("submit", generate);
$("#rerun").addEventListener("click", () => generate());
$("#reset").addEventListener("click", resetAll);
bootstrap().catch((error) => { $("#serverBadge").className = "status-pill blocked"; $("#serverBadge").textContent = "서버 연결 실패"; setProgress(error.message, "blocked"); });
