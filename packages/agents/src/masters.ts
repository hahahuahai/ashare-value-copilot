/**
 * 大师注册表（v0.2.0 起的多大师体系）
 *
 * 设计目标：
 * - 把"启用哪些大师"做成数据驱动 —— 加新大师只需要往这里追加 `MasterDef` + 写一份 prompts/<id>.md
 * - 不再硬编码 `buffett | duan` 联合类型，避免每加一位都要改 N 处
 * - "judge"/"reviewer" 不在大师表里，它们是流程节点，单独走
 *
 * 命名/角色定位（重要）：
 *  - id：英文短 ID，与 prompts/<id>.md 一一对应，也是 settings 里的开关 key
 *  - displayName：UI 上显示的中文名
 *  - subtitle：卡片副标题，一句话提示该大师的差异化卖点
 *  - tagline：在裁判/复核 prompt 里给出的角色定位，避免 AI 把六个人写得像一个人
 *  - defaultEnabled：首发默认开 true，新加大师默认 false，让用户自己选
 */

export interface MasterDef {
  id: string;
  displayName: string;
  subtitle: string;
  tagline: string;
  defaultEnabled: boolean;
}

/**
 * v0.2.0 首发 6 位大师（按价值投资光谱排列：经典守门 → 成长 → 周期 → 防御 → 管理层 → 中国语境）
 *
 * - buffett / duan：原有两位，保持不动
 * - munger：芒格，专门给"否决视角"
 * - lynch：彼得·林奇，弥补成长股/PEG 维度
 * - marks：霍华德·马克斯，行业周期与情绪钟摆
 * - graham：格雷厄姆，深度防御 / 净净股
 * - fisher：菲利普·费雪，管理层质量与"闲聊法"
 * - lilu：李录，A 股/港股语境的中国式价投
 *
 * 注意：buffett/duan/munger/lilu defaultEnabled=true（首屏开 4 位），其余按需开。
 * 这样普通用户开箱即用，深度用户自己折腾。
 */
export const MASTERS: MasterDef[] = [
  {
    id: "buffett",
    displayName: "巴菲特",
    subtitle: "护城河 · ROE · 现金流 · 安全边际",
    tagline: "沃伦·巴菲特，奥马哈先知，主管「好生意/好公司/好价格」三段式守门员。",
    defaultEnabled: true,
  },
  {
    id: "duan",
    displayName: "段永平",
    subtitle: "商业本质 · Stop Doing · 不贵就行",
    tagline: "段永平，A 股语境的能力圈门禁与商业本质拷问者。",
    defaultEnabled: true,
  },
  {
    id: "munger",
    displayName: "查理·芒格",
    subtitle: "否决视角 · Lollapalooza · 反向思考",
    tagline: "查理·芒格，专门挑刺的合伙人，以「反过来想」找毁掉投资的因素。",
    defaultEnabled: true,
  },
  {
    id: "lynch",
    displayName: "彼得·林奇",
    subtitle: "成长股 · PEG · 6 类公司分类",
    tagline: "彼得·林奇，麦哲伦基金前舵手，用 PEG 与 6 类公司分类找十倍股。",
    defaultEnabled: false,
  },
  {
    id: "marks",
    displayName: "霍华德·马克斯",
    subtitle: "周期 · 情绪钟摆 · 第二层思维",
    tagline: "霍华德·马克斯，橡树资本创始人，以周期与第二层思维评估市场情绪与风险。",
    defaultEnabled: false,
  },
  {
    id: "graham",
    displayName: "本杰明·格雷厄姆",
    subtitle: "深度价值 · 净净股 · Margin of Safety",
    tagline: "本杰明·格雷厄姆，价投鼻祖，强调防御性投资与定量安全边际。",
    defaultEnabled: false,
  },
  {
    id: "fisher",
    displayName: "菲利普·费雪",
    subtitle: "管理层质量 · 闲聊法 · 长期成长",
    tagline: "菲利普·费雪，《Common Stocks and Uncommon Profits》作者，重管理层与质量增长。",
    defaultEnabled: false,
  },
  {
    id: "lilu",
    displayName: "李录",
    subtitle: "中国语境价投 · 长期复利 · 文明视角",
    tagline: "李录，喜马拉雅资本创始人，用文明史与中国语境演绎价投。",
    defaultEnabled: true,
  },
];

/** 通过 id 取大师定义，找不到返回 undefined。 */
export function getMaster(id: string): MasterDef | undefined {
  return MASTERS.find((m) => m.id === id);
}

/** 校验 id 是否是已注册的大师（不含 judge/reviewer）。 */
export function isMasterId(id: string): boolean {
  return MASTERS.some((m) => m.id === id);
}

/** 默认开启的大师 id 列表，用于首次启动 settings。 */
export function defaultEnabledMasterIds(): string[] {
  return MASTERS.filter((m) => m.defaultEnabled).map((m) => m.id);
}
