/**
 * Loading indicator UI module for GameRenderer.
 * Uses optimized loading artwork and supports dynamic status updates.
 */

import './LoadingUI.css';

export class LoadingUI {
  private spawnLoadingDiv?: HTMLDivElement;
  private statusText?: HTMLDivElement;
  private detailText?: HTMLDivElement;

  showSpawnLoadingIndicator(): void {
    if (this.spawnLoadingDiv) return;
    this.spawnLoadingDiv = document.createElement('div');
    this.spawnLoadingDiv.className = 'spawn-loading-overlay';

    this.spawnLoadingDiv.innerHTML = `
      <div class="spawn-loading-backdrop"></div>
      <div class="spawn-loading-panel">
        <div class="spawn-loading-ring" aria-hidden="true"></div>
        <div class="spawn-loading-status" data-ref="status">DEPLOYING TO BATTLEFIELD</div>
        <div class="spawn-loading-detail" data-ref="detail">Preparing insertion route and combat zone...</div>
      </div>
    `;

    this.statusText = this.spawnLoadingDiv.querySelector('[data-ref="status"]') as HTMLDivElement | null ?? undefined;
    this.detailText = this.spawnLoadingDiv.querySelector('[data-ref="detail"]') as HTMLDivElement | null ?? undefined;
    document.body.appendChild(this.spawnLoadingDiv);
  }

  setSpawnLoadingStatus(status: string, detail?: string): void {
    if (this.statusText) this.statusText.textContent = status;
    if (detail !== undefined && this.detailText) this.detailText.textContent = detail;
  }

  hideSpawnLoadingIndicator(): void {
    if (this.spawnLoadingDiv) {
      this.spawnLoadingDiv.classList.add('spawn-loading-overlay-hidden');
      setTimeout(() => {
        if (this.spawnLoadingDiv?.parentElement) {
          this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
        }
        this.spawnLoadingDiv = undefined;
        this.statusText = undefined;
        this.detailText = undefined;
      }, 450);
    }
  }

  dispose(): void {
    if (this.spawnLoadingDiv?.parentElement) {
      this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
    }
    this.spawnLoadingDiv = undefined;
    this.statusText = undefined;
    this.detailText = undefined;
  }

  getElement(): HTMLDivElement | undefined {
    return this.spawnLoadingDiv;
  }
}
