import { safePlainText } from "../core/safety.js";
import { WELL_META } from "../core/constants.js";

export function parseJsonObject(text) {
  const raw = String(text ?? "").trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      try { return JSON.parse(raw.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function normalizeCopy(copy) {
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) return null;
  if (typeof copy.title !== "string" || typeof copy.subtitle !== "string" || typeof copy.cta !== "string") return null;
  const title = safePlainText(copy.title, 48);
  const subtitle = safePlainText(copy.subtitle, 120);
  if (!title || !subtitle) return null;
  const cta = safePlainText(copy?.cta, 40);
  return {
    title,
    subtitle,
    cta: cta.length <= 16 && /보기|만나|확인|시작|살펴|담기|가기/.test(cta) && !/[,/]/.test(cta) ? cta : "기획전 상품 보기"
  };
}

function buildPrompt({ request, selectedWells, acceptedSignals, products }) {
  const wells = selectedWells.map((well) => `${WELL_META[well]?.label}(${WELL_META[well]?.ko})`).join(", ");
  return [
    "올리브영 웰니스 기획전의 안전한 대표 배너 문구를 작성하라.",
    "질병 치료·예방 단정, 의약품 오인, 과장 표현을 쓰지 말라.",
    "JSON 객체만 반환하라: title, subtitle, cta.",
    `MD 요청: ${request}`,
    `선택 Well: ${wells}`,
    `공개 근거: ${acceptedSignals.slice(0, 4).map((item) => item.title).join(" / ") || "부족"}`,
    `후보 상품: ${products.slice(0, 5).map((item) => `${item.name}(${item.functional})`).join(" / ") || "부족"}`
  ].join("\n\n");
}

async function requestJson(url, init, fetchImpl, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = parseJsonObject(text);
    if (!payload) throw new Error("응답 JSON 해석 실패");
    return payload;
  } finally { clearTimeout(timeout); }
}

async function callOpenAI(prompt, env, fetchImpl) {
  if (!env.OPENAI_API_KEY) return null;
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  const payload = await requestJson(base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, temperature: 0.5, max_tokens: 220, messages: [{ role: "system", content: "Return only valid JSON." }, { role: "user", content: prompt }] })
  }, fetchImpl);
  const copy = normalizeCopy(parseJsonObject(payload.choices?.[0]?.message?.content));
  if (!copy) throw new Error("OpenAI 호환 LLM 문구 JSON에 필수 필드가 없습니다.");
  return { provider: `openai-compatible:${model}`, copy };
}

async function callGemini(prompt, env, fetchImpl) {
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) return null;
  const model = env.GOOGLE_MODEL || "gemini-1.5-flash";
  const base = (env.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const payload = await requestJson(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
  }, fetchImpl);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n");
  const copy = normalizeCopy(parseJsonObject(text));
  if (!copy) throw new Error("Gemini 문구 JSON에 필수 필드가 없습니다.");
  return { provider: `google-gemini:${model}`, copy };
}

async function callAnthropic(prompt, env, fetchImpl) {
  const key = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN;
  if (!key) return null;
  const model = env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const base = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  const payload = await requestJson(base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 260, system: "Return only valid JSON.", messages: [{ role: "user", content: prompt }] })
  }, fetchImpl);
  const copy = normalizeCopy(parseJsonObject(payload.content?.map((part) => part.text).join("\n")));
  if (!copy) throw new Error("Anthropic 문구 JSON에 필수 필드가 없습니다.");
  return { provider: `anthropic-compatible:${model}`, copy };
}

export async function generateHeroCopy(context, options = {}) {
  const env = options.env ?? process.env;
  const generatedAt = new Date().toISOString();
  if (options.forceFailure) return { status: "failed", provider: null, error: "데모 옵션으로 LLM 실패를 강제했습니다.", generatedAt: null, copy: null };
  if (env.OLIVE_MVP_DEMO_MODE === "1") {
    return { status: "live", provider: "deterministic-demo-provider", generatedAt, copy: { title: "오늘을 가볍게 잇는 웰니스 루틴", subtitle: "공개 근거와 상품 안전 기준을 확인한 추천을 만나보세요.", cta: "추천 상품 보기" } };
  }
  const prompt = buildPrompt(context);
  const fetchImpl = options.fetchImpl ?? fetch;
  const errors = [];
  for (const caller of [callOpenAI, callAnthropic, callGemini]) {
    try {
      const result = await caller(prompt, env, fetchImpl);
      if (result) return { status: "live", generatedAt, ...result };
    } catch (error) { errors.push(error.message); }
  }
  return { status: "failed", provider: null, error: errors.join("; ") || "사용 가능한 LLM 환경변수가 없습니다.", generatedAt: null, copy: null };
}
