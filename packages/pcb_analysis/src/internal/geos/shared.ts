import initGeosJs from 'geos-wasm'

/**
 * `geos-wasm` 的模块实例类型。
 *
 * 这里包含 GEOS C-API 的 wasm 绑定，以及 `Module._malloc/_free` 等低层接口。
 */
export type GeosModule = Awaited<ReturnType<typeof initGeosJs>>

let sharedGeosPromise: Promise<GeosModule> | null = null

/**
 * 获取共享的 GEOS wasm 实例（单例）。
 *
 * - 首次调用会初始化 wasm，并设置 `errorHandler/noticeHandler`，避免 GEOS 在控制台刷屏
 * - 之后所有调用复用同一个 Promise（避免重复初始化 wasm）
 */
export const getSharedGeos = async (): Promise<GeosModule> => {
  if (!sharedGeosPromise) {
    const maxErrorLogs = 25
    let errorLogCount = 0
    const errorCountsByKey = new Map<string, number>()
    const maxNoticeLogs = 25
    let noticeLogCount = 0
    sharedGeosPromise = initGeosJs({
      errorHandler: message => {
        const normalized = String(message || '')
        const key =
          normalized.startsWith('TopologyException:')
            ? 'TopologyException'
            : normalized.startsWith('IllegalArgumentException: Overlay input is mixed-dimension')
              ? 'Overlay input is mixed-dimension'
              : normalized
        if (key === 'TopologyException' || key === 'Overlay input is mixed-dimension') return
        const perKeyCount = (errorCountsByKey.get(key) ?? 0) + 1
        errorCountsByKey.set(key, perKeyCount)
        if (perKeyCount > 3) return
        errorLogCount += 1
        if (errorLogCount <= maxErrorLogs) {
          console.warn('[pcb-analysis][geos] error', message)
        } else if (errorLogCount === maxErrorLogs + 1) {
          console.warn('[pcb-analysis][geos] further errors suppressed')
        }
      },
      noticeHandler: message => {
        noticeLogCount += 1
        if (noticeLogCount <= maxNoticeLogs) {
          console.info('[pcb-analysis][geos] notice', message)
        } else if (noticeLogCount === maxNoticeLogs + 1) {
          console.info('[pcb-analysis][geos] further notices suppressed')
        }
      },
    })
  }
  return sharedGeosPromise
}
