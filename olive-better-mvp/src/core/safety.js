function normalizeTerm(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function normalizeForSafety(value) {
  return normalizeTerm(value);
}

export function checkTextSafety(text, rules) {
  const normalized = normalizeTerm(text);
  const groups = [
    ["banned_disease", "질병 치료·예방 단정"],
    ["banned_exaggerate", "과장 표현"],
    ["banned_medicine", "의약품 오인 표현"]
  ];
  const violations = [];
  for (const [key, label] of groups) {
    for (const term of rules[key] ?? []) {
      if (normalizeTerm(term) && normalized.includes(normalizeTerm(term))) {
        violations.push({ category: key, label, term, message: `${label}: “${term}” 표현이 포함되어 있습니다.` });
      }
    }
  }
  return { safe: violations.length === 0, violations };
}

export function checkDraftSafety(draft, rules) {
  const heroSection = draft?.sections?.find((section) => section.type === "hero");
  const fields = [
    ["검수 제목", draft?.hero?.copy?.title],
    ["검수 설명", draft?.hero?.copy?.subtitle],
    ["검수 버튼", draft?.hero?.copy?.cta],
    ["노출 제목", heroSection?.title],
    ["노출 설명", heroSection?.subtitle],
    ["노출 버튼", heroSection?.cta]
  ];
  const checks = fields.map(([field, value]) => ({ field, value: String(value ?? ""), ...checkTextSafety(value, rules) }));
  const violations = checks.flatMap((check) => check.violations.map((item) => ({ ...item, field: check.field })));
  return { safe: violations.length === 0, checks, violations };
}

export function safePlainText(value, maxLength = 600) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

