import * as THREE from 'three';
import { Combatant, CombatantState, AISkillProfile, Faction, isOpfor } from './types';
import { WeaponSpec, GunplayCore } from '../weapons/GunplayCore';

export class CombatantFactory {
  private nextCombatantId = 0;

  createCombatant(
    faction: Faction,
    position: THREE.Vector3,
    squadData?: { squadId?: string; squadRole?: 'leader' | 'follower' }
  ): Combatant {
    const id = `combatant_${this.nextCombatantId++}`;
    const weaponSpec = this.createWeaponSpec(faction);
    const gunCore = new GunplayCore(weaponSpec);
    const skillProfile = this.createSkillProfile(faction, squadData?.squadRole || 'follower');
    const initialRotation = Math.random() * Math.PI * 2;

    const combatant: Combatant = {
      id,
      faction,
      position: position.clone(),
      velocity: new THREE.Vector3(),
      rotation: initialRotation,
      visualRotation: initialRotation,
      rotationVelocity: 0,
      scale: new THREE.Vector3(1, 1, 1),

      health: 100,
      maxHealth: 100,
      state: CombatantState.PATROLLING,

      weaponSpec,
      gunCore,
      skillProfile,
      lastShotTime: 0,
      currentBurst: 0,
      burstCooldown: 0,

      reactionTimer: 0,
      suppressionLevel: 0,
      alertTimer: 0,

      isFullAuto: false,
      panicLevel: 0,
      lastHitTime: 0,
      consecutiveMisses: 0,

      wanderAngle: Math.random() * Math.PI * 2,
      timeToDirectionChange: Math.random() * 3,

      lastUpdateTime: 0,
      updatePriority: 0,
      lodLevel: 'high',

      isObjectiveFocused: isOpfor(faction) && Math.random() < 0.4,

      kills: 0,
      deaths: 0,

      ...squadData
    };

    return combatant;
  }

  createPlayerProxy(playerPosition: THREE.Vector3): Combatant {
    const proxy: Combatant = {
      id: 'player_proxy',
      faction: Faction.US,
      position: playerPosition.clone(),
      velocity: new THREE.Vector3(),
      rotation: 0,
      visualRotation: 0,
      rotationVelocity: 0,
      scale: new THREE.Vector3(1, 1, 1),
      health: 100,
      maxHealth: 100,
      state: CombatantState.ENGAGING,
      weaponSpec: this.createWeaponSpec(Faction.US),
      gunCore: new GunplayCore(this.createWeaponSpec(Faction.US)),
      skillProfile: this.createSkillProfile(Faction.US, 'leader'),
      lastShotTime: 0,
      currentBurst: 0,
      burstCooldown: 0,
      reactionTimer: 0,
      suppressionLevel: 0,
      alertTimer: 0,
      isFullAuto: false,
      panicLevel: 0,
      lastHitTime: 0,
      consecutiveMisses: 0,
      wanderAngle: 0,
      timeToDirectionChange: 0,
      lastUpdateTime: 0,
      updatePriority: 0,
      lodLevel: 'high',
      isPlayerProxy: true,
      kills: 0,
      deaths: 0
    };
    return proxy;
  }

  private createWeaponSpec(faction: Faction): WeaponSpec {
    switch (faction) {
      case Faction.US:
        return {
          name: 'M16A1', rpm: 750, adsTime: 0.18,
          baseSpreadDeg: 0.6, bloomPerShotDeg: 0.2,
          recoilPerShotDeg: 0.55, recoilHorizontalDeg: 0.3,
          damageNear: 26, damageFar: 18,
          falloffStart: 25, falloffEnd: 65,
          headshotMultiplier: 1.7, penetrationPower: 1
        };
      case Faction.ARVN:
        return {
          name: 'M16A1', rpm: 750, adsTime: 0.20,
          baseSpreadDeg: 0.7, bloomPerShotDeg: 0.25,
          recoilPerShotDeg: 0.60, recoilHorizontalDeg: 0.35,
          damageNear: 26, damageFar: 18,
          falloffStart: 25, falloffEnd: 65,
          headshotMultiplier: 1.7, penetrationPower: 1
        };
      case Faction.NVA:
        return {
          name: 'AK-47', rpm: 600, adsTime: 0.20,
          baseSpreadDeg: 0.8, bloomPerShotDeg: 0.3,
          recoilPerShotDeg: 0.75, recoilHorizontalDeg: 0.4,
          damageNear: 30, damageFar: 16,
          falloffStart: 20, falloffEnd: 55,
          headshotMultiplier: 1.6, penetrationPower: 1.2
        };
      case Faction.VC:
        return {
          name: 'AK-47', rpm: 600, adsTime: 0.22,
          baseSpreadDeg: 0.9, bloomPerShotDeg: 0.35,
          recoilPerShotDeg: 0.80, recoilHorizontalDeg: 0.45,
          damageNear: 30, damageFar: 16,
          falloffStart: 20, falloffEnd: 55,
          headshotMultiplier: 1.6, penetrationPower: 1.2
        };
    }
  }

  private createSkillProfile(faction: Faction, role: 'leader' | 'follower'): AISkillProfile {
    const isLead = role === 'leader';
    const profiles: Record<Faction, AISkillProfile> = {
      [Faction.NVA]: {
        reactionDelayMs: isLead ? 400 : 600,
        aimJitterAmplitude: isLead ? 1.2 : 1.8,
        burstLength: isLead ? 4 : 3,
        burstPauseMs: isLead ? 800 : 1000,
        leadingErrorFactor: isLead ? 0.7 : 0.5,
        suppressionResistance: isLead ? 0.8 : 0.6,
        visualRange: 130, fieldOfView: 130,
        firstShotAccuracy: 0.4, burstDegradation: 3.5
      },
      [Faction.VC]: {
        reactionDelayMs: isLead ? 350 : 550,
        aimJitterAmplitude: isLead ? 1.4 : 2.0,
        burstLength: isLead ? 3 : 2,
        burstPauseMs: isLead ? 700 : 900,
        leadingErrorFactor: isLead ? 0.6 : 0.4,
        suppressionResistance: isLead ? 0.6 : 0.4,
        visualRange: 120, fieldOfView: 140,
        firstShotAccuracy: 0.5, burstDegradation: 4.0
      },
      [Faction.US]: {
        reactionDelayMs: isLead ? 450 : 650,
        aimJitterAmplitude: isLead ? 1.5 : 2.0,
        burstLength: isLead ? 3 : 3,
        burstPauseMs: isLead ? 900 : 1100,
        leadingErrorFactor: isLead ? 0.6 : 0.4,
        suppressionResistance: isLead ? 0.7 : 0.5,
        visualRange: 120, fieldOfView: 120,
        firstShotAccuracy: 0.5, burstDegradation: 4.0
      },
      [Faction.ARVN]: {
        reactionDelayMs: isLead ? 500 : 700,
        aimJitterAmplitude: isLead ? 1.6 : 2.2,
        burstLength: isLead ? 3 : 2,
        burstPauseMs: isLead ? 1000 : 1200,
        leadingErrorFactor: isLead ? 0.5 : 0.35,
        suppressionResistance: isLead ? 0.6 : 0.4,
        visualRange: 110, fieldOfView: 120,
        firstShotAccuracy: 0.55, burstDegradation: 4.5
      },
    };

    const baseProfile = { ...profiles[faction] };
    baseProfile.reactionDelayMs += (Math.random() - 0.5) * 100;
    baseProfile.aimJitterAmplitude += (Math.random() - 0.5) * 0.3;
    return baseProfile;
  }
}
