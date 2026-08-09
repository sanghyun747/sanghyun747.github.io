import { PRODUCT_IMAGE_BASE, REACTION_WEIGHTS, WELL_META, WELL_ORDER } from "./constants.js";
import { checkTextSafety } from "./safety.js";

function compact(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function isFunctionalAllowed(product, rules) {
  const allowed = rules.well_functional?.[product.well] ?? [];
  const functional = compact(product.functional);
  if (!functional) return false;
  return allowed.some((item) => {
    const value = compact(item);
    return functional === value || functional.includes(value);
  });
}

export function filterEligibleProducts(products, rules, options = {}) {
  const selectedWells = new Set(options.wells?.length ? options.wells : WELL_ORDER);
  const seenGoods = new Set();
  const seenNames = new Set();
  const eligible = [];
  const excluded = [];
  for (const product of products) {
    const reasons = [];
    const goodsKey = compact(product.goodsNumber || product.id);
    const nameKey = compact(product.name);
    if (!selectedWells.has(product.well)) reasons.push("선택한 Well 범위 밖");
    if (!Number.isFinite(product.stock) || product.stock <= 0) reasons.push("품절");
    if (!product.functional) reasons.push("건강 기능 정보 없음");
    if (!checkTextSafety(product.name, rules).safe) reasons.push("상품명 금지 표현 포함");
    if (product.functional && !isFunctionalAllowed(product, rules)) reasons.push("Well과 건강 기능 불일치");
    if (seenGoods.has(goodsKey) || seenNames.has(nameKey)) reasons.push("중복 상품");
    if (reasons.length) {
      excluded.push({ product, reasons });
      continue;
    }
    seenGoods.add(goodsKey);
    seenNames.add(nameKey);
    eligible.push(product);
  }
  return { eligible, excluded };
}

export function summarizeExclusions(excluded) {
  const counts = {};
  for (const item of excluded) for (const reason of item.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
  return Object.entries(counts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function productImageUrl(product) {
  if (!product?.image) return "";
  return /^https?:\/\//.test(product.image) ? product.image : `${PRODUCT_IMAGE_BASE}${product.image}`;
}

export function publicProduct(product) {
  return {
    id: product.id,
    goodsNumber: product.goodsNumber,
    name: product.name.trim(),
    brand: product.brand,
    well: product.well,
    wellLabel: WELL_META[product.well]?.label ?? product.well,
    functional: product.functional,
    price: product.price,
    orig: product.orig,
    discountRate: product.discountRate,
    stock: product.stock,
    rating: product.rating,
    reviews: product.reviews,
    tags: product.tags ?? [],
    flags: product.flags ?? {},
    imageUrl: productImageUrl(product)
  };
}

export function summarizeReactions(reactions = []) {
  const sectionScores = {};
  const productScores = {};
  const wellScores = {};
  let totalScore = 0;
  for (const reaction of reactions) {
    const weight = REACTION_WEIGHTS[reaction.type] ?? 0;
    totalScore += weight;
    if (reaction.sectionId) sectionScores[reaction.sectionId] = (sectionScores[reaction.sectionId] ?? 0) + weight;
    if (reaction.productId) productScores[reaction.productId] = (productScores[reaction.productId] ?? 0) + weight;
    if (reaction.well) wellScores[reaction.well] = (wellScores[reaction.well] ?? 0) + weight;
  }
  return {
    totalEvents: reactions.length,
    totalScore,
    sectionScores,
    productScores,
    wellScores,
    topSection: Object.entries(sectionScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    topWell: Object.entries(wellScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  };
}

export function scoreProduct(product, context = {}) {
  const request = compact(context.request);
  const trend = compact((context.acceptedSignals ?? []).map((item) => item.title).join(" "));
  const text = compact([product.name, product.brand, product.functional, product.category?.leaf, ...(product.tags ?? [])].join(" "));
  let score = Number(product.rating ?? 0) * 8 + Math.log10(Number(product.reviews ?? 0) + 1) * 4;
  score += Number(product.discountRate ?? 0) * 0.15;
  if (product.flags?.best) score += 4;
  if (product.flags?.oliveBetter) score += 3;
  if (request.includes(compact(product.functional))) score += 5;
  for (const keyword of WELL_META[product.well]?.keywords ?? []) {
    const key = compact(keyword);
    if (key && text.includes(key) && (request.includes(key) || trend.includes(key))) score += 2;
  }
  score += (context.reactionSummary?.productScores?.[product.id] ?? 0) * 5;
  score += (context.reactionSummary?.wellScores?.[product.well] ?? 0) * 1.5;
  return score;
}

export function rankProducts(products, context = {}) {
  return [...products]
    .map((product) => ({ product, score: scoreProduct(product, context) }))
    .sort((a, b) => b.score - a.score || b.product.reviews - a.product.reviews)
    .map((item) => item.product);
}
