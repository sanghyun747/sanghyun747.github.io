import { readFile } from "node:fs/promises";
import { buildCodexReviewPack, judgeEvidenceCards, searchEvidenceCards } from "../core/codexJudge.js";

const value = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] ?? null; };
const file = value("--file");
const query = value("--search");
const draftId = value("--draft");
const base = value("--url") || process.env.CODEX_JUDGE_URL || "http://127.0.0.1:5173";

try {
  if (file) {
    const payload = JSON.parse(await readFile(file, "utf8"));
    const draft = payload.draft ?? payload.latestDraft ?? payload.published ?? payload;
    console.log(JSON.stringify(query ? { query, results: searchEvidenceCards(draft, query) } : { reviewPack: buildCodexReviewPack(draft), judgement: judgeEvidenceCards(draft) }, null, 2));
  } else {
    const path = query ? `/api/codex/evidence-search?q=${encodeURIComponent(query)}${draftId ? `&draftId=${encodeURIComponent(draftId)}` : ""}` : `/api/codex/judgement${draftId ? `?draftId=${encodeURIComponent(draftId)}` : ""}`;
    const response = await fetch(`${base}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(JSON.stringify(await response.json(), null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
