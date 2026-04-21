// Storage 관리 유틸 — 용량 조회 + 고아 파일 정리
import { supabaseClient } from './supabase';

const BUCKET = 'product-images';
const FREE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1GB (Supabase 무료 플랜)

/**
 * Storage bucket 내 모든 파일 나열 (재귀)
 */
async function listAllFiles() {
  const allFiles = [];
  async function recurse(prefix = '') {
    const { data, error } = await supabaseClient.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset: 0 });
    if (error) throw error;
    for (const item of data || []) {
      // 폴더(id가 null)이면 재귀
      if (item.id === null || item.metadata === null) {
        await recurse(prefix ? `${prefix}/${item.name}` : item.name);
      } else {
        allFiles.push({
          path: prefix ? `${prefix}/${item.name}` : item.name,
          size: item.metadata?.size || 0,
          created: item.created_at,
        });
      }
    }
  }
  await recurse('');
  return allFiles;
}

/**
 * Storage 사용량 통계
 * @param {Array} products - DB products 배열 (image_urls 포함)
 */
export async function getStorageStats(products = []) {
  const files = await listAllFiles();
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  // DB에 참조된 path 집합
  const referencedPaths = new Set();
  for (const p of products) {
    if (!Array.isArray(p.image_urls)) continue;
    for (const img of p.image_urls) {
      if (Array.isArray(img.paths)) {
        img.paths.forEach((path) => referencedPaths.add(path));
      }
    }
  }

  const orphanFiles = files.filter((f) => !referencedPaths.has(f.path));
  const orphanBytes = orphanFiles.reduce((s, f) => s + f.size, 0);

  return {
    totalBytes,
    totalFiles: files.length,
    limitBytes: FREE_LIMIT_BYTES,
    percentUsed: (totalBytes / FREE_LIMIT_BYTES) * 100,
    referencedCount: files.length - orphanFiles.length,
    orphanFiles,
    orphanBytes,
    productCount: products.filter((p) => Array.isArray(p.image_urls) && p.image_urls.length > 0).length,
  };
}

/**
 * 고아 파일 일괄 삭제
 */
export async function cleanupOrphans(orphanFiles) {
  if (!orphanFiles?.length) return { removed: 0 };
  const paths = orphanFiles.map((f) => f.path);
  // Supabase Storage는 한 번에 여러 파일 삭제 가능
  const chunks = [];
  for (let i = 0; i < paths.length; i += 100) {
    chunks.push(paths.slice(i, i + 100));
  }
  let removed = 0;
  for (const chunk of chunks) {
    const { data, error } = await supabaseClient.storage.from(BUCKET).remove(chunk);
    if (error) {
      console.error('[cleanupOrphans] chunk failed:', error);
      continue;
    }
    removed += data?.length || 0;
  }
  return { removed, total: paths.length };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 1)} ${sizes[i]}`;
}
