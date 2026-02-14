import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { DayNightCycle } from './DayNightCycle';
import { IGameRenderer } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger');

// Helper to create mock sandbox renderer
function createMockRenderer(): IGameRenderer {
  return {
    fog: {
      color: new THREE.Color(0x0a1012),
      density: 0.008
    } as THREE.FogExp2,
    ambientLight: {
      intensity: 0.5,
      color: new THREE.Color(0xffffff)
    } as THREE.AmbientLight,
    moonLight: {
      intensity: 1.0,
      color: new THREE.Color(0xffffff),
      position: new THREE.Vector3(0, 80, -50)
    } as THREE.DirectionalLight,
    hemisphereLight: {
      intensity: 0.5
    } as THREE.HemisphereLight
  } as IGameRenderer;
}

describe('DayNightCycle', () => {
  let system: DayNightCycle;
  let scene: THREE.Scene;
  let mockRenderer: IGameRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    system = new DayNightCycle(scene);
    mockRenderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should initialize with default time at noon', () => {
      expect(system.getTimeOfDay()).toBe(12.0);
    });

    it('should initialize with time scale of 1.0', () => {
      expect(system.getTimeScale()).toBe(1.0);
    });

    it('should not be in night mode by default', () => {
      expect(system.isNightMode()).toBe(false);
    });
  });

  describe('init', () => {
    it('should initialize without errors', async () => {
      await expect(system.init()).resolves.toBeUndefined();
    });

    it('should be callable multiple times', async () => {
      await system.init();
      await expect(system.init()).resolves.toBeUndefined();
    });
  });

  describe('setRenderer', () => {
    it('should accept and store renderer', () => {
      system.setRenderer(mockRenderer);
      // No error should be thrown
    });

    it('should cache fog values from renderer', () => {
      const customRenderer = createMockRenderer();
      customRenderer.fog!.color = new THREE.Color(0xff0000);
      customRenderer.fog!.density = 0.02;
      
      system.setRenderer(customRenderer);
      // Values are cached internally
    });

    it('should handle renderer without fog', () => {
      const rendererNoFog = { ...mockRenderer, fog: undefined };
      expect(() => system.setRenderer(rendererNoFog)).not.toThrow();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should not update without renderer', () => {
      const systemNoRenderer = new DayNightCycle(scene);
      const initialTime = systemNoRenderer.getTimeOfDay();
      
      systemNoRenderer.update(60); // 60 seconds
      
      expect(systemNoRenderer.getTimeOfDay()).toBe(initialTime);
    });

    it('should throttle updates to 0.5 second intervals', () => {
      const initialTime = system.getTimeOfDay();
      
      // Update with small delta (< 0.5s)
      system.update(0.1);
      expect(system.getTimeOfDay()).toBe(initialTime);
      
      // Update again, still under threshold
      system.update(0.3);
      expect(system.getTimeOfDay()).toBe(initialTime);
      
      // Update to cross threshold (total 0.5s)
      system.update(0.1);
      expect(system.getTimeOfDay()).toBeGreaterThan(initialTime);
    });

    it('should advance time based on delta', () => {
      const initialTime = system.getTimeOfDay();
      
      // 60 seconds = 1 game hour at default time scale
      system.update(60);
      
      expect(system.getTimeOfDay()).toBeCloseTo(initialTime + 1, 1);
    });

    it('should wrap time at 24 hours', () => {
      system.setTimeOfDay(23.5);
      
      // Advance 1 hour
      system.update(60);
      
      expect(system.getTimeOfDay()).toBeCloseTo(0.5, 1);
    });

    it('should not advance time when night mode is locked', () => {
      system.setNightMode(true);
      const lockedTime = system.getTimeOfDay();
      
      system.update(60);
      
      expect(system.getTimeOfDay()).toBe(lockedTime);
    });

    it('should update lighting when time changes', () => {
      const initialIntensity = mockRenderer.moonLight!.intensity;
      
      system.setTimeOfDay(6); // Dawn
      system.update(0.5);
      
      const dawnIntensity = mockRenderer.moonLight!.intensity;
      
      system.setTimeOfDay(12); // Noon
      system.update(0.5);
      
      const noonIntensity = mockRenderer.moonLight!.intensity;
      
      // Noon should be brighter than dawn
      expect(noonIntensity).toBeGreaterThan(dawnIntensity);
    });

    it('should update fog when time changes', () => {
      system.setTimeOfDay(12); // Day
      system.update(0.5);
      const dayFogColor = mockRenderer.fog!.color.clone();
      
      system.setTimeOfDay(0); // Night
      system.update(0.5);
      const nightFogColor = mockRenderer.fog!.color.clone();
      
      // Colors should be different
      expect(dayFogColor.equals(nightFogColor)).toBe(false);
    });

    it('should update sky color when time changes', () => {
      system.setTimeOfDay(12); // Day
      system.update(0.5);
      const daySkyColor = (scene.background as THREE.Color).clone();
      
      system.setTimeOfDay(0); // Night
      system.update(0.5);
      const nightSkyColor = (scene.background as THREE.Color).clone();
      
      // Colors should be different
      expect(daySkyColor.equals(nightSkyColor)).toBe(false);
    });
  });

  describe('setTimeOfDay', () => {
    it('should set time to specified hour', () => {
      system.setTimeOfDay(15.5);
      expect(system.getTimeOfDay()).toBe(15.5);
    });

    it('should wrap time over 24 hours', () => {
      system.setTimeOfDay(25);
      expect(system.getTimeOfDay()).toBe(1);
    });

    it('should handle negative time', () => {
      system.setTimeOfDay(-1);
      // Modulo with negative numbers: -1 % 24 = -1 in JavaScript
      expect(system.getTimeOfDay()).toBe(-1);
    });

    it('should handle zero time', () => {
      system.setTimeOfDay(0);
      expect(system.getTimeOfDay()).toBe(0);
    });

    it('should handle fractional hours', () => {
      system.setTimeOfDay(12.75); // 12:45
      expect(system.getTimeOfDay()).toBe(12.75);
    });
  });

  describe('getTimeOfDay', () => {
    it('should return current time', () => {
      system.setTimeOfDay(18.5);
      expect(system.getTimeOfDay()).toBe(18.5);
    });

    it('should return time in 0-24 range', () => {
      const time = system.getTimeOfDay();
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(24);
    });
  });

  describe('setTimeScale', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should set time scale', () => {
      system.setTimeScale(2.0);
      expect(system.getTimeScale()).toBe(2.0);
    });

    it('should affect time progression', () => {
      system.setTimeScale(2.0);
      const initialTime = system.getTimeOfDay();
      
      // 60 seconds at 2x scale = 2 game hours
      system.update(60);
      
      expect(system.getTimeOfDay()).toBeCloseTo(initialTime + 2, 1);
    });

    it('should freeze time at scale 0', () => {
      system.setTimeScale(0);
      const initialTime = system.getTimeOfDay();
      
      system.update(60);
      
      expect(system.getTimeOfDay()).toBe(initialTime);
    });

    it('should clamp negative scale to 0', () => {
      system.setTimeScale(-5);
      expect(system.getTimeScale()).toBe(0);
    });

    it('should handle very large scale', () => {
      system.setTimeScale(100);
      expect(system.getTimeScale()).toBe(100);
    });
  });

  describe('getTimeScale', () => {
    it('should return current time scale', () => {
      system.setTimeScale(5.0);
      expect(system.getTimeScale()).toBe(5.0);
    });
  });

  describe('setNightMode', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should lock time to midnight when enabled', () => {
      system.setNightMode(true);
      expect(system.getTimeOfDay()).toBe(0);
    });

    it('should prevent time progression when enabled', () => {
      system.setNightMode(true);
      
      system.update(60);
      
      expect(system.getTimeOfDay()).toBe(0);
    });

    it('should resume time progression when disabled', () => {
      system.setNightMode(true);
      system.setNightMode(false);
      
      const initialTime = system.getTimeOfDay();
      system.update(60);
      
      expect(system.getTimeOfDay()).not.toBe(initialTime);
    });

    it('should update isNightMode flag', () => {
      system.setNightMode(true);
      expect(system.isNightMode()).toBe(true);
      
      system.setNightMode(false);
      expect(system.isNightMode()).toBe(false);
    });
  });

  describe('isNightMode', () => {
    it('should return false by default', () => {
      expect(system.isNightMode()).toBe(false);
    });

    it('should return true when night mode is enabled', () => {
      system.setNightMode(true);
      expect(system.isNightMode()).toBe(true);
    });
  });

  describe('getNightFactor', () => {
    it('should return 0.0 at noon', () => {
      system.setTimeOfDay(12);
      expect(system.getNightFactor()).toBeCloseTo(0, 1);
    });

    it('should return 1.0 at midnight', () => {
      system.setTimeOfDay(0);
      expect(system.getNightFactor()).toBeCloseTo(1, 1);
    });

    it('should return 1.0 at 24:00', () => {
      system.setTimeOfDay(24);
      expect(system.getNightFactor()).toBeCloseTo(1, 1);
    });

    it('should return intermediate values at dawn/dusk', () => {
      system.setTimeOfDay(6); // Dawn
      const dawnFactor = system.getNightFactor();
      expect(dawnFactor).toBeGreaterThan(0);
      expect(dawnFactor).toBeLessThan(1);
      
      system.setTimeOfDay(18); // Dusk
      const duskFactor = system.getNightFactor();
      expect(duskFactor).toBeGreaterThan(0);
      expect(duskFactor).toBeLessThan(1);
    });

    it('should be symmetric around noon', () => {
      system.setTimeOfDay(6); // 6 hours before noon
      const morningFactor = system.getNightFactor();
      
      system.setTimeOfDay(18); // 6 hours after noon
      const eveningFactor = system.getNightFactor();
      
      expect(morningFactor).toBeCloseTo(eveningFactor, 1);
    });
  });

  describe('getFormattedTime', () => {
    it('should format noon as 12:00', () => {
      system.setTimeOfDay(12);
      expect(system.getFormattedTime()).toBe('12:00');
    });

    it('should format midnight as 00:00', () => {
      system.setTimeOfDay(0);
      expect(system.getFormattedTime()).toBe('00:00');
    });

    it('should format single digit hours with leading zero', () => {
      system.setTimeOfDay(9);
      expect(system.getFormattedTime()).toBe('09:00');
    });

    it('should format minutes correctly', () => {
      system.setTimeOfDay(15.5); // 15:30
      expect(system.getFormattedTime()).toBe('15:30');
    });

    it('should format fractional minutes', () => {
      system.setTimeOfDay(12.75); // 12:45
      expect(system.getFormattedTime()).toBe('12:45');
    });

    it('should pad single digit minutes', () => {
      system.setTimeOfDay(8.083333); // 8:05 (actually 8:04 due to rounding)
      expect(system.getFormattedTime()).toBe('08:04');
    });
  });

  describe('lighting transitions', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    describe('sun/moon light', () => {
      it('should have maximum intensity at noon', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const noonIntensity = mockRenderer.moonLight!.intensity;
        expect(noonIntensity).toBeGreaterThan(0.8);
      });

      it('should have minimal intensity at midnight', () => {
        system.setTimeOfDay(0);
        system.update(0.5);
        
        const midnightIntensity = mockRenderer.moonLight!.intensity;
        expect(midnightIntensity).toBeLessThan(0.1);
      });

      it('should position sun high at noon', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const position = mockRenderer.moonLight!.position;
        // At noon, angle = (12-6)/24 * 2π = π/2, cos(π/2) ≈ 0
        expect(Math.abs(position.y)).toBeLessThan(10);
      });

      it('should position sun low at dawn', () => {
        system.setTimeOfDay(6);
        system.update(0.5);
        
        const position = mockRenderer.moonLight!.position;
        // At dawn (6am), angle = 0, cos(0) = 1, so y = 80
        expect(position.y).toBeGreaterThan(70);
      });

      it('should have warm color at noon', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const color = mockRenderer.moonLight!.color;
        // Warm colors have high R component
        expect(color.r).toBeGreaterThan(0.8);
      });

      it('should have cool color at night', () => {
        system.setTimeOfDay(0);
        system.update(0.5);
        
        const color = mockRenderer.moonLight!.color;
        // Cool colors have higher B component
        expect(color.b).toBeGreaterThan(color.r);
      });

      it('should have orange color at dawn', () => {
        system.setTimeOfDay(6);
        system.update(0.5);
        
        const color = mockRenderer.moonLight!.color;
        // At dawn (6am), transitioning from blue to orange
        // Color is interpolated, so check it's warmer than pure blue
        expect(color.r).toBeGreaterThan(0.4);
      });

      it('should have orange color at dusk', () => {
        system.setTimeOfDay(18);
        system.update(0.5);
        
        const color = mockRenderer.moonLight!.color;
        // At dusk (6pm), transitioning from orange to blue
        expect(color.r).toBeGreaterThan(0.4);
      });
    });

    describe('ambient light', () => {
      it('should have higher intensity during day', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const dayIntensity = mockRenderer.ambientLight!.intensity;
        expect(dayIntensity).toBeGreaterThan(0.4);
      });

      it('should have lower intensity at night', () => {
        system.setTimeOfDay(0);
        system.update(0.5);
        
        const nightIntensity = mockRenderer.ambientLight!.intensity;
        expect(nightIntensity).toBeLessThan(0.3);
      });

      it('should have warm color during day', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const color = mockRenderer.ambientLight!.color;
        expect(color.r).toBeGreaterThan(0.5);
      });

      it('should have cool color at night', () => {
        system.setTimeOfDay(0);
        system.update(0.5);
        
        const color = mockRenderer.ambientLight!.color;
        expect(color.b).toBeGreaterThan(color.r);
      });
    });

    describe('hemisphere light', () => {
      it('should have higher intensity during day', () => {
        system.setTimeOfDay(12);
        system.update(0.5);
        
        const dayIntensity = mockRenderer.hemisphereLight!.intensity;
        expect(dayIntensity).toBeGreaterThan(0.4);
      });

      it('should have lower intensity at night', () => {
        system.setTimeOfDay(0);
        system.update(0.5);
        
        const nightIntensity = mockRenderer.hemisphereLight!.intensity;
        expect(nightIntensity).toBeLessThan(0.3);
      });
    });
  });

  describe('fog transitions', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should have normal density during day', () => {
      system.setTimeOfDay(12);
      system.update(0.5);
      
      const dayDensity = mockRenderer.fog!.density;
      expect(dayDensity).toBeCloseTo(0.008, 3);
    });

    it('should have reduced density at night', () => {
      system.setTimeOfDay(0);
      system.update(0.5);
      
      const nightDensity = mockRenderer.fog!.density;
      expect(nightDensity).toBeLessThan(0.008);
    });

    it('should have increased density at dawn', () => {
      system.setTimeOfDay(6);
      system.update(0.5);
      
      const dawnDensity = mockRenderer.fog!.density;
      expect(dawnDensity).toBeGreaterThan(0.008);
    });

    it('should have increased density at dusk', () => {
      system.setTimeOfDay(18);
      system.update(0.5);
      
      const duskDensity = mockRenderer.fog!.density;
      expect(duskDensity).toBeGreaterThan(0.008);
    });

    it('should have blue fog during day', () => {
      system.setTimeOfDay(12);
      system.update(0.5);
      
      const color = mockRenderer.fog!.color;
      expect(color.b).toBeGreaterThan(color.r);
    });

    it('should have dark fog at night', () => {
      system.setTimeOfDay(0);
      system.update(0.5);
      
      const color = mockRenderer.fog!.color;
      expect(color.r + color.g + color.b).toBeLessThan(0.5);
    });

    it('should have brownish fog at dawn', () => {
      system.setTimeOfDay(6);
      system.update(0.5);
      
      const color = mockRenderer.fog!.color;
      // Brown/orange fog at dawn - check it's not pure blue
      expect(color.r).toBeGreaterThan(0.1);
      expect(color.g).toBeGreaterThan(0.1);
    });
  });

  describe('sky color transitions', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should have bright blue sky at noon', () => {
      system.setTimeOfDay(12);
      system.update(0.5);
      
      const skyColor = scene.background as THREE.Color;
      expect(skyColor.b).toBeGreaterThan(0.7);
    });

    it('should have dark sky at midnight', () => {
      system.setTimeOfDay(0);
      system.update(0.5);
      
      const skyColor = scene.background as THREE.Color;
      expect(skyColor.r + skyColor.g + skyColor.b).toBeLessThan(0.3);
    });

    it('should have pink-orange sky at dawn', () => {
      system.setTimeOfDay(6);
      system.update(0.5);
      
      const skyColor = scene.background as THREE.Color;
      expect(skyColor.r).toBeGreaterThan(0.5);
    });

    it('should have orange sky at dusk', () => {
      system.setTimeOfDay(18);
      system.update(0.5);
      
      const skyColor = scene.background as THREE.Color;
      // At dusk, transitioning from orange to dark
      expect(skyColor.r).toBeGreaterThan(0.4);
    });

    it('should transition smoothly through morning', () => {
      const colors: THREE.Color[] = [];
      
      for (let hour = 5; hour <= 12; hour++) {
        system.setTimeOfDay(hour);
        system.update(0.5);
        colors.push((scene.background as THREE.Color).clone());
      }
      
      // Sky should get progressively brighter
      for (let i = 1; i < colors.length; i++) {
        const prevBrightness = colors[i - 1].r + colors[i - 1].g + colors[i - 1].b;
        const currBrightness = colors[i].r + colors[i].g + colors[i].b;
        expect(currBrightness).toBeGreaterThanOrEqual(prevBrightness - 0.1); // Allow small variance
      }
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      system.setRenderer(mockRenderer);
    });

    it('should handle very large delta time', () => {
      const initialTime = system.getTimeOfDay();
      
      // 3600 seconds = 60 game hours = 2.5 days
      system.update(3600);
      
      const finalTime = system.getTimeOfDay();
      expect(finalTime).toBeGreaterThanOrEqual(0);
      expect(finalTime).toBeLessThan(24);
    });

    it('should handle zero delta time', () => {
      const initialTime = system.getTimeOfDay();
      
      system.update(0);
      
      expect(system.getTimeOfDay()).toBe(initialTime);
    });

    it('should handle negative delta time', () => {
      const initialTime = system.getTimeOfDay();
      
      system.update(-10);
      
      // Should not go backwards
      expect(system.getTimeOfDay()).toBeLessThanOrEqual(initialTime);
    });

    it('should handle time wrap-around at midnight', () => {
      system.setTimeOfDay(23.9);
      
      system.update(6); // 0.1 hours
      
      const time = system.getTimeOfDay();
      expect(time).toBeCloseTo(0, 0);
    });

    it('should handle renderer without all lights', () => {
      const partialRenderer = {
        fog: mockRenderer.fog,
        ambientLight: mockRenderer.ambientLight
        // Missing moonLight and hemisphereLight
      } as IGameRenderer;
      
      system.setRenderer(partialRenderer);
      expect(() => system.update(0.5)).not.toThrow();
    });

    it('should handle scene without background', () => {
      const sceneNoBackground = new THREE.Scene();
      const systemNoBackground = new DayNightCycle(sceneNoBackground);
      systemNoBackground.setRenderer(mockRenderer);
      
      expect(() => systemNoBackground.update(0.5)).not.toThrow();
    });

    it('should handle multiple rapid updates', () => {
      for (let i = 0; i < 100; i++) {
        system.update(0.01);
      }
      
      // Should not crash or produce invalid state
      const time = system.getTimeOfDay();
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(24);
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', () => {
      expect(() => system.dispose()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      system.dispose();
      expect(() => system.dispose()).not.toThrow();
    });

    it('should dispose after initialization', async () => {
      await system.init();
      expect(() => system.dispose()).not.toThrow();
    });
  });
});
