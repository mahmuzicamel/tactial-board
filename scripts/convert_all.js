const fs = require('fs');
const path = require('path');

global.window = global;
global.self = global;
require('./node_polyfills.js');

const THREE = require('/root/.hermes/tactics/static/vendor/three.js');
global.THREE = THREE;

const fflate = require('/root/.hermes/tactics/static/vendor/fflate.min.js');
global.fflate = fflate;

if (!global.atob) {
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

require('/root/.hermes/tactics/static/vendor/FBXLoader.js');
require('/root/.hermes/tactics/static/vendor/GLTFExporter.js');

const FBX_DIR = '/root/.hermes/tactics/static/fbx_pack';
const ANIM_DIR = '/root/.hermes/tactics/static/animations';
const MODELS_DIR = '/root/.hermes/tactics/static/models';

// Map FBX files to clean animation names
const MAPPINGS = [
  // Feldspieler Core Movements
  { fbx: 'kick soccerball.fbx', out: 'kick.glb', animName: 'kick' },
  { fbx: 'kick soccerball (2).fbx', out: 'kick2.glb', animName: 'kick2' },
  { fbx: 'soccer penalty kick.fbx', out: 'shoot.glb', animName: 'shoot' },
  { fbx: 'scissor kick.fbx', out: 'scissor_kick.glb', animName: 'scissor_kick' },
  { fbx: 'header soccerball.fbx', out: 'header.glb', animName: 'header' },
  { fbx: 'receive soccerball.fbx', out: 'receive.glb', animName: 'receive' },
  { fbx: 'kick up soccerball.fbx', out: 'kick_up.fbx.glb', animName: 'kick_up' },
  { fbx: 'throw in.fbx', out: 'throw_in.glb', animName: 'throw_in' },
  { fbx: 'soccer tackle.fbx', out: 'tackle.glb', animName: 'tackle' },
  { fbx: 'soccer tackle (2).fbx', out: 'tackle2.glb', animName: 'tackle2' },
  { fbx: 'soccer trip.fbx', out: 'trip.glb', animName: 'trip' },
  { fbx: 'offensive idle.fbx', out: 'idle.glb', animName: 'idle' },
  { fbx: 'jog forward.fbx', out: 'run.glb', animName: 'run' },
  { fbx: 'strike foward jog.fbx', out: 'sprint.glb', animName: 'sprint' },
  { fbx: 'jog strafe left.fbx', out: 'strafe_left.glb', animName: 'strafe_left' },
  { fbx: 'jog strafe right.fbx', out: 'strafe_right.glb', animName: 'strafe_right' },

  // Torwart (Goalkeeper)
  { fbx: 'goalkeeper idle.fbx', out: 'gk_idle.glb', animName: 'gk_idle' },
  { fbx: 'goalkeeper catch.fbx', out: 'gk_catch.glb', animName: 'gk_catch' },
  { fbx: 'goalkeeper diving save.fbx', out: 'gk_dive.glb', animName: 'gk_dive' },
  { fbx: 'goalkeeper drop kick.fbx', out: 'gk_dropkick.glb', animName: 'gk_dropkick' },
  { fbx: 'goalkeeper pass.fbx', out: 'gk_pass.glb', animName: 'gk_pass' },
  { fbx: 'goalkeeper overhand throw.fbx', out: 'gk_throw.glb', animName: 'gk_throw' },
  { fbx: 'goalkeeper body block.fbx', out: 'gk_block.glb', animName: 'gk_block' }
];

async function convertFile(item) {
  const fbxPath = path.join(FBX_DIR, item.fbx);
  if (!fs.existsSync(fbxPath)) {
    console.warn('File not found:', fbxPath);
    return;
  }
  const buffer = fs.readFileSync(fbxPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new THREE.FBXLoader();
  const fbx = loader.parse(arrayBuffer, '');

  if (fbx.animations && fbx.animations.length > 0) {
    fbx.animations[0].name = item.animName;
  }

  const exporter = new THREE.GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      fbx,
      (gltf) => {
        const outPath = path.join(ANIM_DIR, item.out);
        let outBuffer;
        if (gltf instanceof ArrayBuffer) {
          outBuffer = Buffer.from(gltf);
        } else if (gltf && gltf.buffer instanceof ArrayBuffer) {
          outBuffer = Buffer.from(gltf.buffer);
        } else {
          outBuffer = Buffer.from(JSON.stringify(gltf));
        }
        fs.writeFileSync(outPath, outBuffer);
        console.log(`✓ Converted ${item.fbx} -> ${item.out} (${(outBuffer.length / 1024).toFixed(1)} KB)`);
        resolve();
      },
      (err) => reject(err),
      { binary: true, animations: fbx.animations }
    );
  });
}

// Convert Base Model (X Bot.fbx)
async function convertBaseModel() {
  const fbxPath = path.join(FBX_DIR, 'X Bot.fbx');
  console.log('Converting Base Model X Bot.fbx ...');
  const buffer = fs.readFileSync(fbxPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new THREE.FBXLoader();
  const fbx = loader.parse(arrayBuffer, '');

  console.log('Exporter parse starting...');
  const exporter = new THREE.GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      fbx,
      (gltf) => {
        console.log('Exporter callback fired! Type:', typeof gltf);
        const outPath = path.join(MODELS_DIR, 'mixamo_player.glb');
        let outBuffer;
        if (gltf instanceof ArrayBuffer) {
          outBuffer = Buffer.from(gltf);
        } else if (gltf.buffer instanceof ArrayBuffer) {
          outBuffer = Buffer.from(gltf.buffer);
        } else {
          outBuffer = Buffer.from(JSON.stringify(gltf));
        }
        fs.writeFileSync(outPath, outBuffer);
        console.log(`✓ Converted Base Model X Bot.fbx -> mixamo_player.glb (${(outBuffer.length / 1024).toFixed(1)} KB)`);
        resolve();
      },
      (err) => {
        console.error('Exporter error:', err);
        reject(err);
      },
      { binary: true }
    );
  });
}

async function run() {
  await convertBaseModel();
  for (const item of MAPPINGS) {
    try {
      await convertFile(item);
    } catch (e) {
      console.error('Failed to convert', item.fbx, e);
    }
  }
  console.log('ALL DONE!');
}

run();
