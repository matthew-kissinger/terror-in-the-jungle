/**
 * Scoreboard overlay styles - responsive grid and mobile layout
 */

export const ScoreboardStyles = `
  .scoreboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }

  .scoreboard-title {
    text-align: center;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 30px;
    text-transform: uppercase;
    border-bottom: 2px solid rgba(255, 255, 255, 0.3);
    padding-bottom: 15px;
  }

  .scoreboard-hint {
    text-align: center;
    margin-top: 25px;
    font-size: 12px;
    opacity: 0.6;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 15px;
  }

  .scoreboard-team-label {
    font-size: 16px;
    margin-bottom: 15px;
  }

  @media (max-width: 768px) {
    .scoreboard-grid {
      gap: 15px;
    }
  }

  @media (max-width: 480px) {
    .scoreboard-grid {
      grid-template-columns: 1fr;
      gap: 15px;
    }

    .scoreboard-content {
      max-height: 85vh !important;
      overflow-y: auto !important;
      padding: 16px !important;
      width: 95% !important;
      max-width: 100% !important;
      box-sizing: border-box;
    }

    .scoreboard-title {
      font-size: 18px;
      margin-bottom: 16px;
      padding-bottom: 10px;
    }

    .scoreboard-content table {
      font-size: 11px;
    }

    .scoreboard-content .scoreboard-team-label {
      font-size: 14px;
      margin-bottom: 10px;
    }

    .scoreboard-hint {
      margin-top: 16px;
      font-size: 11px;
      padding-top: 10px;
    }
  }
`;
