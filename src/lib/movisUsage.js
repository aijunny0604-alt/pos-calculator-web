export function usageWindows(response) {
  const groups = response?.rateLimitsByLimitId || (response?.rateLimits ? { main: response.rateLimits } : {});
  return Object.entries(groups).flatMap(([id, bucket]) => ['primary', 'secondary'].flatMap(key => {
    const window = bucket?.[key];
    if (!window) return [];
    const used = Number.isFinite(window.usedPercent) ? Math.max(0, Math.min(100, window.usedPercent)) : null;
    const minutes = window.windowDurationMins;
    const label = minutes === 10080 ? '주간' : minutes >= 60 ? `${minutes / 60}시간` : minutes > 0 ? `${minutes}분` : key === 'primary' ? '기본 한도' : '추가 한도';
    return [{ id: `${id}-${key}`, bucket: bucket.limitName || id, label, used, remaining: used === null ? null : 100 - used, resetsAt: window.resetsAt }];
  }));
}
