/**
 * ModeCard - single game mode selection card component.
 */

export interface ModeCardConfig {
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cssClass: string;
  icon: string; // filename in assets/ui/icons/
}

export const MODE_CARD_CONFIGS: Record<string, ModeCardConfig> = {
  zone_control: {
    title: 'Zone Control',
    subtitle: 'Frontline Push',
    description: 'Platoon-scale capture lanes with ticket bleed and fast redeploys.',
    features: ['3 Zones', 'Ticket Bleed', '60 Units', '3 Min'],
    cssClass: 'zone-control-card',
    icon: 'mode-conquest.png',
  },
  open_frontier: {
    title: 'Open Frontier',
    subtitle: 'Maneuver Warfare',
    description: 'Wide-front insertion warfare built around helipads, footholds, and movement.',
    features: ['Wide Front', 'Helipads', '120 Units', '15 Min'],
    cssClass: 'open-frontier-card',
    icon: 'mode-frontier.png',
  },
  tdm: {
    title: 'Team Deathmatch',
    subtitle: 'Kill Race',
    description: 'Pure firefight mode with fast respawns and no capture overhead.',
    features: ['Kill Target', 'Fast Respawns', '30 Units', '5 Min'],
    cssClass: 'team-deathmatch-card',
    icon: 'mode-tdm.png',
  },
  a_shau_valley: {
    title: 'A Shau Valley',
    subtitle: 'Battalion Warzone',
    description: 'DEM terrain, war-sim pressure, helicopter insertions, and a strategic front.',
    features: ['21km DEM', '3000 Agents', 'Strategic Layer', '60 Min'],
    cssClass: 'a-shau-valley-card',
    icon: 'mode-ashau.png',
  },
};

