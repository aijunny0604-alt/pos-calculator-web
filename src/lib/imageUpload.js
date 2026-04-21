// 제품 이미지 업로드 유틸
// - 클라이언트에서 Canvas로 자동 리사이즈 + WebP 변환
// - Supabase Storage `product-images` bucket에 업로드
// - 썸네일(400px) + 원본(1200px) 2종 생성

import { supabaseClient, SUPABASE_URL } from './supabase';

const BUCKET = 'product-images';
const THUMB_SIZE = 400;   // 카드 썸네일
const FULL_SIZE = 1200;   // 갤러리 원본
const THUMB_QUALITY = 0.8;
const FULL_QUALITY = 0.85;

/**
 * 파일을 Image 엘리먼트로 로드
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')); };
    img.src = url;
  });
}

/**
 * Canvas로 리사이즈하여 WebP Blob 반환
 */
function resizeToBlob(img, maxSize, quality) {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, tw, th);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Blob 변환 실패'));
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });
}

/**
 * 단일 파일을 업로드 → { thumb, full, path } 반환
 * @param {File} file - 원본 이미지
 * @param {number|string} productId - 제품 ID (폴더 구분용)
 */
export async function uploadProductImage(file, productId) {
  if (!file) throw new Error('파일이 없습니다');
  if (!productId) throw new Error('제품 ID 누락');

  // 1) 이미지 로드
  const img = await loadImage(file);

  // 2) 썸네일 + 원본 Blob 생성
  const [thumbBlob, fullBlob] = await Promise.all([
    resizeToBlob(img, THUMB_SIZE, THUMB_QUALITY),
    resizeToBlob(img, FULL_SIZE, FULL_QUALITY),
  ]);

  // 3) 파일 경로 생성 (충돌 방지 위해 타임스탬프)
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  const basePath = `${productId}/${ts}-${rand}`;
  const thumbPath = `${basePath}-thumb.webp`;
  const fullPath = `${basePath}-full.webp`;

  // 4) Supabase Storage 업로드
  const { data: thumbData, error: thumbErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(thumbPath, thumbBlob, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1년 캐시
      upsert: false,
    });
  if (thumbErr) throw new Error(`썸네일 업로드 실패: ${thumbErr.message}`);

  const { data: fullData, error: fullErr } = await supabaseClient.storage
    .from(BUCKET)
    .upload(fullPath, fullBlob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
  if (fullErr) {
    // 썸네일만 남지 않도록 정리
    await supabaseClient.storage.from(BUCKET).remove([thumbPath]).catch(() => {});
    throw new Error(`원본 업로드 실패: ${fullErr.message}`);
  }

  // 5) Public URL 생성
  const { data: thumbPub } = supabaseClient.storage.from(BUCKET).getPublicUrl(thumbPath);
  const { data: fullPub } = supabaseClient.storage.from(BUCKET).getPublicUrl(fullPath);

  return {
    thumb: thumbPub.publicUrl,
    full: fullPub.publicUrl,
    paths: [thumbPath, fullPath], // 삭제 시 사용
    size: thumbBlob.size + fullBlob.size,
  };
}

/**
 * 여러 파일을 순차 업로드
 * @param {File[]} files
 * @param {number|string} productId
 * @param {(current: number, total: number) => void} onProgress
 */
export async function uploadMany(files, productId, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    try {
      const r = await uploadProductImage(files[i], productId);
      results.push(r);
    } catch (e) {
      console.error(`[uploadMany] file ${i} failed:`, e);
      results.push({ error: e.message });
    }
  }
  onProgress?.(files.length, files.length);
  return results;
}

/**
 * Storage에서 이미지 파일 삭제
 * @param {string[]} paths - 여러 경로 동시 삭제 가능
 */
export async function deleteImages(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return { success: true };
  const { data, error } = await supabaseClient.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('[deleteImages] failed:', error);
    return { success: false, error: error.message };
  }
  return { success: true, removed: data?.length || 0 };
}

/**
 * 파일 크기를 사람이 읽기 쉽게
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
