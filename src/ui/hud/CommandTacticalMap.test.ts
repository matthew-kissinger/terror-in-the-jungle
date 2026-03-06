/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CommandTacticalMap } from './CommandTacticalMap';

describe('CommandTacticalMap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => createCanvasContextStub() as never);
  });

  it('renders the active placement label and tactical window size', () => {
    const map = new CommandTacticalMap();
    document.body.appendChild(map.getElement());

    map.setPlacementCommandLabel('HOLD POSITION');
    map.setRenderState({
      playerPosition: new THREE.Vector3(0, 5, 0),
      playerRotation: 0,
      worldSize: 480
    });

    expect(document.body.textContent).toContain('Place HOLD POSITION');
    expect(document.body.textContent).toContain('480m tactical window centered on player');

    map.dispose();
  });

  it('maps a center click back to the player position', () => {
    const map = new CommandTacticalMap();
    const onPointSelected = vi.fn();
    map.setCallbacks({ onPointSelected });
    map.setPlacementCommandLabel('HOLD POSITION');
    map.setRenderState({
      playerPosition: new THREE.Vector3(50, 5, -25),
      playerRotation: 0,
      worldSize: 320
    });
    document.body.appendChild(map.getElement());

    const canvas = document.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 160, button: 0 }));

    expect(onPointSelected).toHaveBeenCalledWith(
      expect.objectContaining({ x: 50, y: 5, z: -25 })
    );

    map.dispose();
  });

  it('ignores clicks until a ground order is armed', () => {
    const map = new CommandTacticalMap();
    const onPointSelected = vi.fn();
    map.setCallbacks({ onPointSelected });
    map.setRenderState({
      playerPosition: new THREE.Vector3(0, 0, 0),
      playerRotation: 0,
      worldSize: 320
    });
    document.body.appendChild(map.getElement());

    const canvas = document.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 160, button: 0 }));

    expect(onPointSelected).not.toHaveBeenCalled();

    map.dispose();
  });

  it('maps offset clicks into world offsets using player rotation', () => {
    const map = new CommandTacticalMap();
    const onPointSelected = vi.fn();
    map.setCallbacks({ onPointSelected });
    map.setPlacementCommandLabel('RETREAT');
    map.setRenderState({
      playerPosition: new THREE.Vector3(0, 0, 0),
      playerRotation: Math.PI / 2,
      worldSize: 320
    });
    document.body.appendChild(map.getElement());

    const canvas = document.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 240, clientY: 160, button: 0 }));

    const placedPosition = onPointSelected.mock.calls[0]?.[0];
    expect(placedPosition.x).toBeCloseTo(0, 5);
    expect(placedPosition.z).toBeCloseTo(80, 5);

    map.dispose();
  });
});

function createCanvasContextStub() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    closePath: vi.fn()
  };
}
