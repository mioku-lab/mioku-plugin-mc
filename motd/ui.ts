export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/** 卡片四角留白 */
export const CARD_INSET_X = 25;
export const CARD_INSET_Y = 28;

/** 卡片内部尺寸，按参考稿 1674×940 等比换算 */
export const LAYOUT = {
  iconLeft: 40,
  iconTop: 57,
  iconSize: 134,
  textLeft: 208,
  nameTop: 72,
  taglineTop: 121,
  descTop: 165,
  descWidth: 302,
  panelLeft: 28,
  panelTop: 261,
  panelWidth: 598,
  panelPaddingY: 6,
  rowHeight: 57,
  statIconLeft: 18,
  statIconSize: 24,
  statLabelLeft: 62,
  statValueLeft: 240,
  statCopyRight: 19,
} as const;

/** 像素字：字身 7 行，参考稿约 41px 高、字面略扁 */
export const NAME_UNIT_X = 4.08;
export const NAME_UNIT_Y = 4.48;
export const NAME_UNIT_MIN = 2.6;

export const UI = {
  bgFallback: "linear-gradient(150deg, #060a16 0%, #101a30 48%, #070c18 100%)",
  /** 左侧压暗，右侧留出极光与空岛 */
  scrim:
    "linear-gradient(100deg, rgba(3, 6, 14, 0.82) 0%, rgba(3, 6, 14, 0.62) 32%, rgba(3, 6, 14, 0.3) 60%, rgba(3, 6, 14, 0.08) 84%, rgba(3, 6, 14, 0) 100%)",
  cardBorder: "rgba(150, 190, 255, 0.15)",
  cardShadow: "0 30px 80px rgba(0, 0, 0, 0.45)",
  title: "#FFFFFF",
  tagline: "#FFFFFF",
  desc: "#BCD0E8",
  label: "#84AFF6",
  value: "#FFFFFF",
  panelTopLine: "rgba(104, 178, 255, 0.4)",
  panelTopGlow: "rgba(58, 116, 205, 0.16)",
  panelBg:
    "linear-gradient(180deg, rgba(34, 54, 104, 0.24) 0%, rgba(12, 20, 42, 0.24) 46%, rgba(10, 16, 34, 0.28) 100%)",
  panelBorder: "rgba(255, 255, 255, 0.045)",
  divider: "rgba(255, 255, 255, 0.1)",
  accent: "#7FA8F5",
  green: "#5AE87B",
  greenDim: "#2FAE5F",
  greenBg: "rgba(64, 220, 130, 0.12)",
  greenBorder: "rgba(90, 232, 123, 0.34)",
  copy: "#739DD3",
  avatarBg: "rgba(255, 255, 255, 0.07)",
  red: "#F07178",
  redBg: "rgba(240, 113, 120, 0.12)",
  redBorder: "rgba(240, 113, 120, 0.3)",
} as const;

const FONT = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", -apple-system, "Segoe UI", Roboto, sans-serif`;

export const UI_CSS = `
body { margin: 0; background: #04060d; }
/* 截图服务会注入自己的 reset，这里显式声明避免宿主样式影响度量 */
.mc-page, .mc-page *, .mc-page *::before, .mc-page *::after { box-sizing: border-box; }
.mc-page {
  position: relative; width: ${VIEW_WIDTH}px; height: ${VIEW_HEIGHT}px; overflow: hidden;
  background: ${UI.bgFallback};
  font-family: ${FONT};
  color: ${UI.value};
  -webkit-font-smoothing: antialiased;
}
/* 让空岛与极光落在卡片右侧 */
.mc-bg {
  position: absolute; inset: 0;
  background-size: 100% auto; background-position: 24% 86%; background-repeat: no-repeat;
}
.mc-scrim { position: absolute; inset: 0; background: ${UI.scrim}; }

.mc-card {
  position: absolute; left: ${CARD_INSET_X}px; top: ${CARD_INSET_Y}px;
  width: ${VIEW_WIDTH - CARD_INSET_X * 2}px; height: ${VIEW_HEIGHT - CARD_INSET_Y * 2}px;
  border-radius: 22px;
  border: 1px solid ${UI.cardBorder};
  box-shadow: ${UI.cardShadow};
}

.mc-icon {
  position: absolute; left: ${LAYOUT.iconLeft}px; top: ${LAYOUT.iconTop}px;
  width: ${LAYOUT.iconSize}px; height: ${LAYOUT.iconSize}px;
  border-radius: 20px; object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.34);
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.42);
}
.mc-icon--empty {
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; border-radius: 20px;
}

.mc-name { position: absolute; left: ${LAYOUT.textLeft}px; top: ${LAYOUT.nameTop}px; }
.mc-name .mc-pixel { display: block; }
.mc-name--text {
  top: 66px; font-size: 36px; line-height: 44px; font-weight: 600; color: ${UI.title};
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: ${VIEW_WIDTH - CARD_INSET_X * 2 - LAYOUT.textLeft - 40}px;
}
.mc-tagline {
  position: absolute; left: ${LAYOUT.textLeft}px; top: ${LAYOUT.taglineTop}px;
  max-width: 570px; font-size: 18.5px; line-height: 25px; color: ${UI.tagline};
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mc-desc {
  position: absolute; left: ${LAYOUT.textLeft}px; top: ${LAYOUT.descTop}px;
  width: ${LAYOUT.descWidth}px; font-size: 15px; line-height: 23.3px; color: ${UI.desc};
  overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.mc-tagline:empty, .mc-desc:empty { display: none; }

.mc-side {
  position: absolute; left: ${LAYOUT.panelLeft}px; top: ${LAYOUT.panelTop}px;
  width: ${LAYOUT.panelWidth}px; display: flex; flex-direction: column; gap: 14px;
}
.mc-stats {
  box-sizing: border-box; padding: ${LAYOUT.panelPaddingY}px 0;
  border-radius: 18px;
  background: ${UI.panelBg};
  border: 1px solid ${UI.panelBorder};
  border-top: 1px solid ${UI.panelTopLine};
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32), inset 0 1px 0 ${UI.panelTopGlow};
}
.mc-stat {
  display: flex; align-items: center; height: ${LAYOUT.rowHeight}px;
  padding: 0 ${LAYOUT.statCopyRight}px 0 ${LAYOUT.statIconLeft}px;
}
/* 连接信息与版本信息之间有一条分隔线，行高也略高一点 */
.mc-stat--split {
  height: ${LAYOUT.rowHeight + 4}px;
  box-shadow: inset 0 1px 0 ${UI.divider};
}
.mc-stat__icon { flex: none; width: ${LAYOUT.statIconSize}px; display: flex; color: ${UI.accent}; }
.mc-stat__label {
  flex: none; width: ${LAYOUT.statValueLeft - LAYOUT.statLabelLeft}px;
  margin-left: ${LAYOUT.statLabelLeft - LAYOUT.statIconLeft - LAYOUT.statIconSize}px;
  font-size: 15px; letter-spacing: 0.6px; text-transform: uppercase; color: ${UI.label};
}
.mc-stat__value {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px;
  font-size: 19px; color: ${UI.value};
}
/* 地址过长时整行降一档字号，宁可小一点也不要换行撑破面板 */
.mc-stat__value--sm { font-size: 15.5px; }
.mc-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-stat__copy { flex: none; width: 24px; display: flex; justify-content: flex-end; color: ${UI.copy}; }
.mc-version { display: flex; align-items: center; gap: 14px; }
.mc-badge {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 12px 5px 9px; border-radius: 9px; font-size: 14px;
  color: ${UI.green}; background: ${UI.greenBg}; border: 1px solid ${UI.greenBorder};
}
.mc-badge svg { display: block; }
.mc-players { display: flex; align-items: center; gap: 10px; }
.mc-players__count { flex: none; }
.mc-players__people { display: flex; color: #6E86B4; margin-left: 2px; }
.mc-avatars { display: flex; align-items: center; gap: 4px; }
.mc-avatar { display: flex; flex: none; }
.mc-avatar--more {
  height: 26px; padding: 0 9px; border-radius: 7px; align-items: center;
  font-size: 15px; color: #D6E2F5; background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.mc-latency { display: flex; align-items: center; gap: 14px; }
.mc-latency__value { color: ${UI.green}; }
.mc-latency__value--bad { color: ${UI.red}; }
.mc-latency__value--warn { color: #FFD166; }
.mc-latency__value--unknown { color: #8C96AA; }
.mc-signal { display: flex; align-items: flex-end; }
.mc-panel-error {
  box-sizing: border-box; padding: 14px 18px; border-radius: 14px;
  background: ${UI.redBg}; border: 1px solid ${UI.redBorder};
  color: #FFB9BD; font-size: 15px; line-height: 1.5;
}
.mc-svg { display: block; flex: none; }
.mc-svg--glow { filter: drop-shadow(0 0 5px rgba(120, 170, 255, 0.75)); }
`;
