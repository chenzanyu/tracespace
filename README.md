# gerber_viewer 组件文档

此文档仅涵盖 `gerber_viewer` 中暴露的两个核心 Vue 组件：`<GerberViewer>` 与 `<Pcb3dPreview>`。示例代码均基于 `setup` 语法糖，所有尺寸单位默认使用 **毫米**。

## `<GerberViewer>`

| 参数名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `boardThicknessMm` | `Number` | `1.6` | 可选，指定整块 PCB 的物理厚度（毫米）。若未提供，则使用默认 1.6 mm；该值会影响 3D 视图中各层的厚度缩放。 |

### 用法

```vue
<template>
  <GerberViewer :board-thickness-mm="2.0" />
</template>

<script setup>
import GerberViewer from './gerber_viewer/src/components/GerberViewer.vue'
</script>
```

### 注意事项

- 组件内置上传、图层排序、Pixi/Three 渲染等完整流程；无需手工与 worker 通讯。
- 会通过 `perf-stats`、`loading-change` 等事件在内部流转性能数据，不建议直接监听。若确有需要，可参考源码实现。
- 层的顶点简化容差通过 `<Pcb3dPreview>` 控制（参见下文）。

## `<Pcb3dPreview>`

| 参数名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `modelData` | `Object` | `{ layers: [], version: 0 }` | PCB 3D 模型数据。`layers` 为 worker 产出的 mesh 列表。 |
| `thickness` | `Number` | `1.6` | 核心层厚度，单位与 `modelData` 的坐标系一致（通常是 Gerber 单位）。 |
| `borderColor` | `String` | `rgb(255, 235, 150)` | 板边及裸露铜色。 |
| `coreColor` | `String` | `rgb(234, 226, 118)` | 板芯颜色。 |
| `layerColors` | `Object` | `{}` | 覆盖 `copper / soldermask / silkscreen / solderpaste` 等层的默认颜色。 |
| `layerVisibility` | `Object` | `{}` | 控制各层是否可见（布尔值）。 |
| `backgroundColor` | `String` | `#0f1220` | Three.js 场景背景色。 |
| `containerWidth` / `containerHeight` | `String` | `100%` | 容器宽高，可用 CSS 长度。 |
| `displayWidth` / `displayHeight` | `Number` | `0` | 外部布局系统传入的实际像素尺寸；为 `0` 时自动测量。 |
| `explosionActive` | `Boolean` | `false` | 是否启用层间爆炸视图。 |
| `fitPadding` | `Number` | `1.1` | 相机自适应时的边距放大倍数。 |
| `fitLerpMs` | `Number` | `150` | 相机自动平移的插值时长，单位毫秒。 |
| `explosionSpacingMultiplier` | `Number` | `4` | 爆炸视图的层间距系数。 |
| `active` | `Boolean` | `true` | 控制组件是否渲染（`false` 时释放 GPU 资源）。 |
| `layerSimplifyTolerancesMm` | `Object` | `{ copper: 0.5, soldermask: 0.5, silkscreen: 0.5, drill: 0.5, outline: 0.5 }` | **新增**。以毫米表示的顶点简化容差。键名为层类型，若未提供则使用 `default` 或内建 0.5 mm。渲染前会按 Gerber 坐标单位自动换算为内部容差。数值越大，网格越粗糙但生成速度更快。 |
| `drillLimit` | `Number` | `Infinity` | **新增**。限制参与钻孔布尔裁剪与渲染的钻孔图形数量。若输入超过该值，会按包围盒最长边由大到小排序，仅保留前 `drillLimit` 个孔洞；设为 `Infinity` 则不做限制，可提升极端大钻孔数据集的交付确定性。 |

#### 事件

| 事件名 | 参数 | 说明 |
| --- | --- | --- |
| `loading-change` | `Boolean` | 渲染任务开始/结束。 |
| `perf-stats` | `{ stage, durationMs, meta, ... }` | 输出 viewer 端性能采样。 |

### 用法示例

```vue
<template>
  <Pcb3dPreview
    :model-data="pcbModel"
    :layer-simplify-tolerances-mm="{
      copper: 0.05,
      soldermask: 0.2,
      silkscreen: 0.2,
      drill: 0.02,
      outline: 0.02,
      default: 0.1
    }"
    :explosion-active="explode"
  />
</template>

<script setup>
import Pcb3dPreview from './gerber_viewer/src/components/Pcb3dPreview.vue'
const pcbModel = reactive({ layers: [], version: 0 })
const explode = ref(false)
</script>
```

### 注意事项

- 容差越大，布线、文字等细节越容易失真；推荐铜层/钻孔/轮廓保持 0.005 mm 以下，阻焊/丝印可酌情增大。
- `modelData.layers` 来自 worker 线程，更新 `version` 可强制 Pcb3dPreview 重建 Three.js 场景。
- 由于 renderer 默认开启抗锯齿和多光源，当顶点数超过数十万时建议在非活动状态下将 `active` 设为 `false` 以避免 GPU 长时间占用。 
