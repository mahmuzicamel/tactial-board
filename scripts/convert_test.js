// Test script to run FBXLoader in headless Node.js
const fs = require('fs');
const path = require('path');

// Minimal polyfills for Three.js and loaders in Node
global.window = global;
global.self = global;

require('./node_polyfills.js');

const THREE = require('/root/.hermes/tactics/static/vendor/three.js');
global.THREE = THREE;

// Load fflate
const fflate = require('/root/.hermes/tactics/static/vendor/fflate.min.js');
global.fflate = fflate;

// Polyfill atob/btoa
if (!global.atob) {
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Load FBXLoader
require('/root/.hermes/tactics/static/vendor/FBXLoader.js');
// Load GLTFExporter
require('/root/.hermes/tactics/static/vendor/GLTFExporter.js');

console.log('THREE loaded:', !!THREE);
console.log('FBXLoader loaded:', !!THREE.FBXLoader);
console.log('GLTFExporter loaded:', !!THREE.GLTFExporter);

const fbxPath = '/root/.hermes/tactics/static/fbx_pack/kick soccerball.fbx';
const buffer = fs.readFileSync(fbxPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new THREE.FBXLoader();
try {
  const fbx = loader.parse(arrayBuffer, '');
  console.log('Parsed FBX successfully!');
  console.log('Animations:', fbx.animations ? fbx.animations.length : 0);
  if (fbx.animations && fbx.animations.length > 0) {
    console.log('First animation clip name:', fbx.animations[0].name, 'duration:', fbx.animations[0].duration);
  }

  // Export to GLB
  const exporter = new THREE.GLTFExporter();
  exporter.parse(
    fbx,
    (gltf) => {
      console.log('Exported GLB successfully! Type:', typeof gltf, gltf instanceof ArrayBuffer ? 'ArrayBuffer' : 'Object');
      const outBuffer = Buffer.from(gltf);
      fs.writeFileSync('/root/.hermes/tactics/static/animations/kick_soccerball.glb', outBuffer);
      console.log('Saved to /root/.hermes/tactics/static/animations/kick_soccerball.glb, size:', outBuffer.length);
    },
    { binary: true, animations: fbx.animations }
  );
} catch (err) {
  console.error('Error parsing FBX:', err);
}
