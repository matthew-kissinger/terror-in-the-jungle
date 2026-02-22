/**
 * InteractionPromptPanel - Shows contextual interaction text (e.g. "Press E to pick up").
 *
 * Signal-driven: caller sets text via show(), component auto-hides via hide().
 * Replaces: InteractionPrompt (old factory class)
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './InteractionPromptPanel.module.css';

export class InteractionPromptPanel extends UIComponent {
  // --- Reactive state ---
  private promptText = this.signal('');
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.container;
  }

  protected onMount(): void {
    // Effect: update text
    this.effect(() => {
      this.root.textContent = this.promptText.value;
    });

    // Effect: toggle visibility
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });
  }

  // --- Public API ---

  show(text: string): void {
    this.promptText.value = text;
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }
}
