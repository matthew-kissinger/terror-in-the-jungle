import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RespawnUI } from './RespawnUI';

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

  beforeEach(() => {
    elementMap = new Map();
    mockBody = new MockHTMLElement('BODY');

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
      expect(elementMap.has('respawn-map')).toBe(true);
      expect(elementMap.has('selected-spawn-name')).toBe(true);
      expect(elementMap.has('selected-spawn-status')).toBe(true);
      expect(elementMap.has('respawn-timer')).toBe(true);
      expect(elementMap.has('respawn-button')).toBe(true);
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
      expect(timer?.style.color).toBe('#ff6600');
    });

    it('should show ready message when timer is 0', () => {
      ui.updateTimerDisplay(0, false);
      const timer = elementMap.get('respawn-timer');
      expect(timer?.textContent).toBe('Ready for deployment');
      expect(timer?.style.color).toBe('#00ff00');
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
