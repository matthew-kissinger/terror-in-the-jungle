/**
 * Loading indicator UI module for SandboxRenderer.
 * Manages the spawn loading overlay with CSS styling.
 */

export class SandboxLoadingUI {
  private spawnLoadingDiv?: HTMLDivElement;

  showSpawnLoadingIndicator(): void {
    this.spawnLoadingDiv = document.createElement('div');
    this.spawnLoadingDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 10003;
      transition: opacity 0.5s ease-out;
    `;

    this.spawnLoadingDiv.innerHTML = `
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .loading-ring {
          width: 60px;
          height: 60px;
          border: 3px solid rgba(74, 124, 78, 0.2);
          border-top: 3px solid #4a7c4e;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .loading-text {
          color: #8fbc8f;
          font-family: 'Rajdhani', 'Segoe UI', sans-serif;
          font-size: 18px;
          margin-top: 20px;
          animation: pulse 2s ease-in-out infinite;
        }
        .loading-tip {
          color: #708070;
          font-family: 'Rajdhani', 'Segoe UI', sans-serif;
          font-size: 14px;
          margin-top: 10px;
          max-width: 400px;
          text-align: center;
        }
      </style>
      <div class="loading-ring"></div>
      <div class="loading-text">DEPLOYING TO BATTLEFIELD</div>
      <div class="loading-tip">Generating terrain and preparing combat zone...</div>
    `;

    document.body.appendChild(this.spawnLoadingDiv);
  }

  hideSpawnLoadingIndicator(): void {
    if (this.spawnLoadingDiv) {
      this.spawnLoadingDiv.style.opacity = '0';
      setTimeout(() => {
        if (this.spawnLoadingDiv && this.spawnLoadingDiv.parentElement) {
          this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
          this.spawnLoadingDiv = undefined;
        }
      }, 500);
    }
  }

  dispose(): void {
    if (this.spawnLoadingDiv && this.spawnLoadingDiv.parentElement) {
      this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
      this.spawnLoadingDiv = undefined;
    }
  }

  getElement(): HTMLDivElement | undefined {
    return this.spawnLoadingDiv;
  }
}
