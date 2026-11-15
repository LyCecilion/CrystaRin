---
title: libschrodinger
published: 2026-08-14
description: 我修复了 Linux 没有「应用程序错误」窗口的 Bug
tags: [Linux]
status: published
order: 1
image: https://github.com/LyCecilion/libschrodinger/raw/main/assets/banner.png
link:
  - label: GitHub
    icon: fa7-brands:github
    value: https://github.com/LyCecilion/libschrodinger
---

libschrodinger 是 Linux 上的一个 LD_PRELOAD 整活项目。

libschrodinger 在程序触发部分致命信号（如 SIGSEGV、SIGBUS、SIGILL、SIGFPE、SIGABRT 等）时拦截，弹出一个 Microsoft Windows 风格的错误对话框，以还原该现代商业操作系统自 Windows XP 流传下来的神秘提示。普通 errno 报错、正常退出、SIGINT、SIGTERM 等不受影响。
