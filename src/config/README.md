# 配置文件说明

本目录包含 Firefly 主题的所有配置文件，采用模块化设计，每个文件负责特定的功能模块。

## 📁 配置文件结构

```
src/config/
├── index.ts                  # 配置索引文件 - 统一导出
├── siteConfig.ts             # 站点基础配置
├── analyticsConfig.ts        # 统计分析配置（Google Analytics、Umami、51la 等）
├── announcementConfig.ts     # 公告配置
├── backgroundWallpaper.ts    # 背景壁纸配置
├── commentConfig.ts          # 评论系统配置
├── coverImageConfig.ts       # 封面图配置
├── displaySettingsConfig.ts  # 设置面板配置
├── dynamicConfig.ts          # 动态页面配置
├── effectsConfig.ts          # 动画特效配置（樱花等）
├── expressiveCodeConfig.ts   # 代码高亮配置
├── fontConfig.ts             # 字体配置
├── friendsConfig.ts          # 友链配置
├── galleryConfig.ts          # 相册配置
├── licenseConfig.ts          # 许可证配置
├── musicConfig.ts            # 音乐播放器配置
├── navBarConfig.ts           # 导航栏配置（含 LinkPresets 链接预设）
├── pioConfig.ts              # 看板娘配置（Spine、Live2D）
├── mermaidConfig.ts          # Mermaid 图表配置
├── plantumlConfig.ts         # PlantUML 图表配置
├── profileConfig.ts          # 用户资料配置
├── sidebarConfig.ts          # 侧边栏布局配置
├── sponsorConfig.ts          # 打赏配置
└── README.md                 # 本文件
```

## 🚀 使用方式

### 推荐：使用配置索引（统一导入）
```typescript
import { siteConfig, profileConfig } from "@/config";
```

### 直接导入单个配置
```typescript
import { siteConfig } from "@/config/siteConfig";
import { profileConfig } from "@/config/profileConfig";
```

## 📋 配置文件列表

| 文件 | 说明 |
|------|------|
| `siteConfig.ts` | 站点基础配置（标题、描述、主题色、页面宽度、文章内容页配置等） |
| `analyticsConfig.ts` | 统计分析配置（Google Analytics、Microsoft Clarity、Umami、51la） |
| `announcementConfig.ts` | 公告配置（标题、内容、类型、链接等） |
| `backgroundWallpaper.ts` | 背景壁纸配置（壁纸模式、图片、横幅文字、水波纹等） |
| `commentConfig.ts` | 评论系统配置（Twikoo、Waline、Artalk、Giscus、Disqus） |
| `coverImageConfig.ts` | 封面图配置（文章封面图、随机封面图 API） |
| `displaySettingsConfig.ts` | 视图设置面板配置（面板总开关、各设置项开关） |
| `dynamicConfig.ts` | 动态页面配置（页面标题、描述、评论开关和每页显示数量） |
| `effectsConfig.ts` | 动画特效配置（樱花数量、速度、尺寸等） |
| `expressiveCodeConfig.ts` | 代码高亮配置（亮色/暗色主题、折叠、语言徽章） |
| `fontConfig.ts` | 字体配置（字体列表、回退、预加载） |
| `friendsConfig.ts` | 友链配置（友链列表、页面设置） |
| `galleryConfig.ts` | 相册配置（相册列表、瀑布流列宽） |
| `licenseConfig.ts` | 许可证配置（CC 协议等） |
| `musicConfig.ts` | 音乐播放器配置（Meting API / 本地音乐、导航栏和侧边栏开关） |
| `navBarConfig.ts` | 导航栏配置（动态链接、LinkPresets 链接预设、搜索配置） |
| `pioConfig.ts` | 看板娘配置（Spine 模型、Live2D 模型） |
| `plantumlConfig.ts` | PlantUML 图表渲染配置 |
| `profileConfig.ts` | 用户资料配置（头像、姓名、社交链接） |
| `sidebarConfig.ts` | 侧边栏布局配置（左侧/右侧/移动端组件列表） |
| `sponsorConfig.ts` | 打赏配置（打赏方式、打赏者列表） |

## 📝 说明

- 所有配置文件均可通过 `index.ts` 统一导入
- 每个配置文件对应 `types/` 目录下的独立类型定义文件
- `siteConfig.ts` 只保留站点核心信息，不聚合其他模块配置
- `navBarConfig.ts` 底部的 `LinkPresets` 可自由自定义导航栏链接的名称、图标和 URL
- `displaySettingsConfig.ts` 的视图设置面板默认关闭，除了修改配置里的 `enable`，也可以在部署平台（Vercel / Cloudflare 等）设置环境变量 `PUBLIC_DISPLAY_SETTINGS=true` 开启，无需改动配置文件；环境变量优先级更高，取值 `true/1/on/yes` 开启、`false/0/off/no` 关闭

## 自托管字体

`fontConfig.ts` 中的全局字体使用系统字体（`selected: ["system"]`）；代码块与行内代码使用自托管的 **Maple Mono NF CN**。首页横幅仍保留 Zen Maru Gothic 标题和 Inter 副标题的独立覆盖。

| 字体 | 固定版本与上游 | 本地资源 |
|------|---------------|----------|
| Maple Mono NF CN | [v7.9](https://github.com/subframe7536/maple-font/releases/tag/v7.9)，`MapleMono-NF-CN-unhinted.zip` | `public/assets/fonts/MapleMono-NF-CN-*.woff2`（Regular、Bold、Italic、BoldItalic） |

- 本地 WOFF2 由官方 TTF 完整字库转换而来，保留原字形和 OpenType 特性；许可证保存在同目录的 `MapleMono-LICENSE.txt`，字体及其生成子集均遵循 SIL OFL 1.1。
- `pnpm build` 在 Astro 构建后按全站静态 HTML 收集字符，生成带内容哈希的 WOFF2 子集，替换 HTML/CSS 与预加载引用，并移除部署目录中的完整字库。正文不加载自定义字体；代码字体使用 `swap`，保留等宽字体回退。
- `subsetFonts` 为 Maple Mono NF CN 额外保留了全部可打印 ASCII。静态页面中的中文、符号及 Nerd Fonts 图标会随构建收录；运行时才出现且未收录的字符会回退。需要固定保留的动态文字或图标可添加到对应的 `extraChars`，然后重新构建。
- 更换字体时同步维护 `fontsList`、`selected` / `codeFont`、`subsetFonts` 和许可证。不要给静态字体声明并不存在的字重；新增文章后按正常流程重新构建即可。开发期间修改字体配置需重启开发服务器。
- Giscus 位于独立 iframe 中，不继承这里的站点字体设置。
