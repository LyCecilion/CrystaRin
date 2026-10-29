// E 的守恒权重转移 —— AGMC 2026.2 第 14 题，加权计数（discharging）
// 编译：typst compile fig2.typ agmc-2026-02-p14-charge-flow.svg
#import "@preview/cetz:0.3.4": canvas, draw

#set page(width: 420pt, height: 225pt, margin: 0pt, fill: none)

#let ink = rgb("#1f2328")
#let E = (210, 112.5)
#let Er = 27
#let Vr = 21
// (x, y, 分子, 分母)：左侧两个 V 各得 1/54，右侧两个各得 1/9
#let nodes = ((140, 43.5, 1, 54), (140, 181.5, 1, 54), (280, 43.5, 1, 9), (280, 181.5, 1, 9))
#let label = 11pt
#let arrow = (end: (symbol: "stealth", scale: 1))

#canvas(length: 1pt, {
  // 浅色底板，保证在深色主题下同样清晰
  draw.rect(
    (0.5, 0.5),
    (419.5, 224.5),
    radius: 12,
    fill: rgb("#F9FFFD"),
    stroke: 0.6pt + ink.transparentize(88%),
  )

  // 连线：从中心 E 的圆周出发，箭头尖落在 V 的圆周上
  for (vx, vy, num, den) in nodes {
    let dx = vx - E.at(0)
    let dy = vy - E.at(1)
    let dist = calc.sqrt(dx * dx + dy * dy)
    let ux = dx / dist
    let uy = dy / dist
    let start = (E.at(0) + Er * ux, E.at(1) + Er * uy)
    let tip = (vx - Vr * ux, vy - Vr * uy)
    draw.line(start, tip, stroke: 1pt + ink, mark: arrow)
    // 垂直于连线、朝上的方向，把金额放进空出的楔形里
    let nx = -uy
    let ny = ux
    if ny > 0 {
      nx = -nx
      ny = -ny
    }
    let mid = ((start.at(0) + tip.at(0)) / 2, (start.at(1) + tip.at(1)) / 2)
    draw.content(
      (mid.at(0) + 15 * nx, mid.at(1) + 12 * ny),
      text(size: label)[$ + #num/#den $],
    )
  }

  // 四个 V 与中心 E
  for (vx, vy, ..) in nodes {
    draw.circle((vx, vy), radius: Vr, stroke: 1pt + ink)
    draw.content((vx, vy), text(size: 14pt)[$upright(V)$])
  }
  draw.circle(E, radius: Er, stroke: 1pt + ink)
  draw.content(E, text(size: 17pt)[$upright(E)$])

  // E 自身交出的份额
  draw.content(
    (E.at(0), E.at(1) + Er + 10),
    text(size: label)[$ -7/27 $],
    anchor: "south",
  )
})
