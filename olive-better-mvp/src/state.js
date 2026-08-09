export function createInitialState() {
  return { drafts: new Map(), latestDraftId: null, published: null, reactions: [], lastRequest: "" };
}

export function resetState(state) {
  state.drafts.clear();
  state.latestDraftId = null;
  state.published = null;
  state.reactions = [];
  state.lastRequest = "";
}
