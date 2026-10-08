import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/.artifacts', {
  recursive: true
});
buildSync({
  entryPoints: ['src/lib/movisActionGuard.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'tests/.artifacts/guard.mjs',
  logLevel: 'silent'
});
const {
  checkActionBeforeCommit
} = await import('./.artifacts/guard.mjs');
const pending = {
  action: 'updateProductStock',
  params: {
    productId: 1,
    newStock: 14
  },
  preconditions: [{
    table: 'products',
    id: 1,
    values: {
      stock: 4
    }
  }]
};
const client = (data, error = null) => ({
  from: () => ({
    select: () => ({
      in: async () => ({
        data,
        error
      })
    })
  })
});
test('조회 후 재고가 바뀌면 실행을 차단한다', async () => {
  await assert.rejects(() => checkActionBeforeCommit(pending, client([{
    id: 1,
    stock: 9
  }])), /변경되었습니다/);
});
test('실행 전 조회 오류나 삭제된 대상이면 차단한다', async () => {
  await assert.rejects(() => checkActionBeforeCommit(pending, client([])), /삭제되었습니다/);
  await assert.rejects(() => checkActionBeforeCommit(pending, client(null, {
    message: 'timeout'
  })), /확인하지 못했습니다/);
});
test('최신 재고가 동일할 때만 실행 단계로 넘긴다', async () => {
  assert.equal(await checkActionBeforeCommit(pending, client([{
    id: 1,
    stock: 4
  }])), true);
});
