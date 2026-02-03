import { ElevationSlider } from './ElevationSlider';
import { HelicopterMouseIndicator } from './HelicopterMouseIndicator';
import { HelicopterInstrumentsPanel } from './HelicopterInstrumentsPanel';

/**
 * Composes helicopter-related UI elements for backward compatibility.
 * This is a thin wrapper that delegates to the individual modules.
 */
export class HelicopterInstruments {
  public elevationSlider: HTMLDivElement;
  public helicopterMouseIndicator: HTMLDivElement;
  public helicopterInstruments: HTMLDivElement;

  private elevationSliderModule: ElevationSlider;
  private mouseIndicatorModule: HelicopterMouseIndicator;
  private instrumentsPanelModule: HelicopterInstrumentsPanel;

  constructor() {
    this.elevationSliderModule = new ElevationSlider();
    this.mouseIndicatorModule = new HelicopterMouseIndicator();
    this.instrumentsPanelModule = new HelicopterInstrumentsPanel();

    this.elevationSlider = this.elevationSliderModule.elevationSlider;
    this.helicopterMouseIndicator = this.mouseIndicatorModule.helicopterMouseIndicator;
    this.helicopterInstruments = this.instrumentsPanelModule.helicopterInstruments;
  }

  updateElevation(elevation: number): void {
    this.elevationSliderModule.updateElevation(elevation);
  }

  showHelicopterMouseIndicator(): void {
    this.mouseIndicatorModule.showHelicopterMouseIndicator();
  }

  hideHelicopterMouseIndicator(): void {
    this.mouseIndicatorModule.hideHelicopterMouseIndicator();
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    this.mouseIndicatorModule.updateHelicopterMouseMode(controlMode);
  }

  showHelicopterInstruments(): void {
    this.instrumentsPanelModule.showHelicopterInstruments();
  }

  hideHelicopterInstruments(): void {
    this.instrumentsPanelModule.hideHelicopterInstruments();
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.instrumentsPanelModule.updateHelicopterInstruments(collective, rpm, autoHover, engineBoost);
  }
}
