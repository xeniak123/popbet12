// PopBet color palette and design tokens.
export const colors = {
  bg: "#FAFAF7",
  bgAlt: "#F5F3ED",
  card: "#FFFFFF",
  primary: "#FF8A65",
  primarySoft: "#FFE0D6",
  win: "#7FD8BE",
  winSoft: "#E4F7EF",
  loss: "#F4A6A6",
  lossSoft: "#FBE5E5",
  text: "#2D3748",
  textMuted: "#718096",
  border: "rgba(45, 55, 72, 0.06)",
  shadow: "rgba(45, 55, 72, 0.08)",
  categories: {
    sport: { bg: "#E3F2FD", accent: "#5B9BD5", emoji: "⚽" },
    awards: { bg: "#FFF9C4", accent: "#E0B84E", emoji: "🏆" },
    reality_tv: { bg: "#FCE4EC", accent: "#E38FB0", emoji: "📺" },
    gossip: { bg: "#F3E5F5", accent: "#B47EBB", emoji: "💬" },
    music: { bg: "#E8F5E9", accent: "#7BB77E", emoji: "🎤" },
  } as const,
};

export type CategoryKey = keyof typeof colors.categories;

export const categoryList: { key: CategoryKey | "all"; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "sport", label: "Sport" },
  { key: "awards", label: "Nagrody" },
  { key: "reality_tv", label: "Reality TV" },
  { key: "gossip", label: "Plotki" },
  { key: "music", label: "Muzyka" },
];

export const shadow = {
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  softer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const radii = { card: 24, pill: 999, button: 20 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
