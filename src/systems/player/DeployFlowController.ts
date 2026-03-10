import * as THREE from 'three';
import type { DeploySessionKind, DeploySessionModel } from '../world/runtime/DeployFlowSession';

export interface DeployFlowState {
  kind: DeploySessionKind | null;
  session: DeploySessionModel | null;
  selectedSpawnPoint: string | null;
  visible: boolean;
  hasPendingInitialDeploy: boolean;
}

export class DeployFlowController {
  private kind: DeploySessionKind | null = null;
  private session: DeploySessionModel | null = null;
  private selectedSpawnPoint: string | null = null;
  private visible = false;
  private pendingInitialDeployResolve?: (position: THREE.Vector3) => void;
  private pendingInitialDeployReject?: (error: Error) => void;

  getState(): DeployFlowState {
    return {
      kind: this.kind,
      session: this.session,
      selectedSpawnPoint: this.selectedSpawnPoint,
      visible: this.visible,
      hasPendingInitialDeploy: !!this.pendingInitialDeployResolve,
    };
  }

  async beginInitialDeploy(openUi: () => void): Promise<THREE.Vector3> {
    if (this.visible) {
      return Promise.reject(new Error('Deploy UI is already active'));
    }

    return new Promise((resolve, reject) => {
      this.pendingInitialDeployResolve = resolve;
      this.pendingInitialDeployReject = reject;
      openUi();
    });
  }

  open(kind: DeploySessionKind, session: DeploySessionModel): void {
    this.visible = true;
    this.kind = kind;
    this.session = session;
    this.selectedSpawnPoint = null;
  }

  close(): void {
    this.visible = false;
    this.kind = null;
    this.session = null;
    this.selectedSpawnPoint = null;
  }

  setSelectedSpawnPoint(spawnPointId: string | null): void {
    this.selectedSpawnPoint = spawnPointId;
  }

  confirm(finalPosition: THREE.Vector3): DeploySessionKind | null {
    const kind = this.kind;
    if (!kind) {
      return null;
    }

    if (kind === 'initial') {
      const resolve = this.pendingInitialDeployResolve;
      this.pendingInitialDeployResolve = undefined;
      this.pendingInitialDeployReject = undefined;
      resolve?.(finalPosition);
    }

    this.close();
    return kind;
  }

  cancelInitialDeploy(error: Error): boolean {
    if (this.kind !== 'initial') {
      return false;
    }

    const reject = this.pendingInitialDeployReject;
    this.pendingInitialDeployResolve = undefined;
    this.pendingInitialDeployReject = undefined;
    this.close();
    reject?.(error);
    return true;
  }
}
