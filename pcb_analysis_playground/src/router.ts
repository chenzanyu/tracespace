export type PlaygroundRoute = 'home' | 'enig-area' | 'flying-probe'

export const ROUTE_HASH: Record<PlaygroundRoute, string> = {
  home: '#/',
  'enig-area': '#/enig-area',
  'flying-probe': '#/flying-probe',
}

export const getRouteFromHash = (hash: string): PlaygroundRoute => {
  const normalized = String(hash || '').trim()
  if (
    normalized === ROUTE_HASH['flying-probe'] ||
    normalized === '#flying-probe' ||
    normalized === '#/flying' ||
    normalized === '#/probe'
  ) {
    return 'flying-probe'
  }
  if (normalized === ROUTE_HASH['enig-area'] || normalized === '#enig-area' || normalized === '#/enig') {
    return 'enig-area'
  }
  return 'home'
}

