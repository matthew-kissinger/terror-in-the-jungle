/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { getWeaponIconElement, getWeaponIconData } from "./WeaponIconRegistry";

describe("WeaponIconRegistry", () => {
  describe("getWeaponIconData()", () => {
    it("should return data for rifle", () => {
      const data = getWeaponIconData("rifle");
      expect(data.textFallback).toBe("[AR]");
      expect(data.svgPath).toBeNull();
    });

    it("should return data for shotgun", () => {
      expect(getWeaponIconData("shotgun").textFallback).toBe("[SG]");
    });

    it("should return data for smg", () => {
      expect(getWeaponIconData("smg").textFallback).toBe("[SM]");
    });

    it("should return data for pistol", () => {
      expect(getWeaponIconData("pistol").textFallback).toBe("[PI]");
    });

    it("should return data for lmg", () => {
      expect(getWeaponIconData("lmg").textFallback).toBe("[LM]");
    });

    it("should return data for launcher", () => {
      expect(getWeaponIconData("launcher").textFallback).toBe("[RL]");
    });

    it("should return data for grenade", () => {
      const data = getWeaponIconData("grenade");
      expect(data.textFallback).toBe("[GR]");
      expect(data.color).toContain("255, 180, 100");
    });

    it("should return data for mortar", () => {
      const data = getWeaponIconData("mortar");
      expect(data.textFallback).toBe("[MT]");
      expect(data.color).toContain("255, 140, 100");
    });

    it("should return data for melee", () => {
      expect(getWeaponIconData("melee").textFallback).toBe("[ML]");
    });

    it("should return data for helicopter_minigun", () => {
      expect(getWeaponIconData("helicopter_minigun").textFallback).toBe("[MG]");
    });

    it("should return data for helicopter_rocket", () => {
      expect(getWeaponIconData("helicopter_rocket").textFallback).toBe("[RK]");
    });

    it("should return data for helicopter_doorgun", () => {
      expect(getWeaponIconData("helicopter_doorgun").textFallback).toBe("[DG]");
    });

    it("should return unknown data for unrecognized types", () => {
      const data = getWeaponIconData("nonexistent_weapon");
      expect(data.textFallback).toBe("--");
    });

    it("should return unknown data for empty string", () => {
      expect(getWeaponIconData("").textFallback).toBe("--");
    });
  });

  describe("getWeaponIconElement()", () => {
    it("should return a span element with text fallback when svgPath is null", () => {
      const element = getWeaponIconElement("rifle");
      expect(element.tagName).toBe("SPAN");
      expect(element.textContent).toBe("[AR]");
    });

    it("should set color from registry data on fallback span", () => {
      const element = getWeaponIconElement("rifle") as HTMLSpanElement;
      expect(element.style.color).toContain("rgba(255, 255, 255, 0.6)");
    });

    it("should return different elements for different weapon types", () => {
      const rifle = getWeaponIconElement("rifle");
      const shotgun = getWeaponIconElement("shotgun");
      expect(rifle.textContent).not.toBe(shotgun.textContent);
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

    it("should return explosive-colored text for grenade", () => {
      const element = getWeaponIconElement("grenade") as HTMLSpanElement;
      expect(element.style.color).toContain("rgba(255, 180, 100, 0.7)");
    });

    it("should return helicopter-colored text for helicopter_minigun", () => {
      const element = getWeaponIconElement("helicopter_minigun") as HTMLSpanElement;
      expect(element.style.color).toContain("rgba(180, 220, 255, 0.7)");
    });

    it("should return a new element each call (no shared references)", () => {
      const el1 = getWeaponIconElement("rifle");
      const el2 = getWeaponIconElement("rifle");
      expect(el1).not.toBe(el2);
    });
  });
});
