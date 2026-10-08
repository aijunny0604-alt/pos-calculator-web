import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArguments, validatePending, validateIntent, validateAction, verifyWork } from '../src/lib/movisValidation.js';
import { checkToolData } from '../src/lib/movisToolData.js';
import { executeDataTool } from '../src/lib/movisDataTools.js';
import { fixture } from './movis-fixtures.mjs';
test('숫자 문자열·NaN·필수 누락·임의 필드를 거부한다', () => {
  const schema = {
    type: 'object',
    properties: {
      qty: {
        type: 'integer',
        minimum: 0
      }
    },
    required: ['qty']
  };
  for (const input of [{
    qty: '3'
  }, {
    qty: NaN
  }, {}, {
    qty: 1,
    execute: true
  }, {
    qty: -2
  }]) assert.ok(validateArguments(input, schema).length);
  assert.deepEqual(validateArguments({
    qty: 0
  }, schema), []);
});
test('상품 검색 페이지에 전체 건수와 다음 페이지를 표시한다', () => {
  const r = executeDataTool('readLibrary', {
    library: 'products',
    limit: 1
  }, fixture);
  assert.equal(r.data.records.length, 1);
  assert.equal(r.data.matchedLoadedRows, 2);
  assert.equal(r.data.nextOffset, 1);
});
test('자료 실패를 빈 데이터로 위장하지 않는다', () => {
  const r = executeDataTool('readLibrary', {
    library: 'products'
  }, {
    products: [],
    dataState: {
      products: {
        status: 'error',
        error: '권한 없음'
      }
    }
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /권한 없음/);
});
test('전체 라이브러리에서 정상적인 0건과 오류를 구분한다', () => {
  const r = executeDataTool('listLibraries', {}, fixture);
  assert.equal(r.data.length, 23);
  assert.equal(r.data.find(x => x.library === 'businessCerts').state.status, 'loaded');
});
test('코드 계산과 0 나누기 검증', () => {
  assert.equal(executeDataTool('calculate', {
    operation: 'multiply',
    values: [6000, 10]
  }, {}).data.value, 60000);
  assert.equal(executeDataTool('calculate', {
    operation: 'divide',
    values: [10, 0]
  }, {}).ok, false);
});
test('원본 조회 없는 변경 미리보기를 차단한다', () => {
  assert.equal(validatePending({
    ok: true,
    data: {
      __pending: true
    }
  }, []).ok, false);
  assert.equal(validatePending({
    ok: true,
    data: {
      __pending: true
    }
  }, [{
    name: 'getProductInfo',
    result: {
      ok: true,
      data: {
        id: 1
      }
    }
  }]).ok, true);
});
test('자체 검증은 도구 오류와 근거를 투명하게 반환한다', () => {
  const r = verifyWork([{
    name: 'readLibrary',
    result: {
      ok: false,
      error: '조회 실패'
    }
  }], fixture);
  assert.equal(r.ok, false);
  assert.equal(r.data.status, 'needs-attention');
  assert.match(r.data.issues[0], /조회 실패/);
});
test('부분 로드를 전체 데이터라고 표시하지 않는다', () => {
  const r = executeDataTool('readLibrary', {
    library: 'products'
  }, {
    products: fixture.products
  });
  assert.ok(r.warnings.length);
  assert.equal(r.data.coverage, 'loaded-records-only');
});
test('매입 발주를 재고 증가나 판매 주문으로 처리하지 않는다', () => {
  assert.ok(validateIntent('updateProductStock', 'purchase_order', {
    newStock: 10
  }).length);
  assert.ok(validateIntent('saveOrder', 'goods_received', {}).length);
  assert.deepEqual(validateIntent('updateProductStock', 'goods_received', {
    newStock: 14
  }), []);
});
test('음수 재고·0개 주문·소수 수량을 사전에 거부한다', () => {
  assert.ok(validateIntent('updateProductStock', 'inventory_correction', {
    newStock: -1
  }).length);
  assert.ok(validateIntent('saveOrder', 'sales_order', {
    items: [{
      quantity: 0
    }]
  }).length);
  assert.ok(validateIntent('saveOrder', 'sales_order', {
    items: [{
      quantity: 1.5
    }]
  }).length);
});
test('단가×수량과 주문 총액의 불일치를 차단한다', () => {
  const order = {
    customerName: '검증',
    items: [{
      id: 1,
      name: '제품',
      quantity: 3,
      price: 10000
    }],
    total: 30000
  };
  assert.deepEqual(validateAction('saveOrder', order), []);
  assert.ok(validateAction('saveOrder', {
    ...order,
    total: 30001
  }).length);
});
test('같은 제품에 대한 일괄 재고 변경 중복을 거부한다', () => {
  assert.ok(validateAction('bulkUpdateProductStock', {
    updates: [{
      productId: 1,
      newStock: 2
    }, {
      productId: 1,
      newStock: 3
    }]
  }).length);
});
test('제품 로드 실패를 품절로 해석하지 못하게 한다', () => {
  assert.equal(checkToolData('getLowStockProducts', {
    dataState: {
      products: {
        status: 'error'
      }
    }
  }).ok, false);
  assert.equal(checkToolData('getLowStockProducts', {
    dataState: {
      products: {
        status: 'loaded'
      }
    }
  }), null);
});
test('보관함에 실제 저장된 이미지 URL만 모델에 전달한다', () => {
  const url = 'https://example.com/photo.png';
  const c = {
    products: [{
      id: 1,
      image_url: url
    }]
  };
  assert.equal(executeDataTool('inspectLibraryImage', {
    library: 'products',
    imageUrl: url
  }, c).ok, true);
  assert.equal(executeDataTool('inspectLibraryImage', {
    library: 'products',
    imageUrl: 'https://example.com/other.png'
  }, c).ok, false);
  assert.equal(executeDataTool('inspectLibraryImage', {
    library: 'products',
    imageUrl: 'file:///secret'
  }, c).ok, false);
});
test('원본 조회 결과에서 임베딩 벡터를 제외한다', () => {
  const r = executeDataTool('readLibrary', {
    library: 'products'
  }, {
    products: [{
      id: 1,
      name: '상품',
      embedding: [1, 2]
    }]
  });
  assert.equal(r.data.records[0].embedding, undefined);
  assert.equal(r.data.records[0].name, '상품');
});
