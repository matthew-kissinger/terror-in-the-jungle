/**
 * ModeCard - single game mode selection card component.
 */

export interface ModeCardConfig {
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cssClass: string;
}

export const MODE_CARD_CONFIGS: Record<string, ModeCardConfig> = {
  zone_control: {
    title: 'Zone Control',
    subtitle: 'Classic',
    description: 'Strategic 3-zone combat',
    features: ['3 Zones', '60 Units', '3 Min', '300 Tickets'],
    cssClass: 'zone-control-card',
  },
  open_frontier: {
    title: 'Open Frontier',
    subtitle: 'Large Scale',
    description: 'Massive 10-zone battlefield',
    features: ['10 Zones', '120+ Units', '15 Min', '1000 Tickets'],
    cssClass: 'open-frontier-card',
  },
  tdm: {
    title: 'Team Deathmatch',
    subtitle: 'Pure Combat',
    description: 'Eliminate the enemy team',
    features: ['400x400', '15v15', '5 Min'],
    cssClass: 'team-deathmatch-card',
  },
  a_shau_valley: {
    title: 'A Shau Valley',
    subtitle: 'Historical',
    description: 'Real terrain - Hamburger Hill 1969',
    features: ['21km', '200 Units', '30 Min', 'DEM Terrain'],
    cssClass: 'a-shau-valley-card',
  },
};

export function createModeCardHTML(mode: string, selected: boolean): string {
  const config = MODE_CARD_CONFIGS[mode];
  if (!config) return '';

  const selectedClass = selected ? ' selected' : '';
  const features = config.features
    .map(f => `<span class="mode-feature">${f}</span>`)
    .join('');

  return `
    <div class="mode-card ${config.cssClass}${selectedClass}" data-mode="${mode}">
      <div class="mode-card-indicator"></div>
      <div class="mode-card-header">
        <span class="mode-card-title">${config.title}</span>
        <span class="mode-card-subtitle">${config.subtitle}</span>
      </div>
      <div class="mode-card-description">${config.description}</div>
      <div class="mode-card-features">${features}</div>
    </div>
  `;
}
