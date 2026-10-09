const fs = require('fs');
const path = require('path');

global.window = global;
global.self = global;
require('./node_polyfills.js');

global.fflate = require('/root/.hermes/tactics/static/vendor/fflate.min.js');
const THREE = require('/root/.hermes/tactics/static/vendor/three.js');
global.THREE = THREE;
require('/root/.hermes/tactics/static/vendor/FBXLoader.js');
require('/root/.hermes/tactics/static/vendor/GLTFExporter.js');

const FBX_DIR = '/root/.hermes/tactics/static/fbx_pack';
const MODELS_DIR = '/root/.hermes/tactics/static/models';

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const animList = [
  { fbx: 'offensive idle.fbx', animName: 'idle' },
  { fbx: 'jog forward.fbx', animName: 'run' },
  { fbx: 'strike foward jog.fbx', animName: 'sprint' },
  { fbx: 'kick soccerball.fbx', animName: 'kick' },
  { fbx: 'kick soccerball (2).fbx', animName: 'kick2' },
  { fbx: 'soccer penalty kick.fbx', animName: 'shoot' },
  { fbx: 'soccer tackle.fbx', animName: 'tackle' },
  { fbx: 'soccer tackle (2).fbx', animName: 'tackle2' },
  { fbx: 'soccer trip.fbx', animName: 'trip' },
  { fbx: 'receive soccerball.fbx', animName: 'receive' },
  { fbx: 'header soccerball.fbx', animName: 'header' },
  { fbx: 'throw in.fbx', animName: 'throw_in' },
  { fbx: 'jog strafe left.fbx', animName: 'strafe_left' },
  { fbx: 'jog strafe right.fbx', animName: 'strafe_right' },
  { fbx: 'goalkeeper idle.fbx', animName: 'gk_idle' },
  { fbx: 'goalkeeper catch.fbx', animName: 'gk_catch' },
  { fbx: 'goalkeeper diving save.fbx', animName: 'gk_dive' },
  { fbx: 'goalkeeper drop kick.fbx', animName: 'gk_dropkick' },
  { fbx: 'goalkeeper pass.fbx', animName: 'gk_pass' },
  { fbx: 'goalkeeper overhand throw.fbx', animName: 'gk_throw' },
  { fbx: 'goalkeeper body block.fbx', animName: 'gk_block' }
];

async function buildPack() {
  console.log('Loading base mesh X Bot.fbx ...');
  const botBuffer = fs.readFileSync(path.join(FBX_DIR, 'X Bot.fbx'));
  const botFbx = new THREE.FBXLoader().parse(toArrayBuffer(botBuffer), '');

  const clips = [];
  const loader = new THREE.FBXLoader();

  for (const item of animList) {
    const p = path.join(FBX_DIR, item.fbx);
    if (!fs.existsSync(p)) {
      console.warn('File not found:', p);
      continue;
    }
    try {
      const fbxBuf = fs.readFileSync(p);
      const animFbx = loader.parse(toArrayBuffer(fbxBuf), '');
      if (animFbx.animations && animFbx.animations.length > 0) {
        const c = animFbx.animations[0];
        c.name = item.animName;
        clips.push(c);
        console.log(`Loaded animation "${item.animName}" from ${item.fbx} (duration: ${c.duration.toFixed(2)}s)`);
      }
    } catch (err) {
      console.error(`Failed to load ${item.fbx}:`, err.message);
    }
  }

  console.log(`Total animations loaded: ${clips.length}. Exporting mixamo_player.glb ...`);

  const exporter = new THREE.GLTFExporter();
  exporter.parse(
    botFbx,
    (gltf) => {
      const outPath = path.join(MODELS_DIR, 'mixamo_player.glb');
      const outBuffer = Buffer.from(gltf);
      fs.writeFileSync(outPath, outBuffer);
      console.log(`✓ SUCCESS: Exported mixamo_player.glb with ${clips.length} embedded animations! Size: ${(outBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
    },
    { binary: true, animations: clips }
  );
}

buildPack();
