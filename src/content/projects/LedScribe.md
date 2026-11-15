---
title: LedScribe
published: 2026-10-18
description: "为 CH546 11×44 LED 胸牌准备的 Linux 命令行写入工具"
image: ""
tags: [CH546]
status: "published"
link:
  - label: GitHub
    icon: fa7-brands:github
    value: https://github.com/ProjectHazelita/LedScribe
---

一块小小的 LED 胸牌，也该能在 Linux 上好好写字。

LedScribe 面向 USB 标识为 0416:5020、使用 wch.cn CH546 的 11×44 LED 胸牌。从终端输入文字，先看看点阵，再把消息写进胸牌。不需要先启动商家的图形化软件。

这是一个从早期练手项目继续整理而来的小工具，使用 C++20、libusb 和 stb_truetype，主要面向 Fedora/Linux；它不是通用的 LED 屏驱动，也不承诺适配所有外观相似的胸牌。
