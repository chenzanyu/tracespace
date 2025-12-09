import {render} from 'preact'

import {App} from './app'
import './app.css'

const mountNode = document.getElementById('root')

if (mountNode) {
  render(<App />, mountNode)
}
