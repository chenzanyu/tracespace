import type {JSX} from 'preact/jsx-runtime'

export function App(): JSX.Element {
  return (
    <div class="app">
      <header>
        <div>
          <p class="eyebrow">PCB Analysis Playground</p>
          <h1>PCB Analysis Playground</h1>
          <p class="lede">
            The <code>@tracespace/pcb-analysis</code> package is being refactored to use{' '}
            <code>geos-wasm</code>. This playground will be updated once the new DFM metrics land.
          </p>
        </div>
      </header>

      <section class="controls">
        <p class="lede">No interactive demo is wired up yet.</p>
      </section>
    </div>
  )
}

