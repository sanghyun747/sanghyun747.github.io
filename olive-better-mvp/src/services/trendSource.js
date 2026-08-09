import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cleanTrendSignals, createResearchTopic } from "../core/trends.js";

const CACHE_FILE = new URL("../../data/cache/trend-last-success.json", import.meta.url);

function decodeXml(value = "") {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

export function parseGoogleNewsRss(xml, fetchedAt = new Date().toISOString()) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 30).map((item, index) => {
    const block = item[1];
    const published = tagValue(block, "pubDate");
    return {
      id: `google-news-${index + 1}`,
      title: tagValue(block, "title").replace(/\s+-\s+[^-]+$/, ""),
      source: tagValue(block, "source") || "Google News",
      url: tagValue(block, "link"),
      publishedAt: published && !Number.isNaN(new Date(published).getTime()) ? new Date(published).toISOString() : null,
      fetchedAt
    };
  });
}

function validCache(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.rawSignals) && typeof payload.fetchedAt === "string";
}

async function loadCache() {
  try {
    const payload = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    return validCache(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function saveCache(payload) {
  await mkdir(new URL("../../data/cache/", import.meta.url), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify({ ...payload, schemaVersion: "trend-cache-v1" }, null, 2)}\n`);
}

export async function fetchGoogleNewsSignals(topic, options = {}) {
  if (options.forceFailure) throw new Error("데모 옵션으로 공개 검색 실패를 강제했습니다.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=ko&gl=KR&ceid=KR:ko`;
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "user-agent": "olive-better-md-automation/1.1" } });
    if (!response.ok) throw new Error(`Google News RSS 응답 실패: ${response.status}`);
    return { source: "Google News RSS", sourceUrl: url, rawSignals: parseGoogleNewsRss(await response.text()) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function researchTrends(request, options = {}) {
  const topic = createResearchTopic(request);
  const fetchedAt = new Date().toISOString();
  try {
    const live = await fetchGoogleNewsSignals(topic, options);
    const result = { status: "live", source: live.source, sourceUrl: live.sourceUrl, topic, fetchedAt, rawSignals: live.rawSignals, cleaned: cleanTrendSignals(live.rawSignals, request, { now: options.now }) };
    if (live.rawSignals.length) await saveCache(result);
    return result;
  } catch (error) {
    const cached = await loadCache();
    if (cached) {
      return { ...cached, status: "fallback", source: cached.source || "검증된 이전 검색", topic, fallbackReason: error.message, cleaned: cleanTrendSignals(cached.rawSignals, request, { now: options.now }) };
    }
    return { status: "failed", source: "Google News RSS", topic, fetchedAt, error: error.message, rawSignals: [], cleaned: cleanTrendSignals([], request, { now: options.now }) };
  }
}

