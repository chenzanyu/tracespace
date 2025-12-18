import type {JSX} from 'preact/jsx-runtime'
import {useEffect, useState} from 'preact/hooks'

import {EnigAreaPage} from './pages/enig-area'
import {FlyingProbePage} from './pages/flying-probe'
import {HomePage} from './pages/home'
import {getRouteFromHash} from './router'

export function App(): JSX.Element {
  const [route, setRoute] = useState(() => getRouteFromHash(window.location.hash))

  useEffect(() => {
    const handleChange = () => setRoute(getRouteFromHash(window.location.hash))
    window.addEventListener('hashchange', handleChange)
    return () => window.removeEventListener('hashchange', handleChange)
  }, [])

  if (route === 'enig-area') {
    return <EnigAreaPage />
  }

  if (route === 'flying-probe') {
    return <FlyingProbePage />
  }

  return <HomePage />
}

