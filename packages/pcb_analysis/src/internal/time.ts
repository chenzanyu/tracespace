/**
 * 高精度时间戳（优先使用 `performance.now()`）。
 */
export const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}
