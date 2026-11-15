---
title: StaticFlow
published: 2026-11-15
description: "西安电子科技大学本科生物理实验「电流场模拟静电场实验」配套数据处理与可视化脚本"
image: "https://github.com/LyCecilion/StaticFlow/raw/main/assets/banner.png"
tags: []
status: "archived"
link:
  - label: GitHub
    icon: fa7-brands:github
    value: https://github.com/LyCecilion/StaticFlow
---

本实验通过电流场模拟静电场，利用导体纸上的稳恒电流场来模拟真空中的静电场分布。实验分为两部分：

- 实验一（同轴电缆）：在印有同心圆极坐标网格的图纸上，通过探针测量等势点，用黑点标记。脚本从照片中自动提取黑点坐标，换算半径与角度，绘制等势线图并进行对数线性拟合。
- 实验二（任意形状电极）：在坐标纸上记录等势点坐标，脚本通过三角剖分插值生成连续的等势线，并绘制电场线（流线）。
