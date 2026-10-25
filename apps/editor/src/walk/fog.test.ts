/** The walk's fog (M5.10, D72): closed at the view distance, an environment's nearer fog kept. */
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { closeFog, DAYLIGHT, FOG_FROM } from './fog.ts';

const scene = (fog: THREE.Fog | null, background: string | null) => {
  const made = new THREE.Scene();
  made.fog = fog;
  made.background = background === null ? null : new THREE.Color(background);
  return made;
};

describe('the walk’s fog', () => {
  it('closes at the view distance in the sky’s colour when the space has no fog', () => {
    const made = scene(null, '#336699');
    closeFog(made, 250);
    const fog = made.fog as THREE.Fog;
    expect([fog.near, fog.far]).toEqual([250 * FOG_FROM, 250]);
    expect(fog.color.getHexString()).toBe('336699');
    const bare = scene(null, null);
    closeFog(bare, 400);
    expect((bare.fog as THREE.Fog).color.getHexString()).toBe(new THREE.Color(DAYLIGHT).getHexString());
  });

  it('keeps an environment’s fog that closes nearer, and pulls one that closes past it in', () => {
    const near = new THREE.Fog(0x808080, 20, 120);
    const kept = scene(near, '#336699');
    closeFog(kept, 250);
    expect(kept.fog).toBe(near);
    const far = scene(new THREE.Fog(0x808080, 300, 900), '#336699');
    closeFog(far, 250);
    const fog = far.fog as THREE.Fog;
    expect([fog.near, fog.far]).toEqual([150, 250]);
    expect(fog.color.getHexString()).toBe('808080');
    const thin = scene(new THREE.Fog(0x808080, 50, 900), null);
    closeFog(thin, 250);
    expect([(thin.fog as THREE.Fog).near, (thin.fog as THREE.Fog).far]).toEqual([50, 250]);
  });
});
