/**
 * 尝试把任意输入转为有限数值；失败则返回 fallback。
 */
export const clampNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/**
 * 把输入归一化为正数；否则返回 null。
 */
export const normalizePositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}
