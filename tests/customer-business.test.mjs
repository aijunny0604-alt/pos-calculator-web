import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusinessProfile, formatBusinessNumber } from '../src/lib/customerBusiness.mjs';
test('사업자번호 표기와 공백을 정규화하고 허용 필드만 저장한다', () => {
  const result = normalizeBusinessProfile({ company_name:' 새 상호 ', business_number:'123-45-67890', business_change_count:99 });
  assert.equal(result.company_name,'새 상호'); assert.equal(result.business_number,'1234567890');
  assert.equal(result.business_change_count,undefined); assert.equal(formatBusinessNumber(result.business_number),'123-45-67890');
});
test('필수 정보와 잘못된 번호, 과도한 입력을 거부한다', () => {
  for (const value of [{}, {company_name:'상호',business_number:'123'}, {company_name:'상호',business_number:'1234567890',address:'x'.repeat(501)}]) assert.throws(() => normalizeBusinessProfile(value));
});
