export class LoadingStyles {
  static getStyles(): string {
    return `
      /* CSS Variables for consistent theming */
      :root {
        --primary-color: #7fb4d9;
        --secondary-color: #5a8fb5;
        --accent-color: #9fcfeb;
        --text-primary: #e8f4f8;
        --text-secondary: #b8d4e3;
        --glass-bg: rgba(20, 35, 50, 0.4);
        --glass-border: rgba(127, 180, 217, 0.2);
        --button-bg: rgba(90, 143, 181, 0.3);
        --button-hover: rgba(90, 143, 181, 0.5);
      }

      #loading-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: url('./assets/background.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        color: var(--text-primary);
        transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: auto;
        padding: 1rem;
      }

      /* Overlay for better text readability */
      #loading-screen::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(ellipse at center, transparent 0%, rgba(10, 20, 30, 0.4) 100%);
        pointer-events: none;
      }

      .loading-content {
        text-align: center;
        max-width: 90%;
        width: 650px;
        max-height: 90vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 30px;
        background: var(--glass-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 20px;
        border: 1px solid var(--glass-border);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      /* Custom scrollbar for loading content */
      .loading-content::-webkit-scrollbar {
        width: 8px;
      }

      .loading-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
      }

      .loading-content::-webkit-scrollbar-thumb {
        background: var(--primary-color);
        border-radius: 4px;
        opacity: 0.5;
      }

      .game-title {
        font-size: clamp(1.5rem, 4vw, 2.5rem);
        font-weight: 300;
        color: var(--primary-color);
        text-shadow: 0 0 30px rgba(127, 180, 217, 0.5);
        margin: 0;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        animation: fadeInUp 1s ease-out;
      }

      .subtitle {
        font-size: clamp(0.75rem, 1.5vw, 1rem);
        color: var(--text-secondary);
        margin: 0;
        margin-bottom: 1rem;
        font-weight: 300;
        letter-spacing: 0.1em;
        animation: fadeInUp 1s ease-out 0.2s backwards;
      }

      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .loading-bar {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        position: relative;
        margin: 0.5rem 0;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--secondary-color), var(--primary-color), var(--accent-color));
        background-size: 200% 100%;
        animation: shimmer 3s ease-in-out infinite;
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 3px;
        box-shadow: 0 0 20px var(--primary-color);
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .percent-text {
        position: absolute;
        top: -25px;
        right: 0;
        font-size: 0.875rem;
        font-weight: 400;
        color: var(--text-secondary);
        letter-spacing: 0.05em;
      }

      .phase-text {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin: 0.5rem 0;
        height: 20px;
        opacity: 0.8;
        letter-spacing: 0.05em;
      }

      .tip-container {
        margin: 0;
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.05);
        border-left: 2px solid var(--primary-color);
        border-radius: 8px;
        min-height: 40px;
      }

      .tip-label {
        font-size: 0.75rem;
        color: var(--primary-color);
        margin-bottom: 0.25rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 500;
      }

      .tip-text {
        font-size: 0.875rem;
        color: var(--text-secondary);
        line-height: 1.5;
        animation: fadeIn 0.5s ease-in;
      }

      @keyframes fadeIn {
        0% { opacity: 0; transform: translateY(5px); }
        100% { opacity: 1; transform: translateY(0); }
      }

      .menu-buttons {
        display: none;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
        align-items: center;
        animation: fadeInUp 0.6s ease-out 0.4s backwards;
      }

      .menu-buttons.visible {
        display: flex;
      }

      .menu-button {
        padding: 0.75rem 2.5rem;
        font-size: 0.9rem;
        font-weight: 400;
        font-family: inherit;
        background: var(--button-bg);
        color: var(--text-primary);
        border: 1px solid var(--glass-border);
        border-radius: 50px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        min-width: 220px;
        min-height: 44px;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        position: relative;
        overflow: hidden;
      }

      .menu-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        transition: left 0.5s;
      }

      .menu-button:hover {
        background: var(--button-hover);
        border-color: var(--primary-color);
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 10px 30px rgba(127, 180, 217, 0.2);
      }

      .menu-button:hover::before {
        left: 100%;
      }

      .menu-button:active {
        transform: translateY(0) scale(1);
      }

      .play-button {
        font-size: 1rem;
        padding: 1rem 3rem;
        min-height: 48px;
        background: linear-gradient(135deg, var(--secondary-color), var(--primary-color));
        background-size: 200% 200%;
        animation: gradientShift 3s ease infinite;
        font-weight: 500;
      }

      @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      .secondary-button {
        font-size: 0.875rem;
        padding: 0.75rem 2rem;
        min-height: 44px;
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .secondary-button:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .loading-stats {
        position: absolute;
        bottom: 1rem;
        left: 1rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
        opacity: 0.3;
      }

      #loading-screen.hidden {
        opacity: 0;
        pointer-events: none;
      }

      /* Responsive Design */
      @media (max-width: 768px) {
        .loading-content {
          padding: 1.25rem;
          width: 95%;
          max-width: 95%;
        }

        .game-title {
          font-size: 1.5rem;
        }

        .subtitle {
          font-size: 0.75rem;
        }

        .menu-button {
          min-width: 180px;
          padding: 0.65rem 1.5rem;
          font-size: 0.8rem;
        }

        .play-button {
          font-size: 0.9rem;
          padding: 0.75rem 2rem;
        }

        .mode-cards {
          gap: 0.5rem;
        }

        .mode-card {
          width: 100% !important;
          max-width: 280px;
          padding: 0.75rem;
        }

        .mode-card-title {
          font-size: 1rem !important;
        }

        .mode-card-description {
          font-size: 0.75rem !important;
        }
      }

      @media (max-width: 480px) {
        .loading-content {
          padding: 1rem;
        }

        .game-title {
          font-size: 1.5rem;
          letter-spacing: 0.1em;
        }

        .subtitle {
          font-size: 0.75rem;
          margin-bottom: 1.5rem;
        }
      }

      @media (min-width: 1200px) {
        .loading-content {
          max-width: 750px;
        }
      }

      /* Smooth transitions */
      .transition-active {
        animation: fadeOut 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      @keyframes fadeOut {
        to {
          opacity: 0;
          transform: scale(1.05);
        }
      }
    `;
  }
}