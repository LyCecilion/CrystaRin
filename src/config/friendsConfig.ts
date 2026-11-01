import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "友链",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "这里是水母和水母的朋友们",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
export const friendsConfig: FriendLink[] = [
	{
		title: "Patricia Of End's Blog",
		imgurl: "https://patriciaofend.cc/favicon.ico",
		desc: "假烟假酒假朋友，假情假意假温柔",
		siteurl: "https://patriciaofend.cc",
		weight: 10,
		enabled: true,
	},
	{
		title: "KitraMGP 的遐想空间",
		imgurl: "https://blog.kitramgp.cn/img/kitra1.jpg",
		desc: "这里记录了 Kitra 在计算机技术上的胡思乱想，分享编程实践、技术笔记和校园生活，写给同时热爱技术的你。",
		siteurl: "https://blog.kitramgp.cn/",
		weight: 10,
		enabled: true,
	},
	{
		title: "大象的小宇宙",
		imgurl: "https://hello8693.xyz/img/logo.svg",
		desc: "欢迎来到大象的小宇宙",
		siteurl: "https://hello8693.xyz",
		weight: 10,
		enabled: true,
	},
	{
		title: "岩的小站",
		imgurl: "https://docs.aflare.top/logo.png",
		desc: "一块板岩是平凡而脆弱的，但它的每一片岩层都有自己的故事。",
		siteurl: "https://docs.aflare.top/blog",
		weight: 10,
		enabled: true,
	},
	{
		title: "chenjintang's blog",
		imgurl:
			"https://lyriverse-assets.oss-cn-shanghai.aliyuncs.com/assets/friends/default-avatar.svg",
		desc: "chenjintang's blog",
		siteurl: "https://dev.cxshrimp.qzz.io/",
		weight: 10,
		enabled: true,
	},
	{
		title: "小阚LittleKan 似了吗？",
		imgurl:
			"https://lyriverse-assets.oss-cn-shanghai.aliyuncs.com/assets/friends/default-avatar.svg",
		desc: "小阚LittleKan 似了吗？",
		siteurl: "https://sleepy.littlekan.top/",
		weight: 10,
		enabled: true,
	},
	{
		title: "Brill's story",
		imgurl: "https://blog.brill.moe/favicon.svg",
		desc: "Brill's story",
		siteurl: "https://blog.brill.moe/",
		weight: 10,
		enabled: true,
	},
	{
		title: "Vaidurya's Warm Cabin",
		imgurl: "https://vaidurya5230.github.io/img/avatar.jpg",
		desc: "枕星河入梦，携草木寻诗",
		siteurl: "https://vaidurya5230.github.io/",
		weight: 10,
		enabled: true,
	},
	{
		title: "Capscene's Blog",
		imgurl:
			"https://capscene.top/wp-content/uploads/2026/05/cropped-3e328c574323b04658ac39eaa9907eba-192x192.jpg",
		desc: "See what you love, seize it in memory, and let it be preserved",
		siteurl: "https://capscene.top/",
		weight: 10,
		enabled: true,
	},
	{
		title: "Nan0inPsyLog",
		imgurl:
			"https://lyriverse-assets.oss-cn-shanghai.aliyuncs.com/assets/friends/nan0in.png",
		desc: "覆于这极夜不休而歌，直至无息-",
		siteurl: "https://nan0in27.cn/",
		weight: 10,
		enabled: true,
	},
	{
		title: "白糖的记事本",
		imgurl: "https://blog.sugarmgp.cn/favicon/sugarmgp-icon.png",
		desc: "关注白糖洒一地谢谢喵喵喵~",
		siteurl: "https://blog.sugarmgp.cn/",
		weight: 10,
		enabled: true,
	},
	{
		title: "CloverDayssssの小站",
		imgurl:
			"https://cloverdayssss.top/wp-content/themes/Sakura/images/favicon.ico",
		desc: "CloverDayssss的个人博客",
		siteurl: "https://cloverdayssss.top/",
		weight: 10,
		enabled: true,
	},
	{
		title: "LiPolymer",
		imgurl: "https://lipoly.ink/favicon.svg",
		desc: "hello! I'm LiPolymer :)",
		siteurl: "https://lipoly.ink/",
		weight: 10,
		enabled: true,
	},
	{
		title: "Tom_ChickenのBlog",
		imgurl: "https://blog.tomchicken.icu/favicon/HOSHINO_320px_pfp.webp",
		desc: "時よ止まれ、お前は美しい",
		siteurl: "https://blog.tomchicken.icu/",
		weight: 10,
		enabled: true,
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
