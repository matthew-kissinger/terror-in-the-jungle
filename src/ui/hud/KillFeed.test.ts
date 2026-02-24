/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { KillFeed } from "./KillFeed";
import { Faction } from "../../systems/combat/types";

vi.mock("../../utils/Logger");

describe("KillFeed", () => {
  let killFeed: KillFeed;
  let mockParent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    killFeed = new KillFeed();
    mockParent = document.createElement("div");
    document.body.appendChild(mockParent);
  });

  afterEach(() => {
    killFeed.dispose();
    document.body.removeChild(mockParent);
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create a kill feed instance", () => {
      expect(killFeed).toBeDefined();
    });

    it("should initialize with empty entries", () => {
      killFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(0);
    });
  });

  describe("addKill()", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should add a kill entry", () => {
      killFeed.addKill("Player1", Faction.US, "Player2", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should create entry with correct killer name", () => {
      killFeed.addKill("Killer", Faction.US, "Victim", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0];
      expect(entry?.textContent).toContain("Killer");
    });

    it("should create entry with correct victim name", () => {
      killFeed.addKill("Killer", Faction.US, "Victim", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0];
      expect(entry?.textContent).toContain("Victim");
    });

    it("should create entry with unique ID", () => {
      killFeed.addKill("P1", Faction.US, "P2", Faction.NVA);
      vi.advanceTimersByTime(10);
      killFeed.addKill("P3", Faction.US, "P4", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      const id1 = container?.children[0].getAttribute("data-entry-id");
      const id2 = container?.children[1].getAttribute("data-entry-id");
      
      expect(id1).not.toBe(id2);
    });

    it("should add multiple kills in order", () => {
      killFeed.addKill("P1", Faction.US, "P2", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("P3", Faction.US, "P4", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("P5", Faction.US, "P6", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(3);
    });

    it("should show headshot indicator when isHeadshot is true", () => {
      killFeed.addKill("Killer", Faction.US, "Victim", Faction.NVA, true);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0];
      expect(entry?.textContent).toContain("HS");
    });

    it("should not show headshot indicator when isHeadshot is false", () => {
      killFeed.addKill("Killer", Faction.US, "Victim", Faction.NVA, false);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0];
      expect(entry?.textContent).not.toContain("HS");
    });

    it("should display rifle weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "rifle");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[AR]");
    });

    it("should display shotgun weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "shotgun");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[SG]");
    });

    it("should display smg weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "smg");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[SM]");
    });

    it("should display grenade weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "grenade");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[GR]");
    });

    it("should display mortar weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "mortar");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[MT]");
    });

    it("should display melee weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "melee");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("[ML]");
    });

    it("should display unknown weapon icon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, false, "unknown");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("--");
    });
  });

  describe("MAX_ENTRIES overflow", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should cap entries at 6", () => {
      for (let i = 0; i < 10; i++) {
        killFeed.addKill(`P${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(6);
    });

    it("should remove oldest entry when exceeding MAX_ENTRIES", () => {
      for (let i = 0; i < 7; i++) {
        killFeed.addKill(`Killer${i}`, Faction.US, `Victim${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).not.toContain("Killer0");
      expect(container?.textContent).toContain("Killer6");
    });

    it("should clean up DOM element for removed oldest entry", () => {
      for (let i = 0; i < 7; i++) {
        killFeed.addKill(`P${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }
      
      const container = mockParent.querySelector(".kill-feed");
      const entries = Array.from(container?.children || []);
      expect(entries.length).toBe(6);
      expect(entries[0].textContent).toContain("P1");
    });

    it("should maintain correct order after overflow", () => {
      for (let i = 0; i < 8; i++) {
        killFeed.addKill(`K${i}`, Faction.US, `V${i}`, Faction.NVA);
        vi.advanceTimersByTime(10);
      }
      
      const container = mockParent.querySelector(".kill-feed");
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain("K2");
      expect(entries[5].textContent).toContain("K7");
    });
  });

  describe("update() - fading", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should maintain full opacity before FADE_START (3000ms)", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const initialOpacity = entry?.style.opacity || "1";
      
      vi.advanceTimersByTime(2999);
      killFeed.update(0);
      
      const updatedOpacity = entry?.style.opacity || "1";
      expect(updatedOpacity).toBe("1");
    });

    it("should start fading after FADE_START (3000ms)", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      vi.advanceTimersByTime(3500);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || "1");
      expect(opacity).toBeLessThan(1);
      expect(opacity).toBeGreaterThan(0);
    });

    it("should calculate correct opacity at 4000ms (halfway through fade)", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      vi.advanceTimersByTime(4000);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || "1");
      // At 4000ms: (4000-3000)/(5000-3000) = 1000/2000 = 0.5 fade progress
      // opacity = 1 - 0.5 = 0.5
      expect(opacity).toBeCloseTo(0.5, 1);
    });

    it("should reach near-zero opacity at 4999ms", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      vi.advanceTimersByTime(4999);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const opacity = parseFloat(entry?.style.opacity || "1");
      expect(opacity).toBeLessThan(0.01);
    });

    it("should fade multiple entries independently", () => {
      killFeed.addKill("K1", Faction.US, "V1", Faction.NVA);
      vi.advanceTimersByTime(1000);
      killFeed.addKill("K2", Faction.US, "V2", Faction.NVA);
      
      vi.advanceTimersByTime(2500); // K1 at 3500ms, K2 at 2500ms
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      const entry1 = container?.children[0] as HTMLElement;
      const entry2 = container?.children[1] as HTMLElement;
      
      const opacity1 = parseFloat(entry1?.style.opacity || "1");
      const opacity2 = parseFloat(entry2?.style.opacity || "1");
      
      expect(opacity1).toBeLessThan(1);
      expect(opacity2).toBe(1);
    });
  });

  describe("update() - expiration", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should remove entry after ENTRY_LIFETIME (5000ms)", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      vi.advanceTimersByTime(5000);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(0);
    });

    it("should keep entry just before ENTRY_LIFETIME", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      
      vi.advanceTimersByTime(4999);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should clean up DOM element for expired entry", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const initialId = container?.children[0].getAttribute("data-entry-id");
      
      vi.advanceTimersByTime(5000);
      killFeed.update(0);
      
      const expiredElement = mockParent.querySelector(`[data-entry-id="${initialId}"]`);
      expect(expiredElement).toBeNull();
    });

    it("should remove multiple expired entries", () => {
      killFeed.addKill("K1", Faction.US, "V1", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("K2", Faction.US, "V2", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("K3", Faction.US, "V3", Faction.NVA);
      
      vi.advanceTimersByTime(5000);
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(0);
    });

    it("should keep newer entries when older ones expire", () => {
      killFeed.addKill("Old", Faction.US, "V1", Faction.NVA);
      vi.advanceTimersByTime(3000);
      killFeed.addKill("New", Faction.US, "V2", Faction.NVA);
      
      vi.advanceTimersByTime(2500); // Old at 5500ms, New at 2500ms
      killFeed.update(0);
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
      expect(container?.textContent).toContain("New");
      expect(container?.textContent).not.toContain("Old");
    });
  });

  describe("render() - DOM management", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should create DOM elements for new entries", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should maintain entry order (oldest first, newest last)", () => {
      killFeed.addKill("First", Faction.US, "V1", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("Second", Faction.US, "V2", Faction.NVA);
      vi.advanceTimersByTime(100);
      killFeed.addKill("Third", Faction.US, "V3", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain("First");
      expect(entries[1].textContent).toContain("Second");
      expect(entries[2].textContent).toContain("Third");
    });

    it("should update existing elements instead of recreating", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const originalElement = container?.children[0];
      
      vi.advanceTimersByTime(3500);
      killFeed.update(0);
      
      const updatedElement = container?.children[0];
      expect(updatedElement).toBe(originalElement);
    });
  });

  describe("faction coloring", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should color US faction names blue", () => {
      killFeed.addKill("USPlayer", Faction.US, "Enemy", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const killerSpan = entry?.querySelector("span:first-child") as HTMLElement;
      expect(killerSpan?.style.color).toContain("rgb(91, 140, 201)");
    });

    it("should color OPFOR faction names red", () => {
      killFeed.addKill("Player", Faction.US, "OPFOREnemy", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      const entry = container?.children[0] as HTMLElement;
      const victimSpan = entry?.querySelector("span:last-child") as HTMLElement;
      expect(victimSpan?.style.color).toContain("rgb(201, 86, 74)");
    });
  });

  describe("attachToDOM()", () => {
    it("should attach container to parent element", () => {
      killFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector(".kill-feed");
      expect(container).not.toBeNull();
    });

    it("should inject CSS styles", () => {
      killFeed.attachToDOM(mockParent);
      const styleElement = document.getElementById("kill-feed-styles");
      expect(styleElement).not.toBeNull();
    });

    it("should not duplicate styles on multiple attachments", () => {
      killFeed.attachToDOM(mockParent);
      killFeed.attachToDOM(mockParent);
      const styleElements = document.querySelectorAll("#kill-feed-styles");
      expect(styleElements.length).toBe(1);
    });
  });

  describe("dispose()", () => {
    it("should remove container from DOM", () => {
      killFeed.attachToDOM(mockParent);
      killFeed.dispose();
      const container = mockParent.querySelector(".kill-feed");
      expect(container).toBeNull();
    });

    it("should remove injected styles", () => {
      killFeed.attachToDOM(mockParent);
      killFeed.dispose();
      const styleElement = document.getElementById("kill-feed-styles");
      expect(styleElement).toBeNull();
    });

    it("should clear entries", () => {
      killFeed.attachToDOM(mockParent);
      killFeed.addKill("K", Faction.US, "V", Faction.NVA);
      killFeed.dispose();
      
      // Create new instance and attach to verify cleanup
      const newKillFeed = new KillFeed();
      newKillFeed.attachToDOM(mockParent);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(0);
      newKillFeed.dispose();
    });
  });

  describe("rapid kills", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should handle multiple rapid kills", () => {
      for (let i = 0; i < 5; i++) {
        killFeed.addKill(`K${i}`, Faction.US, `V${i}`, Faction.NVA);
      }
      
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(5);
    });

    it("should maintain correct order for rapid kills", () => {
      killFeed.addKill("First", Faction.US, "V1", Faction.NVA);
      killFeed.addKill("Second", Faction.US, "V2", Faction.NVA);
      killFeed.addKill("Third", Faction.US, "V3", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      const entries = Array.from(container?.children || []);
      expect(entries[0].textContent).toContain("First");
      expect(entries[1].textContent).toContain("Second");
      expect(entries[2].textContent).toContain("Third");
    });

    it("should generate unique IDs for simultaneous kills", () => {
      killFeed.addKill("K1", Faction.US, "V1", Faction.NVA);
      killFeed.addKill("K2", Faction.US, "V2", Faction.NVA);
      killFeed.addKill("K3", Faction.US, "V3", Faction.NVA);
      
      const container = mockParent.querySelector(".kill-feed");
      const ids = Array.from(container?.children || []).map(
        (child) => child.getAttribute("data-entry-id")
      );
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      killFeed.attachToDOM(mockParent);
    });

    it("should handle empty killer name", () => {
      killFeed.addKill("", Faction.US, "Victim", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should handle empty victim name", () => {
      killFeed.addKill("Killer", Faction.US, "", Faction.NVA);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should handle same faction kills", () => {
      killFeed.addKill("Friendly1", Faction.US, "Friendly2", Faction.US);
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.children.length).toBe(1);
    });

    it("should handle headshot with explosive weapon", () => {
      killFeed.addKill("K", Faction.US, "V", Faction.NVA, true, "grenade");
      const container = mockParent.querySelector(".kill-feed");
      expect(container?.textContent).toContain("HS");
      expect(container?.textContent).toContain("[GR]");
    });
  });
});
