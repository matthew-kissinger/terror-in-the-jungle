/**
 * CSS styles for the Match End Screen
 */

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
    z-index: 10000;
    color: #fff;
    font-family: 'Courier New', monospace;
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .match-end-screen.victory {
    background: rgba(20, 50, 20, 0.9);
  }

  .match-end-screen.defeat {
    background: rgba(50, 20, 20, 0.9);
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
    color: #4CAF50;
  }

  .defeat .end-screen-title {
    color: #F44336;
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
    min-width: 800px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    animation: fadeInUp 0.8s ease-out 0.2s backwards;
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
    color: #7FB4D9;
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
    color: #7FB4D9;
  }

  .stat-value.highlight {
    color: #4CAF50;
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
    color: #2196F3;
  }

  .faction-score.opfor .faction-tickets {
    color: #F44336;
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
    font-family: 'Courier New', monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .end-screen-button:hover {
    background: rgba(127, 180, 217, 0.3);
    border-color: #7FB4D9;
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(127, 180, 217, 0.3);
  }

  .end-screen-button.primary {
    background: rgba(127, 180, 217, 0.4);
    border-color: #7FB4D9;
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
    color: #7FB4D9;
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
    color: #7FB4D9;
    font-weight: bold;
  }

  .victory .award-value {
    color: #4CAF50;
  }

  .defeat .award-value {
    color: #F44336;
  }
`;

