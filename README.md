
<img src="./docs/images/1131.png" width = "350" height = "500" alt="Firefly" align=right />

<div align="center">

# 流萤 / Firefly 
> 一款清新美观的 Astro 静态博客主题模板
> 
> ![Node.js >= 22](https://img.shields.io/badge/node.js-%3E%3D22-brightgreen) 
![pnpm >= 11](https://img.shields.io/badge/pnpm-%3E%3D9-blue)
![Astro](https://img.shields.io/badge/Astro-7-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)
>
> [![Stars](https://img.shields.io/github/stars/CuteLeaf/Firefly?style=social)](https://github.com/CuteLeaf/Firefly/stargazers)
[![Forks](https://img.shields.io/github/forks/CuteLeaf/Firefly?style=social)](https://github.com/CuteLeaf/Firefly/network/members)
[![Issues](https://img.shields.io/github/issues/CuteLeaf/Firefly)](https://github.com/CuteLeaf/Firefly/issues)
> 
> [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Z8Z41NQALY)
>
> **QQ交流群：[1087127207](https://qm.qq.com/q/ZGsFa8qX2G)**
> 
> ![GitHub License](https://img.shields.io/github/license/CuteLeaf/Firefly)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/CuteLeaf/Firefly)
[![爱发电打赏](https://img.shields.io/badge/爱发电-打赏作者-ff69b4.svg)](https://ifdian.net/a/cuteleaf)

</div>


---
📖 README：
**[简体中文](README.md)** | **[繁體中文](docs/README.zh-TW.md)** | **[English](README.en.md)** | **[日本語](docs/README.ja.md)** | **[한국어](docs/README.ko.md)**

🚀 快速指南：
[**🖥️在线预览**](https://firefly.cuteleaf.cn/) /
[**📝使用文档**](https://docs-firefly.cuteleaf.cn/) /
[**🍀我的博客**](https://blog.cuteleaf.cn) 

⚡ 静态站点生成: 基于 Astro 的超快加载速度和 SEO 优化

🎨 现代化设计: 简洁美观的界面，支持自定义主题色

📱 移动友好: 完美的响应式体验，移动端专项优化

🔧 高度可配置: 大部分功能模块均可通过配置文件自定义

<table width="100%" align="center">
  <tr>
    <td colspan="3" align="center">
      <img src="./docs/images/1.webp" >
      <br>横幅模式</td>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="./docs/images/3.webp" width="300"><br>透明覆盖模式</td>
    <td align="center"><img src="./docs/images/2.webp" width="300"><br>全屏壁纸模式</td>
    <td align="center"><img src="./docs/images/4.webp" width="300"><br>纯色模式</td>
  </tr>
</table>
<img alt="Lighthouse" src="./docs/images/Lighthouse.png" />

>[!TIP]
>
>Firefly 是一款基于 Astro 框架和 Fuwari 模板开发的清新美观且现代化个人博客主题模板，专为技术爱好者和内容创作者设计。该主题融合了现代 Web 技术栈，提供了丰富的功能模块和高度可定制的界面，让您能够轻松打造出专业且美观的个人博客网站。
>
>**如果你参考或使用了 Firefly 的组件设计和相关代码，请注明来自 Firefly。**
>
>Firefly 也保留了原版 fuwari 的布局，可根据自己的喜好在配置文件中自由切换。
>
>**更多布局配置及演示请查看：[Firefly 布局系统详解](https://firefly.cuteleaf.cn/posts/guide/firefly-layout-system/)**
>
>Firefly 支持 i18n 多语言 UI，但除了简体中文，其他语言均为 AI 翻译转换，如有错误，欢迎提交 [Pull Request](https://github.com/CuteLeaf/Firefly/pulls) 修正。

## ✨ 功能特性

### 核心功能

- [x] **Astro + Tailwind CSS** - 基于现代技术栈的超快静态站点生成
- [x] **流畅动画** - Swup 页面过渡动画，提供丝滑的浏览体验
- [x] **响应式设计** - 完美适配桌面端、平板和移动设备
- [x] **多语言支持** - i18n 国际化，UI 支持简体中文、繁体中文、英文、日文、俄语、韩文
- [x] **全文搜索** - 基于 Pagefind 的客户端搜索，支持文章内容索引

### 个性化
- [x] **动态侧边栏** - 支持配置单侧边栏、双侧边栏
- [x] **文章布局** - 支持配置(单列)列表、网格(多列/瀑布流)布局
- [x] **字体管理** - 支持自定义字体，丰富的字体选择器
- [x] **页脚配置** - HTML 内容注入，完全自定义
- [x] **亮暗色模式** - 支持亮色/暗色/跟随系统三种模式
- [x] **导航栏自定义** - Logo、标题、链接全面自定义
- [x] **壁纸模式切换** - 横幅壁纸、全屏壁纸、全屏透明壁纸、纯色背景
- [x] **主题色自定义** - 360° 色相调节

如果你有好用的功能和优化，请提交 [Pull Request](https://github.com/CuteLeaf/Firefly/pulls)

## 🚀 快速开始

### 环境要求

- Node.js ≥ 22
- pnpm ≥ 11

### 本地开发部署

1. **克隆仓库：**
   ```bash
   git clone https://github.com/Cuteleaf/Firefly.git
   cd Firefly
   ```
   
   **先 [Fork](https://github.com/CuteLeaf/Firefly/fork) 到自己仓库再克隆（推荐），记得先点 Star 再 Fork 哦！**

   ```bash
   git clone https://github.com/you-github-name/Firefly.git
   cd Firefly
   ```
3. **安装依赖：**
   ```bash
   # 如果没有安装 pnpm，先安装
   npm install -g pnpm
   
   # 安装项目依赖
   pnpm install
   ```

4. **配置博客：**
   - 编辑 `src/config/` 目录下的配置文件自定义博客设置

5. **启动开发服务器：**
   ```bash
   pnpm dev
   ```
   博客将在 `http://localhost:4321` 可用

### 噪域展示实例

同一份源码提供两个独立构建入口。普通博客继续使用 `src/` 和原有命令；噪域展示使用 `src-noise/`，直接复用原首页布局、导航、侧栏、卡片、背景、设置和波浪效果，仅关闭 Swup、原音乐播放器和樱花。只生成首页，站内切页被拦截，外部链接保持原行为。

```bash
pnpm dev:noise       # 本地开发，可追加 --host / --port 等 Astro 参数
pnpm build:noise     # 输出 dist-noise/，随后用 Chrome 捕获首页分层截图
pnpm preview:noise   # 预览 dist-noise/
```

点击“开始演出”后，以原生 HTML-in-Canvas 实时首页作为场景纹理，播放 Desultory Signals，并按官方 AT 谱面的时间轴绘制噪域与金色判定线。底部「音符 / Auto Play」是整首通用开关，默认关闭以保留纯噪域演出；打开后显示原始谱面的 Tap、Drag、Hold、Flick、同刻高亮及自动 Perfect 判定动画／计数，不需要手动打歌，也不保存或上传成绩。音符与判定按同一音频时钟求值，支持暂停、跳转、重播和中途开关；Hold 使用自身速度计算条身，自动持续判定到尾部。音符和判定动画先进入噪域采样的场景快照，活动噪域覆盖其上，最后应用整帧后处理；无音乐对照入口不演出音符。

四类音符按 Phira-Pro `NoteKind::order` 跨所有判定线统一分批，由底到顶为 **Hold → Drag → Tap → Flick**，不再由谱面数组或判定线提交顺序决定遮挡。高亮版本仍留在所属类型的层内；同类型普通贴图先画、高亮贴图后画，同批保留原有谱面顺序。判定动画在音符之后绘制，最后仍由活动噪域覆盖。

每次判定动画会锁定触发时刻的位置与旋转，独立按音乐时钟播放 0.5 秒，不随之后的判定线移动／换组一起移走。Hold 的每次持续脉冲也分别记录自己的出生位置；窗口尺寸变化时按同一舞台重新投影，暂停、跳转和重播仍可直接还原，不采用固定槽位抢占旧动画。

判定线全长为舞台宽度的 **3 倍**，以谱面记录的位置为中心，向两侧各延伸 1.5 倍舞台宽度；正常比例下舞台宽度就是窗口宽度，cover 裁切时沿用虚拟舞台宽度。基础粗细采用 `max(2, 舞台高度 / 225)` CSS 像素，按观感调整为此前的两倍（包含最小线宽）；这是预览调校值，不宣称已校准至官方 Phigros。Bloom 参数不因线宽调整而改变，发光范围与基础线宽分开计算。

无需按住鼠标：鼠标或触摸板指针接触有效噪域后，一个触摸效果跟随指针，离开后携带三秒并逐渐消退；再次接触刷新三秒。不会把轨迹叠成多个手指，音乐低通强度随污染消退。暂停、进度跳转、重播和退出均会清除携带的污染，退出恢复原始首页节点及滚动位置。缺少原生 API 时不启动演出，也不回退到透明红色覆盖层或 CSS 滤镜。

快速穿越按带时间戳的 `pointermove` 路径判定，并读取可用的 `getCoalescedEvents()` 历史点，不再只检查绘制帧末尾的位置。保留 Phira-Pro 的 5% 舞台高度内缩、Subtract 奇偶组合和舞台裁剪；路径沿有效矩形边界分段检查，不把辉光算作接触。事件时间在相邻绘制帧的音频时钟之间对齐，运动区域按关键帧、启停边界、最长 1/240 秒和旋转量细分；旋转／非线性运动仍是数值近似，浏览器未记录的真实曲线路径无法恢复。经过控制 UI、离开窗口或重设布局后不连接旧路径，避免凭空穿越。

音乐演出还会在真实 DOM 纹理中留下明显的局部污染：有效噪域覆盖及被污染指针经过的文字产生青／品红错位复像，图片留下偏移、去色与彩色扫描残像，卡片边缘保留双色描边记忆；未接触的元素不联动，不改正文、布局或命中区域。文字／图片满强度位移分别为 12／16 CSS 像素，实际幅度随污染程度平滑衰减；短暂扫过也会留下可辨认的残影，不再只在覆盖期间可见。指针按实际受污染的路径部分传播，不污染首次接触前的路段；元素残留独立于指针三秒寿命，文字先对齐、图片随后恢复、卡片边缘最后退去。26 秒附近逐渐加深并延缓恢复，65.2–68 秒前后细节收敛为结构残影，108.1 秒 Grid 段进一步克制，曲末归静；不依靠反复重启随机闪烁。暂停冻结残留，跳转／重播清空历史，退出或原生失败移除全部回声节点并还原首页。无音乐与截图对照入口不启用这一层。

DOM 接触采用与指针相同的有效区域几何规则，以目标内的有限网格估算覆盖范围，不读取形变后的 GPU 像素，也不把辉光、音符或判定动画当作噪域；小于采样间距的局部区域可能漏检。反馈被裁在可见目标／图片裁切范围内，隐藏菜单不会显形。DOM 反馈先更新、再由浏览器绘制并上传，仍位于判定线／音符／活动噪域与整帧后处理之下；它是网页演出的扩展，不宣称为游戏原生行为。

“原生 HTML-in-Canvas（无音乐）”使用相同材质，以矩形 Active、Subtract、Disabled 和 Ready 区域演示效果，不是随鼠标移动的椭圆滤镜。真实首页节点临时移入 Chrome 的 drawable canvas 视口，由浏览器实时绘制并通过 `texElementSubImage2D()` 上传 GPU；文字、图片、响应式排版和内容更新仍来自原始 DOM。固定导航与滚动内容分开布局，文档保留原生滚动，退出将同一批节点放回原位置。接管期间页面链接禁用，可通过按钮或 Esc 返回。

原生入口现场检测 `canvas.content="drawable"`、`requestPaint()`、`getElementImageDefaultSize()` 和 WebGL 原生元素上传；浏览器缺少 API 时明确保留正常首页，不静默替换为截图。调整窗口时先复制上一张已完成的 GPU 帧作过渡，待新布局绘制完成后移除；绘制超时或上下文丢失则恢复 DOM。原生输入使用当前完整视口的一张实时纹理，保留正确的页面层叠关系；下方截图验证仍是独立分层输入，用于对照。


独立的“图层接管验证（无音乐）”入口以预先捕获的首页分层截图作为输入，使用相同 Phira-Pro 材质。原始 DOM 保留布局与 sticky/fixed 定位，只隐藏绘制并禁用交互；Canvas 每帧读取真实几何。完整首帧准备后才隐藏页面，退出先恢复 DOM，不设置滚动位置。尺寸、主题、布局不匹配以及加载或图形上下文失败时保留／恢复真实首页。

`pnpm build:noise` 在字体等后处理结束后自动启动本地静态服务捕获图层；需要 Chrome（默认 `/usr/bin/google-chrome`，可用 `CHROME_PATH` 指定）。开发时先启动 `pnpm dev:noise --port 4325`，再运行：

```bash
BASE_URL=http://127.0.0.1:4325/ pnpm capture:noise
# 按需要重新生成自定义 CSS 视口预设（同时捕获浅色、深色）
BASE_URL=http://127.0.0.1:4325/ CAPTURE_VIEWPORTS=1280x900,1440x900 pnpm capture:noise
```

默认预设为 1280 × 900、1440 × 900、1920 × 1080、2048 × 1162，各含浅／深色。只支持匹配的视口、滚动条布局和内容尺寸（允许 2 CSS 像素的滚动条／取整误差），不会把截图冒充任意响应式 DOM。卡片、侧栏、背景和导航独立捕获；动态文字、日历等是捕获时快照，跨层 backdrop-filter 不保证逐像素一致。资产生成在忽略跟踪的 `public/noise-scene/`，并复制到 `dist-noise/noise-scene/`；修改内容后应重新捕获。开发时生成资产后重启 dev server，以刷新静态文件索引。接管期间链接不可操作，点击“返回真实首页”或按 Esc 后恢复。

材质直接移植自 [Phira-Pro](https://github.com/Phira-Pro/Phira-Pro/tree/c3873ea3d8759177630a2bbfea79036e99389118) 的 `block_shader_full.frag`、`block_mask.rs` 和 `block_touch.rs`，参照该版本的原生 block-area 路径，而非 RPEN 皮肤近似：保留原始片元运算和材质参数、镜像／重复纹理采样、R8 分步量化、Subtract 阈值、Ready／Disabled 通道、形变合成、3×3 膨胀与六圈加权辉光、十指 Show／Hide 和触摸 SDF。绘制顺序为 Disabled 加法层 → 判定线 → 音符／判定动画 → 1/6 线性场景快照 → 预乘 Active／hover；操作面板在这些效果之外。

已知差异：网页将场景换为博客，指针无需按住、离开后携带三秒是网页扩展；Phira-Pro 原生手指污染保持到该触点释放，再执行 Hide。网页只映射一个触摸槽，不生成多指轨迹。无音乐入口的区域是演示布局，不是谱面。当前谱面接口没有扩展区域调色或 line2area 的额外 Ready 分支。CPU 几何交点仍使用 JavaScript 双精度，辉光幂运算采用 JavaScript libm；GPU 的 mediump 精度及驱动优化也可能与原生不同，不能宣称逐像素一致。尚未复刻 Phigros 初见演出。

进入原生演出、无音乐预览或截图对照后，右上角“后处理预览”提供默认关闭的总开关、A/B 对照、逐通道开关与即时参数调节。“跟随音乐时间轴”默认开启：启用总开关并开始演出后，参数和五条切屏随音频播放、暂停、跳转和重播同步；无音乐入口仍使用手动基准值。调整数值或手动 Grid 会退出自动模式；逐通道开关与手动 Glitch／切屏脉冲可叠加在自动模式上。重置恢复基准和自动模式，但保留总开关状态。按 VignettePlus → RGBShift → Glitch → GlitchDog → DimensionSlash → LensDistortion → Bloom 顺序处理整个合成画面，Grid 为前置叠层；面板不参与后处理，Esc 先关闭面板。

启用后处理时，最终合成画面固定以中心放大 **1.05×**，每侧裁去约 **2.38%**，减轻镜头畸变越界采样导致的边缘像素拉伸，同时优先保留更多视野；不改网页布局、谱面时间轴或操作面板尺寸。关闭总开关／A/B 原图时恢复 1×。鼠标接触判定同步本次放大变换，触摸效果位置反向换算回源画面；切换显示比例会断开旧输入路径，避免把视图变化误算成光标扫过。该固定裁切不随时间轴呼吸缩放，也不保证任意极端手动参数都没有越界伪影。

静态参数来自 `blockarea/main` 的 `789e10f`，时间轴来自 `ef32e4b`，分别保存在 `src-noise/assets/desultory-signals-postfx.json` 和 `desultory-signals-timeline.json`。歌曲时钟驱动记录的 Director 曲线与 Slash info，使用前一关键帧的 easing；空的 glitchMapOffset 曲线不覆盖静态值，160 秒的 vignetteRadius 哨兵不参与曲末插值。自动 Grid 使用 gridOpacity。自动模式把博客场景视为游戏底图：bgAlpha 在底图合成时衰减 RGB、保留原有 Alpha，音符、判定线、噪域和操作面板随后绘制，不随底图一起变暗。关闭后处理或退出自动模式会恢复正常底图亮度。手动基准不被自动曲线改写，手动脉冲使用独立实时时钟，因此暂停时仍可预览。

Grid 扩张参考 `blockarea/main` 的 `1c962f4` 和提供的 Shader 公式：只读同一张 FrameBase 的 R 通道白边，纵向基准按 10 格平铺；先将居中的屏幕 UV 乘以 `(viewportWidth / viewportHeight, 1)`，让横纵单位都对应同样的屏幕像素距离，任何窗口比例下均保持正方格，不随谱面舞台拉伸。`phase = fract(songTime * _ScaleSpeed)`，`s = exp2(-phase)`，围绕中心分别以 `s` 和 `2*s` 缩放采样，用 phase 线性交叉淡化。周期末的第二层与下一周期的第一层重合，因此每秒一轮连续向外扩。gridOpacity 只控制叠层透明度，108.1–108.5 秒淡入到 0.6 后保持；Grid 时钟独立于实验性的噪声冻结时钟，暂停／跳转仍与音频同步。bgAlpha 在 65.2–68 秒先把底图从 0.8 衰减到 0.05，让后续网格有暗色背景衬托；不额外给音符或操作面板加暗化／模糊。

画面仍是近似实现，不是原始 Shader：使用 Gamma 编码的 RGBA8/LDR 中间帧，Grid、GlitchDog 和 Lens 显式补偿宽高比，Lens 默认手动比例为 1.6。保留原始四张贴图与 1024² × 11 层 R8 数组。RGB 半径按 1080 像素参照换算，位移强度按 UV 的 1/10、Lens 参数按 1/1000 归一化；Slash 两个方向字段按度转换，强度在传 Shader 时乘 0.01，位移方向按向量解释。自动切屏沿用记录 RGB，不让静态 Alpha=0 屏蔽光束（预览约定，尚非原公式）。Bloom 使用 MaxRGB 阈值与五点下采样／八点上采样 Dual Kawase 近似，sampleRate 解释为初始 RT 比例，忽略 BloomColor Alpha。146.753 秒后的原始复位值尚未给出：预览只冻结后处理噪声运动，曲末参数／切屏仍继续采样，不猜测 GlitchDog／Grid 的复位值。

GlitchDog 的预览把 glitchMapBrightness 解释为遮罩增益，scale 只作用于噪声覆盖区域的场景采样，避免开场亮度为 0 时仍把整页放大；此映射也有待原始 Shader 对照确认。


**许可范围：** `src-noise/` 组合噪域程序按 GPL-3.0-only 提供，保留 Phira-Pro 来源及 MIT 部分原有声明，详见 [`src-noise/NOTICE`](src-noise/NOTICE) 和 [`src-noise/LICENSE`](src-noise/LICENSE)；普通博客与仓库根 MIT 许可不变。噪域构建会附带 `NOISE-LICENSE` 与 `NOISE-NOTICE`，公开分发时还须按 GPL 提供对应源码。音乐、谱面、游戏纹理及博客内容的权利另计，代码许可不代表已获这些素材的公开发布授权。

音符与判定动画复用 [Phira-Pro 默认 nomo 资源包](https://github.com/Phira-Pro/Phira-Pro/tree/0c5cf2ee9d2bac1292f16287bb6b662ceee40365/assets/respack)，原始 PNG 与 `info.yml` 保存在 `src-noise/assets/notes/`，保留星鹿ELEC（绘图）及不会读谱的FW小赵呀（音效）的原始署名。依据该版本的 GPL-3.0 项目声明使用，未发现默认 respack 的独立排除条款；没有使用另受 PolyForm Noncommercial 许可的 RPEN 资源，也没有将此声明泛化为 Phigros 游戏素材的授权。PGR 音符投影、独立 Hold 条身和 Auto Play 时机参照同版本原生实现；这里只实现可切换的自动演出，不是完整手动判定游戏。


- `scripts/noise.mjs` 为命令及后处理统一设置 `CRYSTARIN_BUILD=noise`，无需依赖平台特定的 shell 环境变量语法。开发与预览以前台进程配合 `--ignore-lock` 运行，避免误连到同仓库已运行的普通博客实例；同时运行时用 `--port` 指定不同端口，用 Ctrl+C 停止。
- 噪域版使用独立的 `.astro-noise/` 缓存；保留封面、字体处理和首页内容的 Pagefind 索引，跳过站点地图和 VNDB 下载。日历和动态组件复用原静态数据接口，但不生成其他内容页。共享 `public/` 资源仍会复制；看板娘按原博客配置保留或裁剪。
- 独立部署时选择 `pnpm build:noise` 和 `dist-noise`；即使设置了 `CF_WORKERS`，展示入口也保持纯静态输出，不接入原博客服务端路由。
- 可设置 `CRYSTARIN_NOISE_SITE=https://你的展示域名`，用于展示实例的站点地址与 canonical；未设置时不借用原博客 canonical。页面始终带有 `noindex, nofollow`。
- 普通博客的部署命令和 `dist/` 输出保持不变。不要同时向两个构建任务写入共享的生成数据文件。
- 桌面鼠标与至少 1024 × 576 CSS 像素的窗口才能开始。谱面在 **4:3～16:9** 之间直接适配窗口宽高；更宽时以 16:9 舞台等比放大、居中裁去上下，更窄时以 4:3 舞台等比放大、居中裁去左右，不再留边。音符、判定线、噪域及接触判定共用这套舞台坐标，网页背景和控制 UI 不随谱面缩放。比例适配的裁切量最多为虚拟舞台的 **20%**（每侧最多 10%，不含后处理额外裁边），即窗口宽高比约 **16:15～20:9**；超过时禁止开始，演出中调整到不支持的比例或过小尺寸会暂停并恢复首页，保留进度，调整后可手动继续。进入后台自动暂停。页面包含快速闪烁，请谨慎体验。
- `pnpm test:noise` 检查动画锚点、输入路径／三秒携带与受污染路段传播、DOM 接触／残留恢复、遮罩／触摸以及歌曲时间轴和音符／Auto Play 的边界行为。`node scripts/prepare-noise-chart.mjs <官方 JSON> <区域与判定线输出 JSON> [音符输出 JSON]` 可同时重新生成噪域数据和独立的音符伴随数据。音符伴随数据默认不下载，只在首次打开音符开关时加载。
- `pnpm test:noise-grid` 使用真实 Chromium/WebGL 与原始 FrameBase 贴图，读取 4:3、16:10、16:9 和宽屏下的网格像素，检查横纵格距相等及扩张周期首尾一致；不需要启动服务或提前构建。默认浏览器路径为 `/usr/bin/google-chrome`，可用 `CHROME_PATH` 覆盖。
- `pnpm test:noise-dom` 在真实 Chromium 中检查局部文字回声的可见像素、未接触内容／隐藏菜单保持安静、图片祖先裁切、扫过传播、暂停冻结及退出后的 DOM／像素精确还原；同样无需服务或构建，浏览器路径使用 `CHROME_PATH`。
- `src-noise/assets/` 中的谱面与音乐来自提供的 Desultory Signals AT 谱包，区域纹理取自所提供 Phira-Pro 的 `assets/blockarea/`；`assets/postfx/` 的五份贴图／数组来自提供的 Phigros 4.0.1.2 本地资源。原始曲目、谱面和纹理的权利属于各自权利人；公开部署或再分发前应确认授权。主入口和无音乐原生入口均使用浏览器实验 API 的实时 DOM 输入；截图对照入口只采样预生成的首页图层。


### 平台托管部署
- **参考[官方指南](https://docs.astro.build/zh-cn/guides/deploy/)将博客部署至 Vercel, Netlify, Cloudflare Pages, EdgeOne Pages 等。**
- **Vercel**、**Netlify** 等主流平台自动部署，会根据环境自动选择适配器。

   框架预设： `Astro`

   根目录： `./`

   输出目录： `dist`

   构建命令： `pnpm run build`

   安装命令： `pnpm install`

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/CuteLeaf/Firefly&project-name=Firefly&repository-name=Firefly)
   [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/CuteLeaf/Firefly)

## 📖 配置说明

> 📚 **详细配置文档**: 查看 [Firefly 使用文档](https://docs-firefly.cuteleaf.cn/) 获取完整的配置指南

### 设置网站语言

要设置博客的默认语言，请编辑 `src/config/siteConfig.ts` 文件：

```typescript
// 定义站点语言
const SITE_LANG = "zh_CN";
```

**支持的语言代码：**
- `zh_CN` - 简体中文
- `zh_TW` - 繁体中文
- `en` - 英文
- `ja` - 日文
- `ru` - 俄文
- `ko` - 韩文

### 配置文件结构

```
src/
├── config/
│   ├── index.ts                  # 配置索引文件
│   ├── siteConfig.ts             # 站点基础配置
│   ├── analyticsConfig.ts        # 统计分析配置
│   ├── announcementConfig.ts     # 公告配置
│   ├── backgroundWallpaper.ts    # 背景壁纸配置
│   ├── commentConfig.ts          # 评论系统配置
│   ├── coverImageConfig.ts       # 封面图配置
│   ├── displaySettingsConfig.ts  # 设置面板配置
│   ├── dynamicConfig.ts          # 动态页面配置
│   ├── effectsConfig.ts          # 动画特效配置（樱花等）
│   ├── expressiveCodeConfig.ts   # 代码高亮配置
│   ├── fontConfig.ts             # 字体配置
│   ├── FooterConfig.html           # 页脚配置
│   ├── friendsConfig.ts          # 友链配置
│   ├── galleryConfig.ts          # 相册配置
│   ├── licenseConfig.ts          # 许可证配置
│   ├── musicConfig.ts            # 音乐播放器配置
│   ├── navBarConfig.ts           # 导航栏配置
│   ├── pioConfig.ts              # 看板娘配置
│   ├── mermaidConfig.ts          # Mermaid 图表配置
│   ├── plantumlConfig.ts         # PlantUML 图表配置
│   ├── profileConfig.ts          # 用户资料配置
│   ├── sidebarConfig.ts          # 侧边栏布局配置
│   └── sponsorConfig.ts          # 打赏配置
```

## ⚙️ 文章 Frontmatter

```yaml
---
title: My First Blog Post
published: 2023-09-09
description: This is the first post of my new Astro blog.
image: ./cover.jpg  # 或使用 "api" 来启用随机封面图
tags: [Foo, Bar]
category: Front-end
draft: false
lang: zh-CN      # 仅当文章语言与 `siteConfig.ts` 中的网站语言不同时需要设置
pinned: false    # 置顶
comment: true    # 是否允许评论
---
```

## 动态

动态文件保存在 `src/content/dynamic/` 中，一个 Markdown 文件对应一条动态。可以使用快捷命令创建：

```bash
pnpm new-d 今天心情不错，出去吃了一顿火锅
```

`pnpm new-dynamic <content>` 也可以使用，和 `new-d` 完全等价。

```yaml
---
published: 2026-07-15 16:15:29
pinned: true  # 置顶
location: China # 位置
---

动态内容可以使用 Markdown 语法。
```

也支持对接 [Memos](https://www.usememos.com/) 作为数据源，在 `src/config/dynamicConfig.ts` 中配置 `memos` 选项即可实时获取 Memos 动态，支持置顶同步和图片附件展示。详见[动态文档](https://docs-firefly.cuteleaf.cn/zh/guide/dynamic.html)。

## 🧩 Markdown 扩展语法

除了 Astro 默认支持的 [GitHub Flavored Markdown](https://github.github.com/gfm/) 之外，还包含了一些额外的 Markdown 功能：

- 提醒块（Admonitions） - 支持 GitHub, Obsidian, VitePress, Docusaurus 四种风格主题配置 ([预览和用法](https://firefly.cuteleaf.cn/posts/markdown-extended/))
- GitHub 仓库卡片 ([预览和用法](https://firefly.cuteleaf.cn/posts/markdown-extended/))
- 基于 Expressive Code 的增强代码块 ([预览](http://firefly.cuteleaf.cn/posts/code-examples/) / [文档](https://expressive-code.com/))

## 🧞 指令

下列指令均需要在项目根目录执行：

| Command                    | Action                                 |
| :------------------------- | :------------------------------------- |
| `pnpm install`             | 安装依赖                               |
| `pnpm dev`                 | 在 `localhost:4321` 启动本地开发服务器 |
| `pnpm build`               | 构建网站至 `./dist/`                   |
| `pnpm preview`             | 本地预览已构建的网站                   |
| `pnpm check`               | 检查代码中的错误                       |
| `pnpm format`              | 使用 Biome 格式化您的代码              |
| `pnpm new-post <filename>` | 创建新文章                             |
| `pnpm new-d <content>`     | 创建一条动态                           |
| `pnpm new-dynamic <content>` | 创建一条动态（完整命令）              |
| `pnpm astro ...`           | 执行 `astro add`, `astro check` 等指令 |
| `pnpm astro --help`        | 显示 Astro CLI 帮助                    |

## 🙏 致谢

非常感谢 [saicaca](https://github.com/saicaca) 开发的 [fuwari](https://github.com/saicaca/fuwari) 模板，Firefly 就是基于这个模板二次开发

流萤部分相关图片素材版权归游戏 [《崩坏：星穹铁道》](https://sr.mihoyo.com/) 开发商 [米哈游](https://www.mihoyo.com/) 所有

### 技术栈

- [Astro](https://astro.build) 
- [Tailwind CSS](https://tailwindcss.com) 
- [Iconify](https://iconify.design)

### 灵感项目

- [fuwari](https://github.com/saicaca/fuwari)
- [hexo-theme-shoka](https://github.com/amehime/hexo-theme-shoka)
- [astro-koharu](https://github.com/cosZone/astro-koharu)
- [Mizuki](https://github.com/matsuzaka-yuki/Mizuki)

### 其他参考
- 博主`霞葉`的 [Bangumi 收藏](https://kasuha.com/posts/fuwari-enhance-ep2/) 页面组件
- 哔哩哔哩up主 `公公的日常` 的Q版 [流萤看板娘 Spine 切片数据](https://www.bilibili.com/video/BV1fuVzzdE5y) 

## 📝 许可协议

本项目遵循 [MIT license](https://mit-license.org/) 开源协议，详细查看 [LICENSE](./LICENSE) 文件

最初 Fork 自 [saicaca/fuwari](https://github.com/saicaca/fuwari)，感谢原作者的贡献

**版权声明：**
- Copyright (c) 2024 [saicaca](https://github.com/saicaca) - [fuwari](https://github.com/saicaca/fuwari)
- Copyright (c) 2025 [CuteLeaf](https://github.com/CuteLeaf) - [Firefly](https://github.com/CuteLeaf/Firefly) 

根据 MIT 开源协议，你可以自由使用、修改、分发代码，但需保留上述版权声明。

## 🍀 贡献者

感谢以下贡献者对本项目做出的贡献，如有问题或建议，请提交 [Issue](https://github.com/CuteLeaf/Firefly/issues) 或 [Pull Request](https://github.com/CuteLeaf/Firefly/pulls)。

><a href="https://github.com/CuteLeaf/Firefly/graphs/contributors">
>  <img src="https://contrib.rocks/image?repo=CuteLeaf/Firefly" />
></a>

感谢以下贡献者对原项目 [fuwari](https://github.com/saicaca/fuwari) 做出的贡献，为本项目奠定了基础。

><a href="https://github.com/saicaca/fuwari/graphs/contributors">
>  <img src="https://contrib.rocks/image?repo=saicaca/fuwari" />
></a>

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CuteLeaf/Firefly&type=Date)](https://star-history.com/#CuteLeaf/Firefly&Date)


<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
