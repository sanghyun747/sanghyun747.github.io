import { mkdir, writeFile } from "node:fs/promises";

const distribution = { CARE: 56, EAT: 52, FIT: 69, GLOW: 17, NOURISH: 61, RELAX: 45 };
const meta = {
  CARE: { functional: ["눈 건강", "간 건강", "혈행개선", "EPA 및 DHA 함유 유지"], ingredient: "오메가3", category: "눈·간·혈행" },
  EAT: { functional: ["장 건강", "질 건강", "면역력 증진", "활력"], ingredient: "프로바이오틱스", category: "유산균" },
  FIT: { functional: ["체지방 감소", "관절 건강", "비타민D", "나트륨"], ingredient: "녹차추출물", category: "슬리밍·운동" },
  GLOW: { functional: ["피부 건강", "저분자 피쉬 콜라겐", "비타민A", "이노시톨"], ingredient: "콜라겐", category: "이너뷰티" },
  NOURISH: { functional: ["영양 보충", "항산화", "정상적인 면역 기능", "비타민C"], ingredient: "비타민C", category: "비타민" },
  RELAX: { functional: ["수면 건강", "마그네슘", "뼈 건강", "항산화"], ingredient: "마그네슘", category: "수면·휴식" }
};

const products = [];
let index = 1;
for (const [well, count] of Object.entries(distribution)) {
  for (let offset = 0; offset < count; offset += 1) {
    const id = `OY${String(index).padStart(4, "0")}`;
    const functional = meta[well].functional[offset % meta[well].functional.length];
    const soldOut = offset === count - 1;
    const missingFunctional = offset === count - 2;
    const price = 6900 + ((index * 1700) % 42000);
    const discountRate = (index * 7) % 36;
    products.push({
      id,
      goodsNumber: `A${String(200000000000 + index).padStart(12, "0")}`,
      name: `올리브 베터 데모 ${meta[well].category} 루틴 ${String(offset + 1).padStart(2, "0")}`,
      brand: ["올더베러", "웰니스랩", "그린루틴", "데일리밸런스"][index % 4],
      well,
      category: { upper: "헬스&푸드", middle: "건강식품", lower: meta[well].category, leaf: meta[well].category },
      functional: missingFunctional ? "" : functional,
      ingredient: { name: meta[well].ingredient, value: String(100 + (index % 10) * 50), unit: "mg", percent: "" },
      price: Math.round(price * (1 - discountRate / 100) / 100) * 100,
      orig: price,
      discountRate,
      stock: soldOut ? 0 : 20 + (index * 13) % 300,
      rating: Number((4.3 + (index % 7) / 10).toFixed(1)),
      reviews: 120 + (index * 733) % 40000,
      image: "",
      tags: [functional, meta[well].ingredient, well, index % 3 === 0 ? "best" : "routine"],
      description: `${meta[well].category} 카테고리의 결정론적 MVP 데모 상품입니다.`,
      flags: { best: index % 3 === 0, new: index % 11 === 0, coupon: index % 5 === 0, oliveBetter: true, discount: discountRate > 0 }
    });
    index += 1;
  }
}

const output = new URL("../../data/products.json", import.meta.url);
await mkdir(new URL("../../data/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(products, null, 2)}\n`);
console.log(JSON.stringify({ products: products.length, distribution }, null, 2));

