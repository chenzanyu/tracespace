export interface BackendParseResponse<T = unknown> {
  Data?: T
  data?: T
  Items?: unknown
  items?: unknown
}

export interface BackendMemoryLayer {
  filename: string
  type?: string
  side?: string
  gerber: string
}

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''))

const getProp = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object') return undefined
  return (value as Record<string, unknown>)[key]
}

const getArrayProp = (value: unknown, key: string): unknown[] | null => {
  const prop = getProp(value, key)
  return Array.isArray(prop) ? prop : null
}

const normalizeMaybeString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined
  const str = normalizeString(value).trim()
  return str.length ? str : undefined
}

const lowerOrUndefined = (value: unknown): string | undefined => {
  const str = normalizeMaybeString(value)
  return str ? str.toLowerCase() : undefined
}

const extractItems = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as BackendParseResponse
  const data = (root.Data ?? root.data ?? payload) as unknown
  const fromData = getArrayProp(data, 'Items') ?? getArrayProp(data, 'items')
  if (fromData) return fromData
  const fromRoot = getArrayProp(root, 'Items') ?? getArrayProp(root, 'items')
  if (fromRoot) return fromRoot
  if (Array.isArray(data)) return data
  return []
}

export async function parseGerberArchiveViaBackend(params: {
  endpoint: string
  file: File
}): Promise<{layers: BackendMemoryLayer[]; raw: unknown}> {
  const formData = new FormData()
  formData.append('UploadFile', params.file, params.file.name)

  const response = await fetch(params.endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      accept: '*/*',
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const raw: unknown =
    contentType.includes('application/json')
      ? await response.json()
      : await response.text().catch(() => null)

  if (!response.ok) {
    const message =
      typeof raw === 'string'
        ? raw
        : normalizeString(getProp(raw, 'Message') ?? getProp(raw, 'message') ?? response.statusText)
    throw new Error(`后端解析失败（${response.status}）：${message}`)
  }

  const items = extractItems(raw)
  const layers = items
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const filename = normalizeString(obj.filename ?? obj.Filename ?? '')
      const type = lowerOrUndefined(obj.type ?? obj.Type)
      const side = lowerOrUndefined(obj.side ?? obj.Side)
      const gerber = normalizeString(obj.gerber ?? obj.Gerber ?? '')
      if (!filename || !gerber) return null
      return {filename, type, side, gerber}
    })
    .filter((layer): layer is BackendMemoryLayer => Boolean(layer))

  return {layers, raw}
}
