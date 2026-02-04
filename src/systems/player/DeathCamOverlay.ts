import * as THREE from 'three';

export interface KillerInfo {
  name: string;
  position: THREE.Vector3;
  weaponName: string;
  faction: string;
  distance: number;
  wasHeadshot?: boolean;
}

export class DeathCamOverlay {
  private overlayElement?: HTMLDivElement;
  private killerNameEl?: HTMLDivElement;
  private killDetailsEl?: HTMLDivElement;
  private headshotEl?: HTMLDivElement;
  private timerEl?: HTMLDivElement;

  createOverlay(): void {
    if (this.overlayElement) return;

    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'death-cam-overlay';
    this.overlayElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9000; display: none; font-family: "Courier New", monospace;';

    const vignette = document.createElement('div');
    vignette.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle, transparent 30%, rgba(0,0,0,0.7) 100%); pointer-events: none;';
    this.overlayElement.appendChild(vignette);

    const infoPanel = document.createElement('div');
    infoPanel.id = 'death-info-panel';
    infoPanel.style.cssText = 'position: absolute; top: 20%; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); border: 2px solid #ff0000; border-radius: 4px; padding: 20px 40px; text-align: center; animation: fadeSlideIn 0.5s ease-out;';

    this.killerNameEl = document.createElement('div');
    this.killerNameEl.id = 'killer-name';
    this.killerNameEl.style.cssText = 'color: #ff0000; font-size: 32px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; text-shadow: 0 0 10px rgba(255,0,0,0.5);';
    infoPanel.appendChild(this.killerNameEl);

    this.killDetailsEl = document.createElement('div');
    this.killDetailsEl.id = 'kill-details';
    this.killDetailsEl.style.cssText = 'color: #ffffff; font-size: 16px; margin-top: 10px;';
    infoPanel.appendChild(this.killDetailsEl);

    this.headshotEl = document.createElement('div');
    this.headshotEl.id = 'headshot-indicator';
    this.headshotEl.style.cssText = 'color: #ffaa00; font-size: 18px; font-weight: bold; margin-top: 10px; text-transform: uppercase; display: none;';
    this.headshotEl.textContent = ' HEADSHOT ';
    infoPanel.appendChild(this.headshotEl);

    this.overlayElement.appendChild(infoPanel);

    this.timerEl = document.createElement('div');
    this.timerEl.id = 'death-respawn-timer';
    this.timerEl.style.cssText = 'position: absolute; bottom: 30%; left: 50%; transform: translateX(-50%); color: #888888; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;';
    this.overlayElement.appendChild(this.timerEl);

    const style = document.createElement('style');
    style.textContent = '@keyframes fadeSlideIn { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } } #death-respawn-timer { animation: pulse 2s infinite; }';
    this.overlayElement.appendChild(style);

    document.body.appendChild(this.overlayElement);
  }

  showOverlay(killerInfo?: KillerInfo): void {
    if (!this.overlayElement) return;

    this.overlayElement.style.display = 'block';

    if (this.headshotEl) this.headshotEl.style.display = 'none';

    if (killerInfo) {
      if (this.killerNameEl) this.killerNameEl.textContent = `KILLED BY ${killerInfo.name}`;
      if (this.killDetailsEl) {
        this.killDetailsEl.innerHTML = `<div style="margin-bottom: 5px;">Weapon: ${killerInfo.weaponName}</div><div>Distance: ${Math.round(killerInfo.distance)}m</div>`;
      }
      if (this.headshotEl && killerInfo.wasHeadshot) this.headshotEl.style.display = 'block';
    } else {
      if (this.killerNameEl) this.killerNameEl.textContent = 'K.I.A.';
      if (this.killDetailsEl) this.killDetailsEl.textContent = 'Killed in Action';
    }

    if (this.timerEl) this.timerEl.textContent = 'Preparing respawn...';
  }

  hideOverlay(): void {
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  updateRespawnTimer(secondsRemaining: number): void {
    if (!this.timerEl) return;

    if (secondsRemaining > 0) {
      this.timerEl.textContent = `Respawn available in ${Math.ceil(secondsRemaining)}s`;
    } else {
      this.timerEl.textContent = 'Press to respawn';
    }
  }

  dispose(): void {
    if (this.overlayElement?.parentElement) this.overlayElement.parentElement.removeChild(this.overlayElement);

    this.overlayElement = undefined;
    this.killerNameEl = undefined;
    this.killDetailsEl = undefined;
    this.headshotEl = undefined;
    this.timerEl = undefined;
  }
}
