export function storeCatalogFixture() {
  return Array.from({ length: 55 }, (_, i) => ({
    channel_product_no: String(90000000 + i), name: i === 0 ? '샘플 플랜지 FL 63 · 전체 품절' : i === 1 ? '샘플 배기 팁 · 긴 상품명과 옵션별 재고 확인' : `샘플 재고관리 상품 ${i + 1}`,
    status_type: i === 0 ? 'OUTOFSTOCK' : i === 2 ? 'SUSPENSION' : i === 3 ? 'CLOSE' : 'SALE',
    seller_management_code: `SAMPLE_${i}`, sale_price: 33000 + i * 1000,
    synced_at: i === 2 ? '2026-07-16T00:00:00Z' : new Date().toISOString(), option_count: i === 1 ? 30 : 1,
    options: i === 1 ? Array.from({length:30}, (_, n) => ({id:n, name:`${n % 2 ? '블랙' : '티타늄'} · ${63 + n}mm · 옵션 ${n + 1}`, stock:n % 3 === 0 ? 0 : n === 1 ? null : 5, usable:n !== 3, price:0})) : [{id:0,name:'기본',stock:i === 0 ? 0 : 10,usable:true}],
  }));
}
