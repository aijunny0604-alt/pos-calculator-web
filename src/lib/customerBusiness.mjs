export const BUSINESS_FIELDS = [
  ['company_name', '상호'], ['business_number', '사업자등록번호'],
  ['representative', '대표자'], ['address', '사업장 주소'],
  ['business_type', '업태'], ['business_item', '종목'],
];
export function normalizeBusinessProfile(value = {}) {
  const profile = Object.fromEntries(BUSINESS_FIELDS.map(([key]) => [key, String(value[key] ?? '').trim()]));
  profile.business_number = profile.business_number.replace(/[\s-]/g, '');
  if (profile.business_number && !/^\d{10}$/.test(profile.business_number)) throw new Error('사업자등록번호는 숫자 10자리로 입력해주세요.');
  if (!profile.company_name || !profile.business_number) throw new Error('상호와 사업자등록번호를 입력해주세요.');
  if (Object.values(profile).some(value => value.length > 500)) throw new Error('입력 내용이 너무 깁니다. 각 항목을 500자 이내로 입력해주세요.');
  return profile;
}
export function formatBusinessNumber(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  return /^\d{10}$/.test(digits) ? `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}` : value || '미등록';
}
