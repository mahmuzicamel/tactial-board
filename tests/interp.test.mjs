import { interpolateKeyframeElements } from '../static/js/core/geometry.js';

let fails = 0;
function approx(a,b,msg){ if(Math.abs(a-b)>1e-6){ console.log('FAIL',msg,a,'!=',b); fails++;} else console.log('ok  ',msg); }
function truthy(c,msg){ if(c) console.log('ok  ',msg); else { console.log('FAIL',msg); fails++; } }

const kf1 = { elements: [
  { id: 'p1', x: 0,   y: 0,   rotation: 0 },
  { id: 'p2', x: 100, y: 100, rotation: 350 },
  { id: 'gone', x: 5, y: 5 }
]};
const kf2 = { elements: [
  { id: 'p1', x: 100, y: 0,   rotation: 0, jump: true },
  { id: 'p2', x: 100, y: 200, rotation: 10 },
  { id: 'new', x: 9, y: 9 }
]};

const mid = interpolateKeyframeElements(kf1, kf2, 0.5, { includeRotation: true });
const p1 = mid.find(e=>e.id==='p1');
const p2 = mid.find(e=>e.id==='p2');
approx(p1.x, 50, 'p1.x linear mid');
approx(p1.y, 0,  'p1.y linear mid');
approx(p1.scaleMultiplier, 1.45, 'p1 jump scale @0.5');
approx(p2.rotation, 360, 'p2 rotation shortest path (350->10)');

// 2D-Modus: rotation wird NICHT neu berechnet (Shortest-Path), sondern nur roh durchgereicht.
// p2: el2.rotation=10 überschreibt via Spread -> 10 (nicht 360 wie im 3D-Shortest-Path-Modus).
const mid2d = interpolateKeyframeElements(kf1, kf2, 0.5);
approx(mid2d.find(e=>e.id==='p2').rotation, 10, '2D-Modus reicht rohe rotation durch (keine Interpolation)');

truthy(interpolateKeyframeElements(kf1,kf2,0.3).find(e=>e.id==='gone'), 'verschwindendes Element @0.3 sichtbar');
truthy(interpolateKeyframeElements(kf1,kf2,0.7).find(e=>e.id==='new'), 'erscheinendes Element @0.7 sichtbar');
truthy(!interpolateKeyframeElements(kf1,kf2,0.3).find(e=>e.id==='new'), 'erscheinendes Element @0.3 noch unsichtbar');

console.log(fails===0 ? '\n✅ ALL PASS' : `\n❌ ${fails} FAIL`);
process.exit(fails===0?0:1);
