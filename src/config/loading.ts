interface LoadingPhaseConfig {
  id: string;
  weight: number;
  label: string;
}

interface LoadingTipConfig {
  text: string;
  category: 'controls' | 'gameplay' | 'lore' | 'tips';
}

export const LOADING_PHASES: LoadingPhaseConfig[] = [
  { id: 'core', weight: 0.1, label: 'Initializing core systems' },
  { id: 'textures', weight: 0.4, label: 'Loading textures' },
  { id: 'audio', weight: 0.2, label: 'Loading audio' },
  { id: 'world', weight: 0.2, label: 'Generating world' },
  { id: 'entities', weight: 0.1, label: 'Spawning entities' }
];

export const LOADING_TIPS: LoadingTipConfig[] = [
  { text: "Use WASD to move and SHIFT to sprint", category: 'controls' },
  { text: "Right-click to aim down sights for better accuracy", category: 'controls' },
  { text: "Press ESC to release mouse lock", category: 'controls' },
  { text: "Capture zones to drain enemy tickets", category: 'gameplay' },
  { text: "Stay with your squad for better survival", category: 'gameplay' },
  { text: "Headshots deal 70% more damage", category: 'gameplay' },
  { text: "Different vegetation provides different levels of cover", category: 'gameplay' },
  { text: "Listen for enemy gunfire to locate threats", category: 'gameplay' },
  { text: "The jungle remembers everything...", category: 'lore' },
  { text: "US Forces vs OPFOR - Who will control the zones?", category: 'lore' },
  { text: "Dense foliage can hide both friend and foe", category: 'lore' },
  { text: "Flank enemies for tactical advantage", category: 'tips' },
  { text: "Control high ground for better visibility", category: 'tips' },
  { text: "Suppressive fire keeps enemies pinned", category: 'tips' }
];
