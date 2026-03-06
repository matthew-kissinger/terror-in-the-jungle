import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RespawnUI } from './RespawnUI';
import type { LoadoutPresentationModel } from './LoadoutService';
import type { DeploySessionModel } from '../world/runtime/DeployFlowSession';
import {
  DEFAULT_PLAYER_LOADOUT,
  LoadoutEquipment,
  LoadoutWeapon
} from '../../ui/loadout/LoadoutTypes';
import { Alliance, Faction } from '../combat/types';
import { GameMode } from '../../config/gameModeTypes';

// Helper class for mocking DOM elements
class MockHTMLElement {
  tagName: string;
  id: string = '';
  style: any = {};
  textContent: string = '';
  children: MockHTMLElement[] = [];
  parentElement: MockHTMLElement | null = null;
  disabled: boolean = false;
  
  // Event handlers
  onclick: (() => void) | null = null;
  onmouseover: (() => void) | null = null;
  onmouseout: (() => void) | null = null;
  private eventListeners: Map<string, Array<EventListener>> = new Map();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(event: string, handler: EventListener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: EventListener) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.eventListeners.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
    return true;
  }

  appendChild(child: MockHTMLElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockHTMLElement) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parentElement = null;
    }
    return child;
  }
}

describe('RespawnUI', () => {
  let ui: RespawnUI;
  let elementMap: Map<string, MockHTMLElement>;
  let mockBody: MockHTMLElement;
  let mockHead: MockHTMLElement;
  const editableSession: DeploySessionModel = {
    kind: 'respawn',
    mode: 'zone_control' as any,
    modeName: 'Zone Control',
    modeDescription: 'Fast-paced combat.',
    flow: 'standard',
    mapVariant: 'standard',
    flowLabel: 'Frontline deployment',
    headline: 'RETURN TO BATTLE',
    subheadline: 'Choose a controlled position and return to the fight.',
    mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
    selectedSpawnTitle: 'SELECTED SPAWN POINT',
    emptySelectionText: 'Select a spawn point on the map',
    readySelectionText: 'Ready to deploy',
    countdownLabel: 'Deployment available in',
    readyLabel: 'Ready for deployment',
    actionLabel: 'DEPLOY',
    secondaryActionLabel: null,
    allowSpawnSelection: true,
    allowLoadoutEditing: true,
    sequenceTitle: 'Redeploy Checklist',
    sequenceSteps: [
      'Choose a spawn point before returning to the fight.',
      'Configure 2 weapons and 1 equipment slot before deployment.',
      'Redeploy as soon as the timer clears.',
    ],
  };

  beforeEach(() => {
    elementMap = new Map();
    mockBody = new MockHTMLElement('BODY');
    mockHead = new MockHTMLElement('HEAD');

    // Mock document
    global.document = {
      createElement: vi.fn((tagName: string) => {
        const el = new MockHTMLElement(tagName);
        // Use a proxy to intercept property sets (like id)
        return new Proxy(el, {
          set(target, prop, value) {
            target[prop] = value;
            if (prop === 'id') {
              elementMap.set(value as string, target);
            }
            return true;
          }
        });
      }),
      getElementById: vi.fn((id: string) => {
        return elementMap.get(id) || null;
      }),
      body: mockBody,
      head: mockHead,
    } as any;

    ui = new RespawnUI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create respawn UI container and attach to body', () => {
      const container = ui.getContainer();
      expect(container).toBeDefined();
      expect(container?.id).toBe('respawn-ui');
      expect(container?.parentElement).toBe(mockBody);
      // Should verify it starts hidden (initially set via cssText)
      expect(container?.style.cssText).toContain('display: none');
    });

    it('should create all required sub-elements', () => {
      // These should exist in the map by ID
      expect(elementMap.has('respawn-header-title')).toBe(true);
      expect(elementMap.has('respawn-header-status')).toBe(true);
      expect(elementMap.has('respawn-map')).toBe(true);
      expect(elementMap.has('selected-spawn-name')).toBe(true);
      expect(elementMap.has('selected-spawn-status')).toBe(true);
      expect(elementMap.has('respawn-timer')).toBe(true);
      expect(elementMap.has('respawn-button')).toBe(true);
      expect(elementMap.has('respawn-secondary-button')).toBe(true);
      expect(elementMap.has('respawn-sequence-panel')).toBe(true);
      expect(elementMap.has('respawn-sequence-title')).toBe(true);
      expect(elementMap.has('respawn-sequence-steps')).toBe(true);
      expect(elementMap.has('respawn-loadout-panel')).toBe(true);
      expect(elementMap.has('respawn-loadout-status')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-panel')).toBe(true);
      expect(elementMap.has('respawn-loadout-faction')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-name')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-description')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-prev')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-next')).toBe(true);
      expect(elementMap.has('respawn-loadout-preset-save')).toBe(true);
      expect(elementMap.has('loadout-primaryWeapon-value')).toBe(true);
      expect(elementMap.has('loadout-secondaryWeapon-value')).toBe(true);
      expect(elementMap.has('loadout-equipment-value')).toBe(true);
    });

    it('should expose map container', () => {
      const mapContainer = ui.getMapContainer();
      expect(mapContainer).toBeDefined();
      expect(mapContainer?.id).toBe('respawn-map');
    });
  });

  describe('Visibility Control', () => {
    it('should show the UI', () => {
      ui.show();
      const container = ui.getContainer();
      expect(container?.style.display).toBe('flex');
    });

    it('should hide the UI', () => {
      ui.show(); // Show first
      ui.hide();
      const container = ui.getContainer();
      expect(container?.style.display).toBe('none');
    });
  });

  describe('Timer Display', () => {
    it('should show countdown when timer > 0', () => {
      ui.updateTimerDisplay(5, false);
      const timer = elementMap.get('respawn-timer');
      expect(timer?.textContent).toContain('5s');
      expect(timer?.style.color).toBe('rgba(212, 163, 68, 0.9)');
    });

    it('should show ready message when timer is 0', () => {
      ui.updateTimerDisplay(0, false);
      const timer = elementMap.get('respawn-timer');
      expect(timer?.textContent).toBe('Ready for deployment');
      expect(timer?.style.color).toBe('rgba(92, 184, 92, 0.9)');
    });
  });

  describe('Session Configuration', () => {
    const session: DeploySessionModel = {
      kind: 'respawn',
      mode: 'a_shau_valley' as any,
      modeName: 'A Shau Valley',
      modeDescription: 'Historical Vietnam campaign.',
      flow: 'air_assault',
      mapVariant: 'standard',
      flowLabel: 'Air assault insertion',
      headline: 'AIR ASSAULT REINSERTION',
      subheadline: 'Select an insertion zone and rejoin the campaign near the active front.',
      mapTitle: 'ASSAULT MAP - SELECT INSERTION',
      selectedSpawnTitle: 'SELECTED INSERTION ZONE',
      emptySelectionText: 'Select a spawn point on the map',
      readySelectionText: 'Insertion route confirmed',
      countdownLabel: 'Deployment available in',
      readyLabel: 'Ready for deployment',
      actionLabel: 'REINSERT',
      secondaryActionLabel: null,
      allowSpawnSelection: true,
      allowLoadoutEditing: true,
      sequenceTitle: 'Redeploy Checklist',
      sequenceSteps: [
        'Choose an insertion zone before returning to the fight.',
        'Configure 2 weapons and 1 equipment slot before deployment.',
        'Redeploy as soon as the reinsert timer clears.',
      ],
    };

    it('should apply deploy-session copy to the UI', () => {
      ui.configureSession(session);

      expect(elementMap.get('respawn-header-title')?.textContent).toBe('AIR ASSAULT REINSERTION');
      expect(elementMap.get('respawn-header-status')?.textContent).toBe('Select an insertion zone and rejoin the campaign near the active front.');
      expect(elementMap.get('respawn-button')?.textContent).toBe('REINSERT');
      expect(elementMap.get('respawn-secondary-button')?.style.display).toBe('none');
      expect(elementMap.get('respawn-sequence-title')?.textContent).toBe('Redeploy Checklist');
      expect(elementMap.get('respawn-sequence-steps')?.children).toHaveLength(3);
    });

    it('should show secondary action when initial deploy supports cancel', () => {
      ui.configureSession({
        ...session,
        kind: 'initial',
        actionLabel: 'INSERT',
        secondaryActionLabel: 'BACK TO MODE SELECT',
      });

      expect(elementMap.get('respawn-secondary-button')?.textContent).toBe('BACK TO MODE SELECT');
      expect(elementMap.get('respawn-secondary-button')?.style.display).toBe('block');
    });

    it('should use deploy-session text for selected spawn state', () => {
      ui.configureSession(session);
      ui.updateSelectedSpawn('LZ Goodman');

      expect(elementMap.get('selected-spawn-status')?.textContent).toBe('Insertion route confirmed');
    });

    it('should toggle map interactivity', () => {
      ui.setMapInteractionEnabled(false);
      const map = elementMap.get('respawn-map');

      expect(map?.style.pointerEvents).toBe('none');
      expect(map?.style.opacity).toBe('0.8');
    });

    it('should lock loadout editing when the session disallows it', () => {
      ui.configureSession({
        ...session,
        allowLoadoutEditing: false,
      });

      expect(elementMap.get('respawn-loadout-status')?.textContent).toBe('Mission loadout locked for this deployment.');
    });
  });

  describe('Loadout Panel', () => {
    it('should render the current deploy loadout', () => {
      ui.updateLoadout({
        ...DEFAULT_PLAYER_LOADOUT,
        primaryWeapon: LoadoutWeapon.SMG,
        secondaryWeapon: LoadoutWeapon.PISTOL,
        equipment: LoadoutEquipment.MORTAR_KIT,
      });

      expect(elementMap.get('loadout-primaryWeapon-value')?.textContent).toBe('SMG');
      expect(elementMap.get('loadout-secondaryWeapon-value')?.textContent).toBe('Pistol');
      expect(elementMap.get('loadout-equipment-value')?.textContent).toBe('Mortar Kit');
    });

    it('should route loadout button presses to the callback', () => {
      const callback = vi.fn();
      ui.setLoadoutChangeCallback(callback);

      const controls = (ui as any).loadoutControls.get('primaryWeapon');
      controls.nextButton.dispatchEvent(new Event('pointerdown'));

      expect(callback).toHaveBeenCalledWith('primaryWeapon', 1);
    });

    it('should render faction-aware preset metadata', () => {
      ui.configureSession(editableSession);
      const presentation: LoadoutPresentationModel = {
        context: {
          mode: GameMode.A_SHAU_VALLEY,
          alliance: Alliance.OPFOR,
          faction: Faction.NVA,
        },
        factionLabel: 'NVA',
        presetIndex: 2,
        presetCount: 3,
        presetName: 'Fire Support',
        presetDescription: 'Indirect-fire preset for longer engagements.',
        presetDirty: true,
        availableWeapons: [LoadoutWeapon.RIFLE, LoadoutWeapon.SMG, LoadoutWeapon.PISTOL],
        availableEquipment: [
          LoadoutEquipment.FRAG_GRENADE,
          LoadoutEquipment.SMOKE_GRENADE,
          LoadoutEquipment.MORTAR_KIT,
        ],
      };

      ui.updateLoadoutPresentation(presentation);

      expect(elementMap.get('respawn-loadout-faction')?.textContent).toBe('NVA');
      expect(elementMap.get('respawn-loadout-preset-name')?.textContent).toBe('Fire Support (3/3)');
      expect(elementMap.get('respawn-loadout-preset-description')?.textContent).toBe('Indirect-fire preset for longer engagements.');
      expect(elementMap.get('respawn-loadout-status')?.textContent).toBe('NVA preset 3/3. Adjust two weapons and one equipment slot before deploying.');
      expect(elementMap.get('respawn-loadout-preset-save')?.textContent).toBe('Save Preset');
      expect(elementMap.get('respawn-loadout-preset-save')?.disabled).toBe(false);
    });

    it('should route preset button presses to the callback', () => {
      const cycleCallback = vi.fn();
      const saveCallback = vi.fn();
      ui.configureSession(editableSession);
      ui.setPresetCycleCallback(cycleCallback);
      ui.setPresetSaveCallback(saveCallback);
      ui.updateLoadoutPresentation({
        context: {
          mode: GameMode.ZONE_CONTROL,
          alliance: Alliance.BLUFOR,
          faction: Faction.US,
        },
        factionLabel: 'US',
        presetIndex: 0,
        presetCount: 3,
        presetName: 'Rifleman',
        presetDescription: 'Balanced assault loadout for frontline pushes.',
        presetDirty: true,
        availableWeapons: [LoadoutWeapon.RIFLE, LoadoutWeapon.SHOTGUN, LoadoutWeapon.SMG, LoadoutWeapon.PISTOL],
        availableEquipment: [
          LoadoutEquipment.FRAG_GRENADE,
          LoadoutEquipment.SMOKE_GRENADE,
          LoadoutEquipment.FLASHBANG,
          LoadoutEquipment.SANDBAG_KIT,
          LoadoutEquipment.MORTAR_KIT,
        ],
      });

      elementMap.get('respawn-loadout-preset-next')?.dispatchEvent(new Event('pointerdown'));
      elementMap.get('respawn-loadout-preset-save')?.dispatchEvent(new Event('pointerdown'));

      expect(cycleCallback).toHaveBeenCalledWith(1);
      expect(saveCallback).toHaveBeenCalled();
    });

    it('should disable loadout controls when editing is locked', () => {
      ui.setLoadoutEditingEnabled(false);

      const controls = (ui as any).loadoutControls.get('equipment');
      expect(controls.previousButton.disabled).toBe(true);
      expect(controls.nextButton.disabled).toBe(true);
      expect(elementMap.get('respawn-loadout-preset-prev')?.disabled).toBe(true);
      expect(elementMap.get('respawn-loadout-preset-next')?.disabled).toBe(true);
      expect(elementMap.get('respawn-loadout-preset-save')?.disabled).toBe(true);
      expect(elementMap.get('respawn-loadout-status')?.textContent).toBe('Mission loadout locked for this deployment.');
    });
  });

  describe('Spawn Selection', () => {
    it('should update selected spawn info', () => {
      ui.updateSelectedSpawn('Alpha Base');
      const name = elementMap.get('selected-spawn-name');
      const status = elementMap.get('selected-spawn-status');
      
      expect(name?.textContent).toBe('Alpha Base');
      expect(status?.textContent).toBe('Ready to deploy');
    });

    it('should reset selected spawn info', () => {
      ui.updateSelectedSpawn('Alpha Base'); // Set first
      ui.resetSelectedSpawn();

      const name = elementMap.get('selected-spawn-name');
      const status = elementMap.get('selected-spawn-status');
      
      expect(name?.textContent).toBe('NONE');
      expect(status?.textContent).toBe('Select a spawn point on the map');
    });
  });

  describe('Deploy Button Logic', () => {
    it('should be disabled when timer > 0', () => {
      ui.updateTimerDisplay(5, true); // Has selection, but timer active
      const btn = elementMap.get('respawn-button');
      expect(btn?.disabled).toBe(true);
      expect(btn?.style.cursor).toBe('not-allowed');
    });

    it('should be disabled when no selection made', () => {
      ui.updateTimerDisplay(0, false); // Timer done, but no selection
      const btn = elementMap.get('respawn-button');
      expect(btn?.disabled).toBe(true);
      expect(btn?.style.cursor).toBe('not-allowed');
    });

    it('should be enabled when timer is 0 AND selection made', () => {
      ui.updateTimerDisplay(0, true);
      const btn = elementMap.get('respawn-button');
      expect(btn?.disabled).toBe(false);
      expect(btn?.style.cursor).toBe('pointer');
    });

    it('should trigger callback when clicked', () => {
      const callback = vi.fn();
      ui.setRespawnClickCallback(callback);
      
      // Enable button first
      ui.updateTimerDisplay(0, true);
      const btn = elementMap.get('respawn-button');
      
      // Simulate pointerdown
      if (btn) {
        btn.dispatchEvent(new Event('pointerdown'));
      }
      
      expect(callback).toHaveBeenCalled();
    });

    it('should trigger cancel callback when secondary action is clicked', () => {
      const callback = vi.fn();
      ui.setCancelClickCallback(callback);
      ui.configureSession({
        kind: 'initial',
        mode: 'zone_control' as any,
        modeName: 'Zone Control',
        modeDescription: 'Fast-paced combat.',
        flow: 'standard',
        mapVariant: 'standard',
        flowLabel: 'Frontline deployment',
        headline: 'BATTLEFIELD INSERTION',
        subheadline: 'Choose a starting position before the match goes live.',
        mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
        selectedSpawnTitle: 'SELECTED SPAWN POINT',
        emptySelectionText: 'Select a spawn point on the map',
        readySelectionText: 'Ready to deploy',
        countdownLabel: 'Deployment available in',
        readyLabel: 'Ready for deployment',
        actionLabel: 'DEPLOY',
        secondaryActionLabel: 'BACK TO MODE SELECT',
        allowSpawnSelection: true,
        allowLoadoutEditing: true,
        sequenceTitle: 'Deployment Checklist',
        sequenceSteps: [],
      });

      elementMap.get('respawn-secondary-button')?.dispatchEvent(new Event('pointerdown'));

      expect(callback).toHaveBeenCalled();
    });

    it('should NOT trigger callback when disabled', () => {
      const callback = vi.fn();
      ui.setRespawnClickCallback(callback);
      
      // Disable button
      ui.updateTimerDisplay(5, true); // Timer active
      const btn = elementMap.get('respawn-button');
      
      // Simulate click
      if (btn && btn.onclick) {
        btn.onclick();
      }
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle mouse over effects only when enabled', () => {
      ui.updateTimerDisplay(0, true); // Enable
      const btn = elementMap.get('respawn-button');
      
      if (btn && btn.onmouseover) btn.onmouseover();
      expect(btn?.style.transform).toBe('scale(1.05)');

      if (btn && btn.onmouseout) btn.onmouseout();
      expect(btn?.style.transform).toBe('scale(1)');
    });

    it('should NOT handle mouse over effects when disabled', () => {
      ui.updateTimerDisplay(5, true); // Disable
      const btn = elementMap.get('respawn-button');
      
      // Reset styles
      if (btn) btn.style.transform = 'none';

      if (btn && btn.onmouseover) btn.onmouseover();
      expect(btn?.style.transform).toBe('none');
    });
  });

  describe('Cleanup', () => {
    it('should remove container from body on dispose', () => {
      const container = ui.getContainer();
      expect(container?.parentElement).toBe(mockBody);
      expect(mockBody.children).toContain(container);

      ui.dispose();

      expect(container?.parentElement).toBeNull();
      expect(mockBody.children).not.toContain(container);
    });

    it('should handle dispose if already removed', () => {
      ui.dispose(); // First time
      expect(() => ui.dispose()).not.toThrow(); // Second time shouldn't throw
    });
  });
});
