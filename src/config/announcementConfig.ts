import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "CrystaRin镜雨亭 运营结束",

	// 公告内容
	content: "零音已完成对 Hazelita 服务器的运营，CrystaRin镜雨亭 今日重新开放。本次维护中，零音将该站点由 Hexo (Stellar) 切换到了 Astro (Firefly)。一些破坏性变更包括：将评论插件更换到了 Giscus，没有保留 Waline 的数据；部分文章的 slug 变更。友链和 RSS 链接不受影响。",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: false,
		// 链接文本
		text: "了解更多",
		// 链接 URL
		url: "/about/",
		// 内部链接
		external: false,
	},
};
