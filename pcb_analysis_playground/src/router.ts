export type PlaygroundRoute = 'home' | 'enig-area'

export const ROUTE_HASH: Record<PlaygroundRoute, string> = {
  home: '#/',
  'enig-area': '#/enig-area',
}

export const getRouteFromHash = (hash: string): PlaygroundRoute => {
  const normalized = String(hash || '').trim()
  if (normalized === ROUTE_HASH['enig-area'] || normalized === '#enig-area' || normalized === '#/enig') {
    return 'enig-area'
  }
  return 'home'
}

