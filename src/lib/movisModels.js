// 요금제 이름으로 모델 권한을 추측하지 않고 계정이 반환한 카탈로그를 사용한다.
export function selectMovisModel(models = [], preference = 'auto') {
  const visible = models.filter(m => m && typeof m.model === 'string' && !m.hidden);
  if (preference && preference !== 'auto') return visible.find(m => m.model === preference) || null;
  return visible.find(m => m.isDefault) || visible[0] || null;
}
