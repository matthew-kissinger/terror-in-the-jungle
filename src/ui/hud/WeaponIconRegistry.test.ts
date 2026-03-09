/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { getWeaponIconElement, getWeaponIconData } from "../icons/IconRegistry";

describe("WeaponIconRegistry (IconRegistry)", () => {
  describe("getWeaponIconData()", () => {
    it("should return data for rifle", () => {
      const data = getWeaponIconData("rifle");
      expect(data.label).toBe("Rifle");
      expect(data.iconFile).toBe("icon-rifle");
    });

    it("should return data for shotgun", () => {
      expect(getWeaponIconData("shotgun").label).toBe("Shotgun");
    });

    it("should return data for smg", () => {
      expect(getWeaponIconData("smg").label).toBe("SMG");
    });

    it("should return data for pistol", () => {
      expect(getWeaponIconData("pistol").label).toBe("Pistol");
    });

    it("should return data for lmg", () => {
      expect(getWeaponIconData("lmg").label).toBe("LMG");
    });

    it("should return data for launcher", () => {
      expect(getWeaponIconData("launcher").label).toBe("Launcher");
    });

    it("should return data for grenade", () => {
      const data = getWeaponIconData("grenade");
      expect(data.label).toBe("Grenade");
      expect(data.iconFile).toBe("icon-grenade");
    });

    it("should return data for mortar", () => {
      const data = getWeaponIconData("mortar");
      expect(data.label).toBe("Mortar");
      expect(data.iconFile).toBe("icon-mortar");
    });

    it("should return data for melee", () => {
      expect(getWeaponIconData("melee").label).toBe("Melee");
    });

    it("should return data for helicopter_minigun", () => {
      expect(getWeaponIconData("helicopter_minigun").label).toBe("Minigun");
    });

    it("should return data for helicopter_rocket", () => {
      expect(getWeaponIconData("helicopter_rocket").label).toBe("Rocket");
    });

    it("should return data for helicopter_doorgun", () => {
      expect(getWeaponIconData("helicopter_doorgun").label).toBe("Door Gun");
    });

    it("should return unknown data for unrecognized types", () => {
      const data = getWeaponIconData("nonexistent_weapon");
      expect(data.label).toBe("--");
    });

    it("should return unknown data for empty string", () => {
      expect(getWeaponIconData("").label).toBe("--");
    });
  });

  describe("getWeaponIconElement()", () => {
    it("should return an img element for known weapons", () => {
      const element = getWeaponIconElement("rifle");
      expect(element.tagName).toBe("IMG");
      expect((element as HTMLImageElement).src).toContain("icon-rifle.png");
    });

    it("should set alt text to weapon type on img element", () => {
      const element = getWeaponIconElement("rifle") as HTMLImageElement;
      expect(element.alt).toBe("rifle");
    });

    it("should return different icon sources for different weapon types", () => {
      const rifle = getWeaponIconElement("rifle") as HTMLImageElement;
      const shotgun = getWeaponIconElement("shotgun") as HTMLImageElement;
      expect(rifle.src).not.toBe(shotgun.src);
    });

    it("should return fallback for unknown weapon type", () => {
      const element = getWeaponIconElement("unknown");
      expect(element.tagName).toBe("SPAN");
      expect(element.textContent).toBe("--");
    });

    it("should return unknown fallback for totally unrecognized type", () => {
      const element = getWeaponIconElement("banana");
      expect(element.textContent).toBe("--");
    });

    it("should return img for grenade with correct icon", () => {
      const element = getWeaponIconElement("grenade") as HTMLImageElement;
      expect(element.tagName).toBe("IMG");
      expect(element.src).toContain("icon-grenade.png");
    });

    it("should return img for helicopter_minigun with correct icon", () => {
      const element = getWeaponIconElement("helicopter_minigun") as HTMLImageElement;
      expect(element.tagName).toBe("IMG");
      expect(element.src).toContain("icon-minigun.png");
    });

    it("should return a new element each call (no shared references)", () => {
      const el1 = getWeaponIconElement("rifle");
      const el2 = getWeaponIconElement("rifle");
      expect(el1).not.toBe(el2);
    });
  });
});
