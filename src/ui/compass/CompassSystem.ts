import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager } from '../../systems/world/ZoneManager';

export class CompassSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;

  // DOM elements
  private compassContainer!: HTMLDivElement;
  private compassRose!: HTMLDivElement;
  private headingText!: HTMLElement;
  private directionIndicator!: HTMLElement;
  private markersContainer!: HTMLDivElement;

  // Player tracking
  private playerHeading = 0; // In radians, 0 = North (-Z), π/2 = East (+X)

  private readonly COMPASS_STYLES = `
    .compass-container {
      position: fixed;
      top: 120px;
      left: 50%;
      transform: translateX(-50%);
      width: 180px;
      height: 80px;
      z-index: 115;
      pointer-events: none;
    }

    .compass-rose-container {
      position: relative;
      width: 180px;
      height: 50px;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.5), rgba(10, 10, 14, 0.2));
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      overflow: hidden;
    }

    .compass-rose {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1440px; /* Quadruple width for better seamless rotation */
      height: 40px;
      transform: translate(-50%, -50%);
      transition: none;
    }

    .compass-marks {
      position: absolute;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .compass-cardinal {
      position: absolute;
      color: rgba(255, 255, 255, 0.9);
      font-family: 'Courier New', monospace;
      font-weight: bold;
      font-size: 18px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    .compass-cardinal.north { color: #ff4444; }
    .compass-cardinal.east { color: rgba(255, 255, 255, 0.7); }
    .compass-cardinal.south { color: rgba(255, 255, 255, 0.7); }
    .compass-cardinal.west { color: rgba(255, 255, 255, 0.7); }

    .compass-degree {
      position: absolute;
      color: rgba(255, 255, 255, 0.4);
      font-family: 'Courier New', monospace;
      font-size: 10px;
      top: 50%;
      transform: translateY(-50%);
    }

    .compass-center-marker {
      position: absolute;
      top: 0;
      left: 50%;
      width: 2px;
      height: 100%;
      background: linear-gradient(to bottom,
        rgba(255, 255, 255, 0.8) 0%,
        rgba(255, 255, 255, 0.6) 20%,
        transparent 40%,
        transparent 60%,
        rgba(255, 255, 255, 0.6) 80%,
        rgba(255, 255, 255, 0.8) 100%
      );
      transform: translateX(-50%);
      z-index: 10;
      pointer-events: none;
    }

    .compass-heading {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 255, 255, 0.9);
      font-family: 'Courier New', monospace;
      font-size: 14px;
      font-weight: bold;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      padding: 2px 8px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 4px;
    }

    .compass-tick {
      position: absolute;
      width: 1px;
      height: 10px;
      background: rgba(255, 255, 255, 0.3);
      top: 50%;
      transform: translateY(-50%);
    }

    .compass-markers {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .compass-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-weight: bold;
      font-size: 11px;
      border-radius: 50%;
      border: 2px solid;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    }

    .compass-marker.friendly {
      background: rgba(0, 100, 255, 0.3);
      border-color: rgba(0, 150, 255, 0.8);
      color: rgba(0, 200, 255, 1);
    }

    .compass-marker.enemy {
      background: rgba(255, 50, 50, 0.3);
      border-color: rgba(255, 100, 100, 0.8);
      color: rgba(255, 150, 150, 1);
    }

    .compass-marker.neutral {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.6);
      color: rgba(255, 255, 255, 0.9);
    }

    .compass-marker.contested {
      animation: compassBlink 0.6s infinite;
      background: rgba(255, 200, 0, 0.3);
      border-color: rgba(255, 200, 0, 0.8);
      color: rgba(255, 220, 100, 1);
    }

    @keyframes compassBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Create compass container
    this.compassContainer = document.createElement('div');
    this.compassContainer.className = 'compass-container';

    // Create rose container
    const roseContainer = document.createElement('div');
    roseContainer.className = 'compass-rose-container';

    // Create rotating compass rose
    this.compassRose = document.createElement('div');
    this.compassRose.className = 'compass-rose';

    // Create compass marks
    const marks = document.createElement('div');
    marks.className = 'compass-marks';

    // Add cardinal directions (we'll add two sets for seamless scrolling)
    const directions = [
      { text: 'N', deg: 0, cardinal: true, isNorth: true },
      { text: '30', deg: 30, cardinal: false },
      { text: '60', deg: 60, cardinal: false },
      { text: 'E', deg: 90, cardinal: true },
      { text: '120', deg: 120, cardinal: false },
      { text: '150', deg: 150, cardinal: false },
      { text: 'S', deg: 180, cardinal: true },
      { text: '210', deg: 210, cardinal: false },
      { text: '240', deg: 240, cardinal: false },
      { text: 'W', deg: 270, cardinal: true },
      { text: '300', deg: 300, cardinal: false },
      { text: '330', deg: 330, cardinal: false }
    ];

    // Add four sets of directions for better seamless rotation
    for (let setIndex = 0; setIndex < 4; setIndex++) {
      directions.forEach(dir => {
        const elem = document.createElement('div');
        if (dir.cardinal) {
          elem.className = `compass-cardinal ${dir.text.toLowerCase()}`;
          elem.textContent = dir.text;
        } else {
          elem.className = 'compass-degree';
          elem.textContent = dir.text;
        }

        // Position around the compass (2 pixels per degree)
        const position = (dir.deg + setIndex * 360) * 2;
        elem.style.left = `${position}px`;
        elem.style.transform = 'translateX(-50%) translateY(-50%)';
        elem.style.top = '50%';

        marks.appendChild(elem);
      });

      // Add tick marks
      for (let deg = 0; deg < 360; deg += 10) {
        if (deg % 30 !== 0) { // Skip positions where we have text
          const tick = document.createElement('div');
          tick.className = 'compass-tick';
          const position = (deg + setIndex * 360) * 2;
          tick.style.left = `${position}px`;
          tick.style.transform = 'translateX(-50%)';
          marks.appendChild(tick);
        }
      }
    }

    this.compassRose.appendChild(marks);
    roseContainer.appendChild(this.compassRose);

    // Add center marker (stays fixed)
    const centerMarker = document.createElement('div');
    centerMarker.className = 'compass-center-marker';
    roseContainer.appendChild(centerMarker);

    // Create zone markers container
    this.markersContainer = document.createElement('div');
    this.markersContainer.className = 'compass-markers';
    roseContainer.appendChild(this.markersContainer);

    // Add heading text
    this.headingText = document.createElement('div');
    this.headingText.className = 'compass-heading';
    this.headingText.textContent = '000°';

    // Assemble
    this.compassContainer.appendChild(roseContainer);
    this.compassContainer.appendChild(this.headingText);

    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = this.COMPASS_STYLES;
    document.head.appendChild(styleSheet);

    // Store style reference for disposal
    (this.compassContainer as any).styleSheet = styleSheet;
  }

  async init(): Promise<void> {
    console.log('🧭 Initializing Compass System...');
    document.body.appendChild(this.compassContainer);
    console.log('✅ Compass System initialized');
  }

  update(deltaTime: number): void {
    // Get camera direction
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    // Calculate heading from true north
    // IMPORTANT: In our game world after the map flip:
    // - North (towards OPFOR) is actually +Z direction
    // - South (towards US) is -Z direction
    // - East is -X direction
    // - West is +X direction
    // This is because we flipped both axes on the map
    // So we need to calculate heading accordingly
    this.playerHeading = Math.atan2(-cameraDir.x, cameraDir.z);

    // Convert to degrees (0-360)
    let headingDegrees = this.playerHeading * 180 / Math.PI;
    // Normalize to 0-360 range
    while (headingDegrees < 0) headingDegrees += 360;
    while (headingDegrees >= 360) headingDegrees -= 360;

    // Update heading text
    const displayDegrees = Math.round(headingDegrees);
    this.headingText.textContent = `${displayDegrees.toString().padStart(3, '0')}°`;

    // Slide the compass strip horizontally so current heading appears at center
    // The strip has markings at 2 pixels per degree
    // We slide LEFT when turning right (heading increases) to show higher degrees at center
    const pixelsPerDegree = 2;
    // Start with north (0°) at center when heading is 0
    // The strip has 4 sets of 360° (1440° total)
    // We want the current heading to appear at center
    const offset = -headingDegrees * pixelsPerDegree + 720; // 720 is center of second set

    this.compassRose.style.transform = `translate(calc(-50% + ${offset}px), -50%)`;

    // Update zone markers
    if (this.zoneManager) {
      this.updateZoneMarkers(headingDegrees);
    }
  }

  private updateZoneMarkers(playerHeadingDegrees: number): void {
    if (!this.zoneManager) return;

    // Clear existing markers
    this.markersContainer.innerHTML = '';

    // Get camera position to calculate relative directions
    const cameraPos = new THREE.Vector3();
    (this.camera as any).getWorldPosition(cameraPos);

    // Get all zones
    const zones = (this.zoneManager as any).zones as Map<string, any>;
    if (!zones) return;

    const compassWidth = 200; // Width of the compass display
    const centerX = compassWidth / 2; // Center of compass

    zones.forEach((zone) => {
      // Calculate direction from player to zone
      const dirToZone = new THREE.Vector3().subVectors(zone.position, cameraPos);
      const directionAngle = Math.atan2(-dirToZone.x, dirToZone.z) * 180 / Math.PI;

      // Normalize angle
      let angle = directionAngle;
      while (angle < 0) angle += 360;
      while (angle >= 360) angle -= 360;

      // Calculate relative angle from player's current heading
      let relativeAngle = angle - playerHeadingDegrees;
      while (relativeAngle < -180) relativeAngle += 360;
      while (relativeAngle > 180) relativeAngle -= 360;

      // Only show markers within ±90 degrees of current view
      if (Math.abs(relativeAngle) > 90) return;

      // Calculate pixel position on compass (2 pixels per degree)
      const markerX = centerX + relativeAngle * 2;

      // Determine marker styling based on zone state
      let markerClass = 'compass-marker ';
      let displayText = zone.id.charAt(0).toUpperCase();

      const state = zone.state;
      const Faction = (this.zoneManager as any).constructor.Faction;

      if (state === 'contested') {
        markerClass += 'contested';
      } else if (zone.owner === Faction?.US) {
        markerClass += 'friendly';
      } else if (zone.owner === Faction?.OPFOR) {
        markerClass += 'enemy';
      } else {
        markerClass += 'neutral';
      }

      // Create marker element
      const marker = document.createElement('div');
      marker.className = markerClass;
      marker.textContent = displayText;
      marker.style.left = `${markerX}px`;

      this.markersContainer.appendChild(marker);
    });
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  dispose(): void {
    if (this.compassContainer.parentNode) {
      this.compassContainer.parentNode.removeChild(this.compassContainer);
    }

    // Remove styles
    const styleSheet = (this.compassContainer as any).styleSheet;
    if (styleSheet && styleSheet.parentNode) {
      styleSheet.parentNode.removeChild(styleSheet);
    }

    console.log('🧹 Compass System disposed');
  }
}