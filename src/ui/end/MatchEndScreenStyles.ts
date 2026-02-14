/**
 * CSS styles for the Match End Screen
 */

import { zIndex } from '../design/tokens';

export const MATCH_END_SCREEN_STYLES = `
  .match-end-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: ${zIndex.modal};
    color: #fff;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .match-end-screen.victory {
    background: rgba(8, 18, 12, 0.9);
  }

  .match-end-screen.defeat {
    background: rgba(18, 8, 8, 0.9);
  }

  .end-screen-header {
    text-align: center;
    margin-bottom: 2rem;
    animation: slideDown 0.6s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .end-screen-title {
    font-size: 4rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 0.5rem;
    text-shadow: 0 0 20px currentColor;
  }

  .victory .end-screen-title {
    color: rgba(92, 184, 92, 0.95);
  }

  .defeat .end-screen-title {
    color: rgba(201, 86, 74, 0.95);
  }

  .end-screen-subtitle {
    font-size: 1.5rem;
    opacity: 0.8;
    letter-spacing: 0.1em;
  }

  .stats-panel {
    background: rgba(20, 35, 50, 0.7);
    border: 2px solid rgba(127, 180, 217, 0.3);
    border-radius: 12px;
    padding: 2rem;
    width: 90%;
    max-width: 800px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    animation: fadeInUp 0.8s ease-out 0.2s backwards;
  }

  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .end-screen-title {
      font-size: 2.5rem;
      letter-spacing: 0.1em;
    }

    .end-screen-subtitle {
      font-size: 1.2rem;
    }

    .stats-panel {
      grid-template-columns: 1fr;
      padding: 1.5rem;
      gap: 1.5rem;
      max-height: 60vh;
      overflow-y: auto;
    }

    .stats-column {
      gap: 1rem;
    }

    .faction-tickets {
      font-size: 1.5rem;
    }

    .ticket-comparison {
      padding: 0.5rem;
      gap: 0.5rem;
    }

    .vs-divider {
      font-size: 1rem;
    }

    .end-screen-actions {
      flex-direction: column;
      width: 90%;
      max-width: 300px;
    }

    .end-screen-button {
      width: 100%;
      padding: 0.8rem 1.5rem;
    }
  }

  @media (max-width: 480px) {
    .end-screen-title {
      font-size: 1.5rem;
      letter-spacing: 0.05em;
    }

    .end-screen-subtitle {
      font-size: 0.9rem;
    }

    .stats-panel {
      padding: 0.75rem;
      width: 95%;
      gap: 1rem;
    }

    .stats-section-title {
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .stat-row {
      font-size: 0.9rem;
    }

    .award-badge {
      padding: 0.8rem;
      min-width: 120px;
    }

    .award-name {
      font-size: 0.8rem;
    }

    .award-value {
      font-size: 1rem;
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .victory .stats-panel {
    border-color: rgba(76, 175, 80, 0.5);
  }

  .defeat .stats-panel {
    border-color: rgba(244, 67, 54, 0.5);
  }

  .stats-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .stats-section {
    margin-bottom: 0.5rem;
  }

  .stats-section-title {
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 0.75rem;
    color: rgba(127, 180, 217, 0.8);
    border-bottom: 1px solid rgba(127, 180, 217, 0.3);
    padding-bottom: 0.5rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 0.3rem 0;
    font-size: 1.0rem;
  }

  .stat-label {
    opacity: 0.8;
  }

  .stat-value {
    font-weight: bold;
    color: rgba(127, 180, 217, 0.8);
  }

  .stat-value.highlight {
    color: rgba(92, 184, 92, 0.9);
  }

  .ticket-comparison {
    display: flex;
    justify-content: space-around;
    margin: 1rem 0;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .faction-score {
    text-align: center;
  }

  .faction-name {
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.7;
    margin-bottom: 0.5rem;
  }

  .faction-tickets {
    font-size: 2rem;
    font-weight: bold;
  }

  .faction-score.us .faction-tickets {
    color: rgba(91, 140, 201, 0.9);
  }

  .faction-score.opfor .faction-tickets {
    color: rgba(201, 86, 74, 0.9);
  }

  .vs-divider {
    display: flex;
    align-items: center;
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .end-screen-actions {
    margin-top: 2rem;
    display: flex;
    gap: 1rem;
    animation: fadeInUp 1s ease-out 0.4s backwards;
  }

  .end-screen-button {
    background: rgba(127, 180, 217, 0.2);
    border: 2px solid rgba(127, 180, 217, 0.5);
    color: #fff;
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .end-screen-button:hover {
    background: rgba(127, 180, 217, 0.3);
    border-color: rgba(127, 180, 217, 0.8);
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(127, 180, 217, 0.3);
  }

  .end-screen-button.primary {
    background: rgba(127, 180, 217, 0.4);
    border-color: rgba(127, 180, 217, 0.8);
  }

  .end-screen-button.primary:hover {
    background: rgba(127, 180, 217, 0.6);
  }

  .awards-section {
    margin-top: 2rem;
    animation: fadeInUp 1s ease-out 0.6s backwards;
  }

  .awards-title {
    text-align: center;
    font-size: 1.5rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 1rem;
    color: rgba(127, 180, 217, 0.8);
  }

  .awards-container {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .award-badge {
    background: rgba(127, 180, 217, 0.2);
    border: 2px solid rgba(127, 180, 217, 0.5);
    border-radius: 8px;
    padding: 1rem 1.5rem;
    min-width: 150px;
    text-align: center;
    transition: all 0.3s ease;
  }

  .victory .award-badge {
    border-color: rgba(76, 175, 80, 0.5);
  }

  .defeat .award-badge {
    border-color: rgba(244, 67, 54, 0.5);
  }

  .award-badge:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(127, 180, 217, 0.3);
  }

  .victory .award-badge:hover {
    box-shadow: 0 5px 15px rgba(76, 175, 80, 0.4);
  }

  .defeat .award-badge:hover {
    box-shadow: 0 5px 15px rgba(244, 67, 54, 0.4);
  }

  .award-name {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.5rem;
    color: #fff;
    font-weight: bold;
  }

  .award-value {
    font-size: 1.2rem;
    color: rgba(127, 180, 217, 0.8);
    font-weight: bold;
  }

  .victory .award-value {
    color: rgba(92, 184, 92, 0.9);
  }

  .defeat .award-value {
    color: rgba(201, 86, 74, 0.9);
  }
`;

