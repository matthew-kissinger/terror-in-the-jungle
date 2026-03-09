/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KillFeed } from './KillFeed';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger');

describe('KillFeed', () => {
  let killFeed: KillFeed;
  let mockParent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    killFeed = new KillFeed();
    mockParent = document.createElement('div');
    document.body.appendChild(mockParent);
  });

  afterEach(() => {
    killFeed.dispose();
    document.body.removeChild(mockParent);
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a kill feed instance', () => {
      expect(killFeed).toBeDefined();
    });

    it('should initialize with empty entries', () => {
      killFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(0);
    });
  });

  describe('addKill()', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should add a kill entry', () => {
      killFeed.addKill('Player1', Faction.US, 'Player2', Faction.NVA);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should create entry with correct killer name', () => {
      killFeed.addKill('Killer', Faction.US, 'Victim', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0];
      expect(entry?.textContent).toContain('Killer');
    });

    it('should create entry with correct victim name', () => {
      killFeed.addKill('Killer', Faction.US, 'Victim', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0];
      expect(entry?.textContent).toContain('Victim');
    });

    it('should create entry with unique ID', () => {
      killFeed.addKill('P1', Faction.US, 'P2', Faction.NVA);
      vi.advanceTimersByTime(10);
      killFeed.addKill('P3', Faction.US, 'P4', Faction.NVA);

      const container = mockParent.querySelector('.container');
      const id1 = container?.children[0].getAttribute('data-entry-id');
      const id2 = container?.children[1].getAttribute('data-entry-id');

      expect(id1).not.toBe(id2);
    });

    it('should add multiple kills in order', () => {
      killFeed.addKill('P1', Faction.US, 'P2', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('P3', Faction.US, 'P4', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('P5', Faction.US, 'P6', Faction.NVA);

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(3);
    });

    it('should show headshot indicator when isHeadshot is true', () => {
      killFeed.addKill('Killer', Faction.US, 'Victim', Faction.NVA, true);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0];
      const hsImg = entry?.querySelector('.headshotTag img') as HTMLImageElement | null;
      expect(hsImg).not.toBeNull();
      expect(hsImg?.alt).toBe('Headshot');
    });

    it('should not show headshot indicator when isHeadshot is false', () => {
      killFeed.addKill('Killer', Faction.US, 'Victim', Faction.NVA, false);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0];
      expect(entry?.querySelector('.headshotTag')).toBeNull();
    });

    it('should display rifle weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img?.src).toContain('icon-rifle.png');
    });

    it('should display shotgun weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'shotgun');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-shotgun.png');
    });

    it('should display smg weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'smg');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-smg.png');
    });

    it('should display pistol weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'pistol');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-pistol.png');
    });

    it('should display lmg weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'lmg');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-lmg.png');
    });

    it('should display launcher weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'launcher');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-launcher.png');
    });

    it('should display grenade weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'grenade');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-grenade.png');
    });

    it('should display mortar weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'mortar');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-mortar.png');
    });

    it('should display melee weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'melee');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-melee.png');
    });

    it('should display helicopter minigun weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'helicopter_minigun');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-minigun.png');
    });

    it('should display helicopter rocket weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'helicopter_rocket');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-rocket-pod.png');
    });

    it('should display helicopter doorgun weapon icon as img', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'helicopter_doorgun');
      const container = mockParent.querySelector('.container');
      const img = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(img?.src).toContain('icon-door-gun.png');
    });

    it('should display unknown weapon icon as text fallback', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'unknown');
      const container = mockParent.querySelector('.container');
      expect(container?.textContent).toContain('--');
    });
  });

  describe('MAX_ENTRIES overflow', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should cap entries at 6', () => {
      for (let i = 0; i < 10; i++) {
        killFeed.addKill(`P${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(6);
    });

    it('should remove oldest entry when exceeding MAX_ENTRIES', () => {
      for (let i = 0; i < 7; i++) {
        killFeed.addKill(`Killer${i}`, Faction.US, `Victim${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }

      const container = mockParent.querySelector('.container');
      expect(container?.textContent).not.toContain('Killer0');
      expect(container?.textContent).toContain('Killer6');
    });

    it('should clean up DOM element for removed oldest entry', () => {
      for (let i = 0; i < 7; i++) {
        killFeed.addKill(`P${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }

      const container = mockParent.querySelector('.container');
      const entries = Array.from(container?.children || []);
      expect(entries.length).toBe(6);
      expect(entries[0].textContent).toContain('P1');
    });

    it('should maintain correct order after overflow', () => {
      for (let i = 0; i < 8; i++) {
        killFeed.addKill(`K${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }

      const container = mockParent.querySelector('.container');
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain('K2');
      expect(entries[5].textContent).toContain('K7');
    });
  });

  describe('update() - fading', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should maintain full opacity before FADE_START (3000ms)', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;

      vi.advanceTimersByTime(2999);
      killFeed.update(0);

      const updatedOpacity = entry?.style.opacity || '1';
      expect(updatedOpacity).toBe('1');
    });

    it('should start fading after FADE_START (3000ms)', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(3500);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || '1');
      expect(opacity).toBeLessThan(1);
      expect(opacity).toBeGreaterThan(0);
    });

    it('should calculate correct opacity at 4000ms (halfway through fade)', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(4000);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || '1');
      expect(opacity).toBeCloseTo(0.5, 1);
    });

    it('should reach near-zero opacity at 4999ms', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(4999);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || '1');
      expect(opacity).toBeLessThan(0.01);
    });

    it('should fade multiple entries independently', () => {
      killFeed.addKill('K1', Faction.US, 'V1', Faction.NVA);
      vi.advanceTimersByTime(1000);
      killFeed.addKill('K2', Faction.US, 'V2', Faction.NVA);

      vi.advanceTimersByTime(2500);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry1 = container?.children[0] as HTMLElement;
      const entry2 = container?.children[1] as HTMLElement;

      const opacity1 = parseFloat(entry1?.style.opacity || '1');
      const opacity2 = parseFloat(entry2?.style.opacity || '1');

      expect(opacity1).toBeLessThan(1);
      expect(opacity2).toBe(1);
    });
  });

  describe('update() - expiration', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should remove entry after ENTRY_LIFETIME (5000ms)', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(5000);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      if (entry) {
        expect(entry.classList.contains('entrySlideOut')).toBe(true);
      }
      vi.advanceTimersByTime(300);
      expect(container?.children.length).toBe(0);
    });

    it('should keep entry just before ENTRY_LIFETIME', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(4999);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should clean up DOM element for expired entry', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const initialId = container?.children[0].getAttribute('data-entry-id');

      vi.advanceTimersByTime(5000);
      killFeed.update(0);
      vi.advanceTimersByTime(300);

      const expiredElement = mockParent.querySelector(
        `[data-entry-id="${initialId}"]`
      );
      expect(expiredElement).toBeNull();
    });

    it('should remove multiple expired entries', () => {
      killFeed.addKill('K1', Faction.US, 'V1', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('K2', Faction.US, 'V2', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('K3', Faction.US, 'V3', Faction.NVA);

      vi.advanceTimersByTime(5000);
      killFeed.update(0);
      vi.advanceTimersByTime(300);

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(0);
    });

    it('should keep newer entries when older ones expire', () => {
      killFeed.addKill('Old', Faction.US, 'V1', Faction.NVA);
      vi.advanceTimersByTime(3000);
      killFeed.addKill('New', Faction.US, 'V2', Faction.NVA);

      vi.advanceTimersByTime(2500);
      killFeed.update(0);
      vi.advanceTimersByTime(300);

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
      expect(container?.textContent).toContain('New');
      expect(container?.textContent).not.toContain('Old');
    });
  });

  describe('render() - DOM management', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should create DOM elements for new entries', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should maintain entry order (oldest first, newest last)', () => {
      killFeed.addKill('First', Faction.US, 'V1', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('Second', Faction.US, 'V2', Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill('Third', Faction.US, 'V3', Faction.NVA);

      const container = mockParent.querySelector('.container');
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain('First');
      expect(entries[1].textContent).toContain('Second');
      expect(entries[2].textContent).toContain('Third');
    });

    it('should update existing elements instead of recreating', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const originalElement = container?.children[0];

      vi.advanceTimersByTime(3500);
      killFeed.update(0);

      const updatedElement = container?.children[0];
      expect(updatedElement).toBe(originalElement);
    });
  });

  describe('faction coloring', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should color US faction names blue', () => {
      killFeed.addKill('USPlayer', Faction.US, 'Enemy', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const killerSpan = entry?.querySelector('.killerName') as HTMLElement;
      expect(killerSpan?.style.color).toContain('rgb(91, 140, 201)');
    });

    it('should color OPFOR faction names red', () => {
      killFeed.addKill('Player', Faction.US, 'OPFOREnemy', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const victimSpan = entry?.querySelector('.victimName') as HTMLElement;
      expect(victimSpan?.style.color).toContain('rgb(201, 86, 74)');
    });
  });

  describe('attachToDOM()', () => {
    it('should attach container to parent element', () => {
      killFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector('.container');
      expect(container).not.toBeNull();
    });
  });

  describe('dispose()', () => {
    it('should remove container from DOM', () => {
      killFeed.attachToDOM(mockParent);
      killFeed.dispose();
      const container = mockParent.querySelector('.container');
      expect(container).toBeNull();
    });

    it('should clear entries', () => {
      killFeed.attachToDOM(mockParent);
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
      killFeed.dispose();

      const newKillFeed = new KillFeed();
      newKillFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(0);
      newKillFeed.dispose();
    });
  });

  describe('rapid kills', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should handle multiple rapid kills', () => {
      for (let i = 0; i < 5; i++) {
        killFeed.addKill(`K${i}`, Faction.US, `V${i}`, Faction.NVA);
      }

      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(5);
    });

    it('should maintain correct order for rapid kills', () => {
      killFeed.addKill('First', Faction.US, 'V1', Faction.NVA);
      killFeed.addKill('Second', Faction.US, 'V2', Faction.NVA);
      killFeed.addKill('Third', Faction.US, 'V3', Faction.NVA);

      const container = mockParent.querySelector('.container');
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain('First');
      expect(entries[1].textContent).toContain('Second');
      expect(entries[2].textContent).toContain('Third');
    });

    it('should generate unique IDs for simultaneous kills', () => {
      killFeed.addKill('K1', Faction.US, 'V1', Faction.NVA);
      killFeed.addKill('K2', Faction.US, 'V2', Faction.NVA);
      killFeed.addKill('K3', Faction.US, 'V3', Faction.NVA);

      const container = mockParent.querySelector('.container');
      const ids = Array.from(container?.children || []).map((child) =>
        child.getAttribute('data-entry-id')
      );

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('visual classes', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should apply entry class to all entries', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entry')).toBe(true);
    });

    it('should apply explosive class for grenade kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'grenade');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryExplosive')).toBe(true);
    });

    it('should apply explosive class for mortar kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'mortar');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryExplosive')).toBe(true);
    });

    it('should apply explosive class for launcher kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'launcher');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryExplosive')).toBe(true);
    });

    it('should apply explosive class for helicopter_rocket kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'helicopter_rocket');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryExplosive')).toBe(true);
    });

    it('should not apply explosive class for rifle kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryExplosive')).toBe(false);
    });

    it('should apply streak class for kill streak entries', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle', true);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryStreak')).toBe(true);
    });

    it('should not apply streak class for normal kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle', false);
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      expect(entry.classList.contains('entryStreak')).toBe(false);
    });

    it('should apply headshot accent class on weapon icon area', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, true, 'rifle');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const weaponSpan = entry.querySelector('.weaponIcon') as HTMLElement;
      expect(weaponSpan.classList.contains('weaponIconHeadshot')).toBe(true);
    });

    it('should not apply headshot accent class for non-headshot kills', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const weaponSpan = entry.querySelector('.weaponIcon') as HTMLElement;
      expect(weaponSpan.classList.contains('weaponIconHeadshot')).toBe(false);
    });

    it('should apply headshot tag class on HS indicator', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, true, 'rifle');
      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      const hsTag = entry.querySelector('.headshotTag') as HTMLElement;
      expect(hsTag).not.toBeNull();
      const hsImg = hsTag.querySelector('img') as HTMLImageElement;
      expect(hsImg.alt).toBe('Headshot');
    });

    it('should apply slide-out class on expired entries', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA);

      vi.advanceTimersByTime(5000);
      killFeed.update(0);

      const container = mockParent.querySelector('.container');
      const entry = container?.children[0] as HTMLElement;
      if (entry) {
        expect(entry.classList.contains('entrySlideOut')).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it('should handle empty killer name', () => {
      killFeed.addKill('', Faction.US, 'Victim', Faction.NVA);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should handle empty victim name', () => {
      killFeed.addKill('Killer', Faction.US, '', Faction.NVA);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should handle same faction kills', () => {
      killFeed.addKill('Friendly1', Faction.US, 'Friendly2', Faction.US);
      const container = mockParent.querySelector('.container');
      expect(container?.children.length).toBe(1);
    });

    it('should handle headshot with explosive weapon', () => {
      killFeed.addKill('K', Faction.US, 'V', Faction.NVA, true, 'grenade');
      const container = mockParent.querySelector('.container');
      const hsImg = container?.querySelector('.headshotTag img') as HTMLImageElement | null;
      expect(hsImg?.alt).toBe('Headshot');
      const weaponImg = container?.querySelector('.weaponIcon img') as HTMLImageElement | null;
      expect(weaponImg?.src).toContain('icon-grenade.png');
    });
  });
});
