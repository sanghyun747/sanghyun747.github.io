# 상품 데이터 출처와 사용 범위

`products.json`은 사용자가 제공한 최신 코드 미리보기에 나온 필드와 총 상품 수 300개,
Well 분포(CARE 56, EAT 52, FIT 69, GLOW 17, NOURISH 61, RELAX 45)를
결정론적으로 재현한 MVP 데모 데이터입니다.

원본 `data/products.json` 전문은 로컬 D:와 GitHub에서 확인되지 않았으므로 실제
올리브영 상품 원본과 동일하다고 주장하지 않습니다. 상품명·브랜드·가격·재고·리뷰는
기능 검증용 값이며, 실제 판매·의학적 판단·운영 데이터로 사용할 수 없습니다.

재생성 명령:

```bash
npm run data:generate
```

생성기는 동일한 Node.js 코드에서 항상 300개와 같은 Well 분포를 만듭니다.
