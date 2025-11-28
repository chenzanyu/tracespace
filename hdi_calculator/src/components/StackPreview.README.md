# StackPreview 组件说明

`StackPreview.vue` 用于配置 HDI 板层数、录入钻孔结构并实时预览层叠效果。组件内置 HDI 阶数计算器，可在交互过程中给出摘要信息，并在确认时返回层数与阶数。

## 功能亮点

- **层叠可视化**：根据所选层数与孔配置自动绘制堆叠示意 SVG。
- **多类型钻孔**：支持激光孔（相邻层）与机械孔，自带堆叠识别。
- **阶数分析**：实时计算 1st/2nd/3rd-order 以及 Any-layer HDI。
- **事件输出**：通过 `summary-change` 和 `confirm` 事件向父组件回传数据。

## Props

| Prop | 类型 | 是否必填 | 说明 |
|------|------|----------|------|
| `layers` | `Number` | 是 | 当前 PCB 层数，必须是 `4 / 6 / 8 / 10 / 12` 之一。 |

## Emits

| 事件 | Payload | 说明 |
|------|---------|------|
| `update:layers` | `number` | 当组件内部层数选择变化时触发，配合 `v-model:layers` 使用。 |
| `summary-change` | `{ stage, stageDisplay, title, description, layers, laserCount, totalHoles }` | 阶数或孔配置发生变化时触发，可用于驱动标题栏等摘要 UI。字段含义见下文。 |
| `confirm` | `{ layers, stage }` | 用户点击 Confirm 按钮时触发，`stage` 可能是 `null`、`"1"`、`"2"`、`"3"` 或 `"anylayer"`。 |

### `summary-change` 字段释义

- `stage`: 当前检测到的阶数字符串（`"1"`/`"2"`/`"3"`/`"anylayer"`/`null`）。
- `stageDisplay`: 徽标显示值，未检测到时为 `"0"`。
- `title`: HDI 阶数标题，例如 `1st-order HDI`、`Any-layer HDI`。
- `description`: 对当前阶数的简述，或提示继续添加激光孔。
- `layers`: 当前 PCB 层数。
- `laserCount`: 已配置的激光孔数量。
- `totalHoles`: 所有钻孔数量（激光孔 + 机械孔）。

## HDI 阶数规则

| 层数 | 支持的阶数 | 说明 |
|------|------------|------|
| 4 层 | 仅 `1st-order` 或 `Any-layer` | 检测到多于 1 阶会被归类为 `Any-layer HDI`。 |
| 6 层 | `1st-order`、`2nd-order`、`Any-layer` | 超过 2 阶时视为 `Any-layer`。 |
| ≥ 8 层 | `1st-order`、`2nd-order`、`3rd-order`、`Any-layer` | 超出 3 阶自动转为 `Any-layer`。 |

Actual HDI order 由激光孔堆叠深度计算得出，并在超过当前层数可支持的级别时自动归类为 Any-layer。

## 使用示例

```vue
<script setup>
import { ref } from 'vue'
import StackPreview from './components/StackPreview.vue'

const layers = ref(6)
const summary = ref(null)

const handleSummary = payload => {
  summary.value = payload
}

const handleConfirm = ({ layers: pcbLayers, stage }) => {
  console.log('确认结果', pcbLayers, stage)
}
</script>

<template>
  <StackPreview
    v-model:layers="layers"
    @summary-change="handleSummary"
    @confirm="handleConfirm"
  />
</template>
```

## 交互流程

1. **层数控制**：父组件通过 `v-model:layers` 传入合法层数值；组件内部会据此刷新堆叠示意、合法孔范围与阶数上限。
2. **Via 定义**：
   - 激光孔仅允许跨相邻层。
   - 勾选 “Allow stacking from this via” 可将连续孔视为堆叠。
   - 错误信息会即时提示（如层号超界、相同层等）。
3. **实时摘要**：`summary-change` 输出可用于标题栏、报表等外部呈现。
4. **确认提交**：点击 Confirm 后通过 `confirm` 事件传回 `{ layers, stage }`，由父组件决定后续逻辑。

## 开发提示

- 修改可选层数时需同步调整 `LAYER_OPTIONS`。
- 颜色、尺寸集中在文件顶部常量与 `<style scoped>` 中，可统一定制。
- 若需要直接获取当前孔列表，可在组件中使用 `defineExpose` 扩展接口。
