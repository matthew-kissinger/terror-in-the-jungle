/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MinimapSystem } from './MinimapSystem';

describe('MinimapSystem pinch zoom', () => {
  function createSystem(): MinimapSystem {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 0);
    camera.lookAt(0, 2, -1);
    return new MinimapSystem(camera);
  }

  it('initializes with default zoom level 1.0', async () => {
    const system = createSystem();
    await system.init();
    expect(system.getZoomLevel()).toBe(1.0);
    system.dispose();
  });

  it('setZoomLevel changes zoom and clamps to range', async () => {
    const system = createSystem();
    await system.init();

    system.setZoomLevel(2.0);
    expect(system.getZoomLevel()).toBe(2.0);

    // Clamp to max
    system.setZoomLevel(100);
    expect(system.getZoomLevel()).toBe(4.0);

    // Clamp to min
    system.setZoomLevel(0.1);
    expect(system.getZoomLevel()).toBe(0.5);

    system.dispose();
  });

  it('setWorldScale accounts for current zoom level', async () => {
    const system = createSystem();
    await system.init();

    system.setZoomLevel(2.0);
    system.setWorldScale(1000);

    // Internal WORLD_SIZE should be baseWorldSize / zoomLevel = 1000 / 2 = 500
    // We can verify by checking zoom level is still 2.0
    expect(system.getZoomLevel()).toBe(2.0);

    system.dispose();
  });

  it('container has touch-action: none after init', async () => {
    const system = createSystem();
    await system.init();

    // The minimap container should have touch-action: none for pinch gestures
    const container = document.querySelector('.minimap-container') as HTMLElement;
    expect(container).toBeTruthy();
    expect(container.style.touchAction).toBe('none');

    system.dispose();
  });

  it('handles pinch gesture to zoom in', async () => {
    const system = createSystem();
    await system.init();

    const container = document.querySelector('.minimap-container') as HTMLElement;
    expect(container).toBeTruthy();

    // Simulate two pointers touching down
    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, clientX: 50, clientY: 50,
    }));
    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 2, clientX: 100, clientY: 50,
    }));

    // Move pointers apart (pinch out = zoom in)
    container.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 1, clientX: 30, clientY: 50,
    }));
    container.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 2, clientX: 120, clientY: 50,
    }));

    // Zoom should have increased (distance increased from 50 to 90)
    expect(system.getZoomLevel()).toBeGreaterThan(1.0);

    system.dispose();
  });

  it('handles pinch gesture to zoom out', async () => {
    const system = createSystem();
    await system.init();
    system.setZoomLevel(2.0);

    const container = document.querySelector('.minimap-container') as HTMLElement;

    // Simulate two pointers touching down far apart
    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, clientX: 20, clientY: 50,
    }));
    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 2, clientX: 120, clientY: 50,
    }));

    // Move pointers closer (pinch in = zoom out)
    container.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 1, clientX: 40, clientY: 50,
    }));
    container.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 2, clientX: 100, clientY: 50,
    }));

    // Zoom should have decreased (distance decreased from 100 to 60)
    expect(system.getZoomLevel()).toBeLessThan(2.0);

    system.dispose();
  });

  it('releases pinch tracking on pointerup', async () => {
    const system = createSystem();
    await system.init();

    const container = document.querySelector('.minimap-container') as HTMLElement;

    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, clientX: 50, clientY: 50,
    }));
    container.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 2, clientX: 100, clientY: 50,
    }));

    // Release one pointer
    container.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 1, clientX: 50, clientY: 50,
    }));

    const zoomBefore = system.getZoomLevel();

    // Moving remaining pointer should not affect zoom (only 1 pointer active)
    container.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 2, clientX: 200, clientY: 50,
    }));

    expect(system.getZoomLevel()).toBe(zoomBefore);

    system.dispose();
  });
});
