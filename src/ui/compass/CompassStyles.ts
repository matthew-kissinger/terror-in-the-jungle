export const COMPASS_STYLES = `
    .compass-container {
      /* Positioned by grid slot [data-region="compass"] */
      width: 160px;
      height: 70px;
      pointer-events: none;
    }

    .compass-rose-container {
      position: relative;
      width: 160px;
      height: 42px;
      background: rgba(8, 12, 18, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
    }

    .compass-rose {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1440px;
      height: 36px;
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
      color: rgba(220, 225, 230, 0.7);
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.5px;
    }

    .compass-cardinal.north { color: rgba(201, 86, 74, 0.85); }
    .compass-cardinal.east { color: rgba(220, 225, 230, 0.5); }
    .compass-cardinal.south { color: rgba(220, 225, 230, 0.5); }
    .compass-cardinal.west { color: rgba(220, 225, 230, 0.5); }

    .compass-degree {
      position: absolute;
      color: rgba(220, 225, 230, 0.25);
      font-family: 'Rajdhani', sans-serif;
      font-size: 9px;
      font-weight: 600;
      top: 50%;
      transform: translateY(-50%);
    }

    .compass-center-marker {
      position: absolute;
      top: 0;
      left: 50%;
      width: 1px;
      height: 100%;
      background: linear-gradient(to bottom,
        rgba(220, 225, 230, 0.5) 0%,
        rgba(220, 225, 230, 0.3) 20%,
        transparent 40%,
        transparent 60%,
        rgba(220, 225, 230, 0.3) 80%,
        rgba(220, 225, 230, 0.5) 100%
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
      color: rgba(220, 225, 230, 0.65);
      font-family: 'Rajdhani', sans-serif;
      font-size: 12px;
      font-weight: 700;
      padding: 1px 6px;
      background: rgba(8, 12, 18, 0.4);
      border-radius: 3px;
      letter-spacing: 1px;
    }

    .compass-tick {
      position: absolute;
      width: 1px;
      height: 8px;
      background: rgba(220, 225, 230, 0.15);
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
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      font-size: 9px;
      border-radius: 50%;
      border: 1.5px solid;
    }

    .compass-marker.friendly {
      background: rgba(91, 140, 201, 0.25);
      border-color: rgba(91, 140, 201, 0.6);
      color: rgba(91, 140, 201, 0.9);
    }

    .compass-marker.enemy {
      background: rgba(201, 86, 74, 0.25);
      border-color: rgba(201, 86, 74, 0.6);
      color: rgba(201, 86, 74, 0.9);
    }

    .compass-marker.neutral {
      background: rgba(220, 225, 230, 0.1);
      border-color: rgba(220, 225, 230, 0.35);
      color: rgba(220, 225, 230, 0.7);
    }

    .compass-marker.contested {
      animation: compassBlink 0.8s infinite;
      background: rgba(212, 163, 68, 0.2);
      border-color: rgba(212, 163, 68, 0.6);
      color: rgba(212, 163, 68, 0.9);
    }

    @keyframes compassBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    @media (max-width: 768px) {
      .compass-container {
        width: 130px;
        height: 55px;
      }

      .compass-rose-container {
        width: 130px;
        height: 34px;
      }

      .compass-cardinal {
        font-size: 12px;
      }

      .compass-degree {
        font-size: 7px;
      }

      .compass-heading {
        font-size: 10px;
      }
    }
  `;
