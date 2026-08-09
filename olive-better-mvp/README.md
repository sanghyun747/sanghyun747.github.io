# Olive Better MD Automation MVP

운영자가 웰니스 기획 요청을 입력하면 공개 검색 근거, 안전 상품, 대표 배너와 고객 화면을 자동으로 만들고 검토·수정·발행하는 프론트엔드 중심 MVP입니다. 고객은 **발행본만** 조회하며 상세·좋아요·모의 구매 반응을 남길 수 있고, 반응은 다음 초안의 상품 점수와 영역 순서에 다시 반영됩니다.

## 빠른 실행

요구 환경은 Node.js 22 이상이며 외부 패키지 설치가 필요하지 않습니다.

```bash
npm test
npm start
```

- 운영자: `http://127.0.0.1:5173`
- 고객: `http://127.0.0.1:5173/customer.html`

자동 데모에서는 외부 LLM 호출 없이 명시적인 테스트 공급자를 사용합니다.

```powershell
$env:OLIVE_MVP_DEMO_MODE='1'
npm start
```

운영 연결은 서버 환경변수 `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` 또는 Gemini·Anthropic 호환 환경변수를 사용합니다. 키는 브라우저나 저장소에 넣지 않습니다. 연결 실패·응답 형식 오류는 성공으로 위장하지 않고 발행을 차단합니다.

## 3분 데모 순서

1. 운영자 화면에서 요청을 확인하고 `근거 조사하고 초안 만들기`를 누릅니다.
2. `왜 이 결과인지` 카드에서 통과·확인·차단, 확인한 사실, 다음 행동을 읽습니다.
3. 공개 검색의 채택 신호와 제외 이유, 상품 제외 요약, 배너 안전 상태를 확인합니다.
4. 필요하면 배너 문구·상품·영역 순서를 수정하고 `검사 통과본 발행`을 누릅니다.
5. 고객 화면에서 발행본만 보이는지 확인하고 같은 상품의 상세·좋아요·구매를 누릅니다.
6. 운영자 화면에서 `고객 반응 반영해 다시 만들기`를 누릅니다.
7. 이벤트 3건·총점 11점과 반응 영역의 순서·상품 수 변화를 확인합니다.

## 검증 명령

```bash
npm test
npm run api:e2e
npm run browser:smoke
npm run judge
```

- `npm test`: 단위·API·보안·UI 계약 21개
- `npm run api:e2e`: 생성→판단→수정→발행→반응 3종→재생성
- `npm run browser:smoke`: 운영자·고객·모바일 실브라우저 조작, 콘솔 오류와 수평 넘침 검사
- `npm run judge`: 최신 초안의 구조화된 Codex 판단 출력

브라우저 스모크는 `agent-browser` CLI가 설치된 검증 환경에서 실행합니다. PATH에 없다면 `AGENT_BROWSER_CLI`에 CLI 실행 파일 또는 JavaScript 진입점 경로를 지정합니다. 앱 자체 실행에는 필요하지 않습니다.

## 핵심 API

| API | 역할 |
|---|---|
| `POST /api/research` | 요청 해석, 검색, LLM 배너, 안전 상품, 화면 초안 생성 |
| `PATCH /api/drafts/:id` | 배너·상품·영역 순서 수정 후 재검사 |
| `POST /api/drafts/:id/publish` | 필수 게이트 통과본만 발행 |
| `GET /api/published` | 고객에게 필요한 발행 투영본만 반환 |
| `POST /api/reactions` | 화면에 실제 노출된 영역·상품 쌍의 반응만 기록 |
| `GET /api/codex/review-pack` | Codex 검토용 구조화 근거 묶음 |
| `GET /api/codex/evidence-search` | 근거 카드 검색 |
| `GET /api/codex/judgement` | 통과·확인·차단 자동 판단 |

## 안전·신뢰 원칙

- 품절, 기능 누락, Well-기능 불일치, 금지 표현 상품, 중복을 제외합니다.
- 띄어쓰기·기호 우회를 정규화해 질병 치료·예방, 과장, 의약품 오인 문구를 차단합니다.
- 검수 배너와 고객 노출 배너가 다르면 발행할 수 없습니다.
- 고객 API는 내부 초안, 제외 상품, 운영자 수정 기록, 판단 근거 전체를 반환하지 않습니다.
- 반응은 발행본에 실제 포함된 `sectionId`와 `productId`의 정확한 조합만 허용합니다.
- 고객 반응 가중치는 상세 1점, 좋아요 3점, 구매 7점입니다.
- 공개 검색 실패 시 검증된 마지막 성공 캐시를 쓰고 사유·기준 시각을 표시합니다.

## 데이터와 범위

원본 300개 상품 파일을 이 환경에서 직접 읽을 수 없어, 알려진 Well 분포를 정확히 맞춘 결정적 데모 카탈로그를 생성했습니다. 이를 실제 올리브영 원본이라고 주장하지 않습니다. 상세 내용은 [`data/PRODUCT_DATA_PROVENANCE.md`](data/PRODUCT_DATA_PROVENANCE.md)에 있습니다.

구현하지 않은 항목은 실제 결제·회원 인증·영구 DB·A/B 테스트·장기 개인화입니다. 구매 버튼은 `purchase` 반응만 기록합니다.

## 제출 산출물

- 화면: `public/`
- 서버·도메인 로직: `src/`
- 테스트: `tests/`
- 스크린샷: `screenshots/`
- AI 협업 기록: [`AI_COLLABORATION.md`](AI_COLLABORATION.md)
- 단계별 검증 원장: [`AGENT_LOOP_LEDGER.md`](AGENT_LOOP_LEDGER.md)
- 최종 제출 보고서: [`FINAL_SUBMISSION_REPORT.md`](FINAL_SUBMISSION_REPORT.md)
- 변경 요약: [`RELEASE_NOTES.md`](RELEASE_NOTES.md)
