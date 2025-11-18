# HDI Calculator

一个使用 Vite + Vue 3（组合式 API）的示例单页应用，用于快速评估 HDI（高密度互连板）阶数，并根据用户输入的层数与钻孔结构生成堆叠图和过孔预览。

## 使用方法

```bash
pnpm install
pnpm -C hdi_calculator dev
```

随后访问 `http://localhost:4174`。

界面中可以：

- 设置 PCB 总层数、PP 张数以及介质类型。
- 添加多种过孔结构（微孔、盲孔、埋孔、通孔）并指定起止层。
- 页面右侧实时展示层叠和钻孔示意图，并给出 HDI 阶数判断。

## 生产构建

```bash
pnpm -C hdi_calculator build
pnpm -C hdi_calculator preview
```

> 注意：该项目已在 `pnpm-workspace.yaml` 中注册，可与仓库其它包共享依赖。

