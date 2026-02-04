import { COMPASS_STYLES } from './CompassStyles';

type CompassDOMRefs = {
  compassContainer: HTMLDivElement;
  compassRose: HTMLDivElement;
  headingText: HTMLElement;
  markersContainer: HTMLDivElement;
  styleSheet: HTMLStyleElement;
};

export function createCompassDOM(): CompassDOMRefs {
  const compassContainer = document.createElement('div');
  compassContainer.className = 'compass-container';

  const roseContainer = document.createElement('div');
  roseContainer.className = 'compass-rose-container';

  const compassRose = document.createElement('div');
  compassRose.className = 'compass-rose';

  const marks = document.createElement('div');
  marks.className = 'compass-marks';

  const directions = [
    { text: 'N', deg: 0, cardinal: true, isNorth: true },
    { text: '30', deg: 30, cardinal: false },
    { text: '60', deg: 60, cardinal: false },
    { text: 'E', deg: 90, cardinal: true },
    { text: '120', deg: 120, cardinal: false },
    { text: '150', deg: 150, cardinal: false },
    { text: 'S', deg: 180, cardinal: true },
    { text: '210', deg: 210, cardinal: false },
    { text: '240', deg: 240, cardinal: false },
    { text: 'W', deg: 270, cardinal: true },
    { text: '300', deg: 300, cardinal: false },
    { text: '330', deg: 330, cardinal: false }
  ];

  for (let setIndex = 0; setIndex < 4; setIndex++) {
    directions.forEach(dir => {
      const elem = document.createElement('div');
      if (dir.cardinal) {
        elem.className = `compass-cardinal ${dir.text.toLowerCase()}`;
        elem.textContent = dir.text;
      } else {
        elem.className = 'compass-degree';
        elem.textContent = dir.text;
      }

      const position = (dir.deg + setIndex * 360) * 2;
      elem.style.left = `${position}px`;
      elem.style.transform = 'translateX(-50%) translateY(-50%)';
      elem.style.top = '50%';

      marks.appendChild(elem);
    });

    for (let deg = 0; deg < 360; deg += 10) {
      if (deg % 30 !== 0) {
        const tick = document.createElement('div');
        tick.className = 'compass-tick';
        const position = (deg + setIndex * 360) * 2;
        tick.style.left = `${position}px`;
        tick.style.transform = 'translateX(-50%)';
        marks.appendChild(tick);
      }
    }
  }

  compassRose.appendChild(marks);
  roseContainer.appendChild(compassRose);

  const centerMarker = document.createElement('div');
  centerMarker.className = 'compass-center-marker';
  roseContainer.appendChild(centerMarker);

  const markersContainer = document.createElement('div');
  markersContainer.className = 'compass-markers';
  roseContainer.appendChild(markersContainer);

  const headingText = document.createElement('div');
  headingText.className = 'compass-heading';
  headingText.textContent = '000°';

  compassContainer.appendChild(roseContainer);
  compassContainer.appendChild(headingText);

  const styleSheet = document.createElement('style');
  styleSheet.textContent = COMPASS_STYLES;
  document.head.appendChild(styleSheet);

  return {
    compassContainer,
    compassRose,
    headingText,
    markersContainer,
    styleSheet
  };
}
