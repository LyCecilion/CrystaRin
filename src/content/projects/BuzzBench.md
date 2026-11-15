---
title: BuzzBench
published: 2026-06-17
description: "数字电路与逻辑设计大作业「智力竞赛抢答器」"
image: "https://github.com/LyCecilion/BuzzBench/blob/main/assets/main.png?raw=true"
tags: [logisim, 数字电路]
status: "published"
link:
  - label: GitHub
    icon: fa7-brands:github
    value: https://github.com/LyCecilion/BuzzBench
---

## 📖 简介

本项目实现了一个完整的智力竞赛抢答器逻辑控制电路。

## ✨ 特性

- **抢答判别**：4 组独立抢答，RS 锁存器互锁保证只识别最先抢答的队伍
- **声光提示**：抢答等待指示灯闪烁、抢中组指示灯常亮、蜂鸣器断续发声
- **定时模块**：正计时方式，支持 10s / 20s / 50s / 60s 四档定时，时间到自动提示
- **计分显示**：每组三位十进制（000–999）BCD 计分，支持主持人加减分操作
- **主持人控制**：抢答开始、定时开始、总复位、计分小组选择等全局控制

电路采用**模块化分层设计**，各子电路可独立打开、仿真和测试。

## 🧱 电路架构

```text
主持人控制信号
    ├── 抢答判别锁存模块 (ResponderLatch)
    │   ├── RS 锁存器互锁优先判优
    │   └── 输出 Q₀\~Q₃、LOCK、ALLOW、ENABLE
    ├── 抢答指示灯和声音模块 (ResponderIndicator)
    │   ├── 抢中组指示灯
    │   ├── 抢答等待闪烁灯
    │   └── 蜂鸣器控制
    ├── 定时模块 (Timer)
    │   ├── 两位 BCD 正计时
    │   ├── 四档时间选择 (10s/20s/50s/60s)
    │   └── 时间到声光提示
    └── 计分模块
        ├── 单组计分 (ScoreCounter) ×4
        │   ├── 三位可逆 BCD 计数器
        │   ├── 进位/借位链
        │   └── 上下限保护 (000–999)
        └── 总计分 (ScoreBoard)
            └── 小组选择 + 4 路分发
```
