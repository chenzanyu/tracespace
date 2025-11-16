# @tracespace/legacy-renderer

[![npm][npm badge]][npm package]

Render [@tracespace/legacy-plotter][] image trees as SVGs. Part of the [tracespace][] collection of PCB visualization tools.

This module is one part of the tracespace render pipeline, and you may not need to use it directly. See [@tracespace/legacy-core][] to integrate the full render pipeline into your project.

```shell
npm install @tracespace/legacy-renderer@next
```

[tracespace]: https://github.com/tracespace/tracespace
[@tracespace/legacy-plotter]: ../legacy_plot
[@tracespace/legacy-core]: ../legacy_core
[npm package]: https://www.npmjs.com/package/@tracespace/legacy-renderer/v/next
[npm badge]: https://img.shields.io/npm/v/@tracespace/legacy-renderer/next?style=flat-square

## usage

```js
import fs from 'node:fs/promises'
import {toHtml} from 'hast-util-to-html'

import {parse} from '@tracespace/parser'
import {plot} from '@tracespace/legacy-plotter'
import {render} from '@tracespace/legacy-renderer'

const gerberContents = await fs.readFile('gerber.gbr', 'utf-8')
const syntaxTree = parse(gerberContents)
const imageTree = plot(syntaxTree)
const image = render(imageTree)

await fs.writeFile('render.svg', toHtml(image), 'utf-8)
```


