export const COMPASS_STYLES = `
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
