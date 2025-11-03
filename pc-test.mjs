import { Application, Graphics, Container } from './gerber_viewer/node_modules/pixi.js/lib/index.mjs'

const app = new Application()
await app.init({ width: 200, height: 200, backgroundAlpha: 0 })

const solid = new Graphics()
solid.rect(0, 0, 100, 100)
solid.fill({ color: 0xff0000 })

const eraser = new Graphics()
eraser.rect(25, 25, 50, 50)
eraser.fill({ color: 0xffffff })
eraser.blendMode = 'erase'

const container = new Container()
container.addChild(solid)
container.addChild(eraser)

app.stage.addChild(container)
await app.render()
console.log('done')
