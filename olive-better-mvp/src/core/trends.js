import { WELL_META, WELL_ORDER } from "./constants.js";
import { safePlainText } from "./safety.js";

function compact(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function words(value) {
  return safePlainText(value, 300).toLowerCase().split(/[^0-9a-zA-Z가-힣]+/).filter((word) => word.length >= 2);
}

export function inferWells(request, signals = []) {
  const text = compact([request, ...signals.slice(0, 8).map((item) => item.title)].join(" "));
  const ranked = WELL_ORDER.map((well) => [well, WELL_META[well].keywords.reduce((score, keyword) => score + (text.includes(compact(keyword)) ? 2 : 0), 0)])
    .sort((a, b) => b[1] - a[1]);
  const selected = ranked.filter(([, score]) => score > 0).slice(0, 3).map(([well]) => well);
  return selected.length ? selected : ["NOURISH", "EAT"];
}

export function createResearchTopic(request) {
  const labels = inferWells(request).map((well) => WELL_META[well].ko).join(" ");
  return `${words(request).slice(0, 5).join(" ") || "웰니스 건강 관리"} ${labels} 트렌드`;
}

function relevanceScore(signal, request) {
  const requestWords = new Set(words(request));
  const titleWords = new Set(words(signal.title));
  let score = [...requestWords].reduce((sum, word) => sum + (titleWords.has(word) ? 2 : 0), 0);
  const title = compact(signal.title);
  for (const well of WELL_ORDER) for (const keyword of WELL_META[well].keywords) if (title.includes(compact(keyword))) score += 1;
  if (title.includes("건강")) score += 1;
  return score;
}

export function cleanTrendSignals(rawSignals, request, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const raw of rawSignals ?? []) {
    const signal = {
      id: raw.id ?? `signal-${accepted.length + rejected.length + 1}`,
      title: safePlainText(raw.title, 180),
      source: safePlainText(raw.source || "공개 소스", 80),
      url: String(raw.url ?? ""),
      publishedAt: raw.publishedAt ?? null,
      fetchedAt: raw.fetchedAt ?? now.toISOString()
    };
    const key = compact(signal.title);
    const reasons = [];
    const relevance = relevanceScore(signal, request);
    if (!signal.title) reasons.push("제목 없음");
    if (seen.has(key)) reasons.push("중복 신호");
    if (signal.publishedAt && now.getTime() - new Date(signal.publishedAt).getTime() > 120 * 86400000) reasons.push("오래된 정보");
    if (/광고|협찬|특가|무료배송|쿠폰/i.test(signal.title)) reasons.push("광고성 정보");
    if (/치료|처방|의약품|병원|부작용|당뇨|고혈압|관절염|불면증|우울증|\?/i.test(signal.title)) reasons.push("의약품·질병 관련 정보");
    if (relevance < 1) reasons.push("MD 요청과 관련성 낮음");
    seen.add(key);
    if (reasons.length) rejected.push({ ...signal, relevance, reasons });
    else accepted.push({ ...signal, relevance, adoptedReason: "요청과 Well 키워드가 연결됨" });
  }
  return {
    accepted: accepted.sort((a, b) => b.relevance - a.relevance).slice(0, 12),
    rejected: rejected.slice(0, 20),
    counts: { raw: rawSignals?.length ?? 0, accepted: accepted.length, rejected: rejected.length }
  };
}
