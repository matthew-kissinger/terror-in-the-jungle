/**
 * Zone and objectives panel styles
 */

export const HUDZoneStyles = `
  .objectives-panel {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(10, 10, 14, 0.28);
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    min-width: 240px;
  }

  .objectives-title {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 10px;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    padding-bottom: 5px;
  }

  .zone-item {
    margin: 8px 0;
    padding: 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
  }

  .zone-name {
    font-weight: bold;
    text-transform: uppercase;
  }

  .zone-status {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .zone-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid white;
  }

  .zone-neutral { background: #888; }
  .zone-us { background: #0066cc; }
  .zone-opfor { background: #cc0000; }
  .zone-contested {
    background: linear-gradient(90deg, #0066cc 50%, #cc0000 50%);
    animation: pulse 1s infinite;
  }

  .capture-progress {
    width: 100px;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 3px;
  }

  .capture-bar {
    height: 100%;
    background: white;
    transition: width 0.3s ease;
  }

  .zone-distance {
    font-size: 10px;
    color: #aaa;
    margin-left: 5px;
  }
`;
