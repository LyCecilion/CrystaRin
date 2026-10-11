// 四方向都能组成 EEVEE 的 V —— AGMC 2026.2 第 14 题，下界构造的局部形状
// 编译：typst compile fig1.typ agmc-2026-02-p14-v4.svg
#import "@preview/cetz:0.3.4": canvas, draw

#set page(width: 390pt, height: 300pt, margin: 0pt, fill: none)

#let ink = rgb("#1f2328")
#let n = 5 // 五点见方
#let cell = 40
#let gx = 95
#let gy = 50
#let gsz = cell * n // 200
#let cx(c) = gx + (c + 0.5) * cell
#let cy(r) = gy + (r + 0.5) * cell
#let letter-size = 19pt
#let amount = text(size: 11pt)[$ + 5/36 $]

#canvas(length: 1pt, {
  // 底板：白纸，保证在深色主题下同样清晰
  draw.rect(
    (0.5, 0.5),
    (389.5, 299.5),
    radius: 12,
    fill: white,
    stroke: 0.6pt + ink.transparentize(88%),
  )
  // 中心 V 所在的横行与竖列（EEVEE 的两条读取线）
  draw.rect(
    (gx, cy(2) - cell / 2),
    (gx + gsz, cy(2) + cell / 2),
    radius: 4,
    fill: ink.transparentize(93%),
    stroke: none,
  )
  draw.rect(
    (cx(2) - cell / 2, gy),
    (cx(2) + cell / 2, gy + gsz),
    radius: 4,
    fill: ink.transparentize(93%),
    stroke: none,
  )
  // 方格
  for k in range(1, n) {
    draw.line((gx + k * cell, gy), (gx + k * cell, gy + gsz), stroke: 0.7pt + ink.transparentize(72%))
    draw.line((gx, gy + k * cell), (gx + gsz, gy + k * cell), stroke: 0.7pt + ink.transparentize(72%))
  }
  draw.rect((gx, gy), (gx + gsz, gy + gsz), stroke: 1.1pt + ink.transparentize(45%))
  // 四个方向距离 2 的接收格
  for (c, r) in ((0, 2), (4, 2), (2, 0), (2, 4)) {
    draw.rect(
      (cx(c) - 19, cy(r) - 19),
      (cx(c) + 19, cy(r) + 19),
      radius: 6,
      fill: ink.transparentize(90%),
      stroke: 1.5pt + ink,
    )
  }
  // 中心 V
  draw.rect(
    (cx(2) - 19, cy(2) - 19),
    (cx(2) + 19, cy(2) + 19),
    radius: 6,
    fill: ink.transparentize(82%),
    stroke: 1.1pt + ink,
  )
  // 字母
  for (c, r) in ((2, 0), (2, 1), (1, 2), (0, 2), (2, 3), (3, 2), (4, 2), (2, 4)) {
    draw.content((cx(c), cy(r)), text(size: letter-size)[$upright(E)$])
  }
  draw.content((cx(2), cy(2)), text(size: letter-size + 1pt)[$upright(V)$])
  // 每个接收格获得 5/36
  draw.content((cx(2), gy + gsz + 6), amount, anchor: "south")
  draw.content((cx(2), gy - 6), amount, anchor: "north")
  draw.content((gx - 6, cy(2)), amount, anchor: "east")
  draw.content((gx + gsz + 6, cy(2)), amount, anchor: "west")
})
