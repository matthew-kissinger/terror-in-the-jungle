import * as THREE from 'three';
import { Combatant, CombatantState, AISkillProfile, Faction } from './types';
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

      // 40% of OPFOR are objective-focused (less aggressive)
      isObjectiveFocused: faction === Faction.OPFOR && Math.random() < 0.4,

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
    if (faction === Faction.US) {
      return {
        name: 'M16A4',
        rpm: 750,
        adsTime: 0.18,
        baseSpreadDeg: 0.6,
        bloomPerShotDeg: 0.2,
        recoilPerShotDeg: 0.55,
        recoilHorizontalDeg: 0.3,
        damageNear: 26,
        damageFar: 18,
        falloffStart: 25,
        falloffEnd: 65,
        headshotMultiplier: 1.7,
        penetrationPower: 1
      };
    } else {
      return {
        name: 'AK-74',
        rpm: 600,
        adsTime: 0.20,
        baseSpreadDeg: 0.8,
        bloomPerShotDeg: 0.3,
        recoilPerShotDeg: 0.75,
        recoilHorizontalDeg: 0.4,
        damageNear: 30,
        damageFar: 16,
        falloffStart: 20,
        falloffEnd: 55,
        headshotMultiplier: 1.6,
        penetrationPower: 1.2
      };
    }
  }

  private createSkillProfile(faction: Faction, role: 'leader' | 'follower'): AISkillProfile {
    let baseProfile: AISkillProfile;

    if (faction === Faction.OPFOR) {
      baseProfile = {
        reactionDelayMs: role === 'leader' ? 400 : 600,
        aimJitterAmplitude: role === 'leader' ? 1.2 : 1.8, // Increased from 0.3/0.5
        burstLength: role === 'leader' ? 4 : 3,
        burstPauseMs: role === 'leader' ? 800 : 1000,
        leadingErrorFactor: role === 'leader' ? 0.7 : 0.5, // Reduced accuracy
        suppressionResistance: role === 'leader' ? 0.8 : 0.6,
        visualRange: 130,
        fieldOfView: 130,
        firstShotAccuracy: 0.4, // Increased from 0.15 (less accurate)
        burstDegradation: 3.5 // Increased from 2.0
      };
    } else {
      baseProfile = {
        reactionDelayMs: role === 'leader' ? 450 : 650,
        aimJitterAmplitude: role === 'leader' ? 1.5 : 2.0, // Increased from 0.4/0.6
        burstLength: role === 'leader' ? 3 : 3,
        burstPauseMs: role === 'leader' ? 900 : 1100,
        leadingErrorFactor: role === 'leader' ? 0.6 : 0.4, // Reduced accuracy
        suppressionResistance: role === 'leader' ? 0.7 : 0.5,
        visualRange: 120,
        fieldOfView: 120,
        firstShotAccuracy: 0.5, // Increased from 0.2 (less accurate)
        burstDegradation: 4.0 // Increased from 2.5
      };
    }

    // Add some randomization for variety
    baseProfile.reactionDelayMs += (Math.random() - 0.5) * 100;
    baseProfile.aimJitterAmplitude += (Math.random() - 0.5) * 0.3; // Increased variation

    return baseProfile;
  }
}
