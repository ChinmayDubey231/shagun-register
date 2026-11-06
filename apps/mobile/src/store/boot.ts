import { create } from 'zustand';

interface BootState {
  /**
   * True once the opening splash has started to lift (or was never shown). Screens with their
   * own opening motion wait for it, so they play as they are revealed rather than under the splash.
   */
  revealed: boolean;
}

export const useBoot = create<BootState>(() => ({ revealed: false }));
