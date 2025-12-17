import type {JSX} from 'preact/jsx-runtime'

import {ROUTE_HASH} from '../router'

export function HomePage(): JSX.Element {
  return (
    <div class="app">
      <header class="hero">
        <div>
          <p class="eyebrow">PCB 分析 Playground</p>
          <h1>选择测试项</h1>
          <p class="lede">用于验证并可视化各类 DFM/面积/规则计算，后续可在此快速扩展更多指标。</p>
        </div>
      </header>

      <section class="home-nav">
        <a class="nav-card" href={ROUTE_HASH['enig-area']}>
          <div class="nav-card__title">沉金面积</div>
          <div class="nav-card__desc">叠层预览轮廓/铜层/阻焊开窗/沉金区域，并展示面积与耗时明细。</div>
          <div class="nav-card__cta">进入「沉金面积测试」</div>
        </a>
      </section>
    </div>
  )
}

