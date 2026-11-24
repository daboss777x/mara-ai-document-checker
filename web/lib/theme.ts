/**
 * Brokerage theme slot (BUILD_PLAN §9). Brokerages are white-labelled: the product chrome
 * uses the shared design tokens, and each brokerage supplies a brand colour and logo.
 *
 * TODO(design): replace defaults with the Claude Design export (IvyFlow chrome + Cedar & Stone theme).
 * TODO(Phase 1): load per-brokerage values from brokerages.settings_json instead of this constant.
 */
export type BrokerageTheme = {
  name: string;
  /** Any CSS colour. Exposed as --brand. */
  brandColor: string;
  /** Text colour on top of brandColor. Exposed as --brand-foreground. */
  brandForeground: string;
  logoUrl: string;
};

export const CEDAR_AND_STONE_THEME: BrokerageTheme = {
  name: "Cedar & Stone Realty",
  brandColor: "#7a4b2a", // cedar brown
  brandForeground: "#ffffff",
  logoUrl: "/brand/cedar-stone-logo.svg",
};

export function getBrokerageTheme(): BrokerageTheme {
  return CEDAR_AND_STONE_THEME;
}

/** Inline style that sets the theme's CSS variables on a wrapper element. */
export function themeStyle(theme: BrokerageTheme): Record<string, string> {
  return { "--brand": theme.brandColor, "--brand-foreground": theme.brandForeground };
}
