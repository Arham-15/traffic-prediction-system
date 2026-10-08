export function initThreeAssistant() {
  if (typeof THREE === 'undefined') {
    console.warn('Three.js not loaded yet');
    return;
  }
  const container = document.getElementById('threejs-container-ANIMATION-2');
  if (!container) return;

  const devicePixelRatio = window.devicePixelRatio || 1;
  // 3D AI Traffic Assistant in Three.js
// Original robot design preserved: compact white/cyan humano-bot with articulated
// arms + NEW articulated legs. Both hands cradle the Google Maps pin at chest
// height, walking-in-place stance, blinking eyes, head tracking and presenting
// gestures. Clicking the robot makes it hop (the surrounding widget opens chat).

const width = container.clientWidth || 280;
const height = container.clientHeight || 280;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
camera.position.set(0, 0.55, 4.35);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xdcf8ff, 0.9);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(3, 6, 4);
scene.add(dirLight);

const rimLight = new THREE.PointLight(0x00f2fe, 3, 10);
rimLight.position.set(-2.5, 2, -2);
scene.add(rimLight);

const accentLight = new THREE.PointLight(0x38bdf8, 2, 8);
accentLight.position.set(0, -1, 2);
scene.add(accentLight);

// Robot Root Group
const robotRoot = new THREE.Group();
robotRoot.position.y = -0.1;
scene.add(robotRoot);

// Materials
const whiteArmorMat = new THREE.MeshPhongMaterial({
  color: 0xf1f5f9,
  specular: 0xffffff,
  shininess: 90,
  flatShading: false
});

const darkCarbonMat = new THREE.MeshPhongMaterial({
  color: 0x1e293b,
  specular: 0x64748b,
  shininess: 50
});

const visorMat = new THREE.MeshPhongMaterial({
  color: 0x090d16,
  specular: 0x38bdf8,
  shininess: 100,
  reflectivity: 0.9
});

const eyeGlowMat = new THREE.MeshBasicMaterial({
  color: 0x00f2fe
});

const chestCoreMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8
});

const jointMat = new THREE.MeshPhongMaterial({
  color: 0x334155,
  shininess: 80
});

// 1. Torso
const torsoGroup = new THREE.Group();
robotRoot.add(torsoGroup);

// Torso Main Shell (streamlined curved capsule/box)
const torsoGeo = new THREE.CylinderGeometry(0.42, 0.32, 0.85, 24);
const torsoMesh = new THREE.Mesh(torsoGeo, whiteArmorMat);
torsoMesh.position.y = 0.45;
torsoGroup.add(torsoMesh);

// Torso Chest Plate (futuristic panel)
const chestPlateGeo = new THREE.BoxGeometry(0.48, 0.4, 0.22);
const chestPlate = new THREE.Mesh(chestPlateGeo, darkCarbonMat);
chestPlate.position.set(0, 0.52, 0.25);
torsoGroup.add(chestPlate);

// Core Reactor Ring
const coreRingGeo = new THREE.TorusGeometry(0.12, 0.035, 16, 32);
const coreRing = new THREE.Mesh(coreRingGeo, jointMat);
coreRing.position.set(0, 0.52, 0.37);
torsoGroup.add(coreRing);

// Core Light
const coreLightGeo = new THREE.SphereGeometry(0.08, 16, 16);
const coreSphere = new THREE.Mesh(coreLightGeo, chestCoreMat);
coreSphere.position.set(0, 0.52, 0.36);
torsoGroup.add(coreSphere);

// Thruster / Base Ring (anti-gravity hover module)
const thrusterGeo = new THREE.CylinderGeometry(0.3, 0.16, 0.3, 20);
const thrusterMesh = new THREE.Mesh(thrusterGeo, darkCarbonMat);
thrusterMesh.position.y = -0.05;
torsoGroup.add(thrusterMesh);

const hoverRingGeo = new THREE.TorusGeometry(0.24, 0.04, 16, 32);
const hoverRing = new THREE.Mesh(hoverRingGeo, eyeGlowMat);
hoverRing.rotation.x = Math.PI / 2;
hoverRing.position.y = -0.72; // anti-gravity landing glow below the boots
torsoGroup.add(hoverRing);

// 1b. Legs — articulated hip / knee / ankle chain so the robot can step and
// shift weight like the reference design (white armor, dark joints, round boots)
const legThighGeo = new THREE.CylinderGeometry(0.095, 0.085, 0.24, 14);
const legShinGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.24, 14);
const kneeBallGeo = new THREE.SphereGeometry(0.085, 14, 14);
const hipBallGeo = new THREE.SphereGeometry(0.09, 14, 14);
const bootGeo = new THREE.BoxGeometry(0.17, 0.09, 0.26);
const bootTrimGeo = new THREE.BoxGeometry(0.175, 0.035, 0.265);

function createLeg(side) {
  // side: -1 = left leg, +1 = right leg
  const legGroup = new THREE.Group();
  legGroup.position.set(side * 0.16, 0.02, 0);

  const hipBall = new THREE.Mesh(hipBallGeo, jointMat);
  legGroup.add(hipBall);

  const thigh = new THREE.Mesh(legThighGeo, whiteArmorMat);
  thigh.position.y = -0.13;
  legGroup.add(thigh);

  const kneeBall = new THREE.Mesh(kneeBallGeo, darkCarbonMat);
  kneeBall.position.y = -0.26;
  legGroup.add(kneeBall);

  const shinGroup = new THREE.Group();
  shinGroup.position.y = -0.26;
  legGroup.add(shinGroup);

  const shin = new THREE.Mesh(legShinGeo, whiteArmorMat);
  shin.position.y = -0.13;
  shinGroup.add(shin);

  const boot = new THREE.Mesh(bootGeo, whiteArmorMat);
  boot.position.set(0, -0.28, 0.045);
  shinGroup.add(boot);

  const bootTrim = new THREE.Mesh(bootTrimGeo, darkCarbonMat);
  bootTrim.position.set(0, -0.315, 0.045);
  shinGroup.add(bootTrim);

  return { legGroup, shinGroup, boot };
}

const leftLeg = createLeg(-1);
const rightLeg = createLeg(1);
robotRoot.add(leftLeg.legGroup);
robotRoot.add(rightLeg.legGroup);

// 2. Neck & Head
const neckGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.15, 16);
const neckMesh = new THREE.Mesh(neckGeo, jointMat);
neckMesh.position.y = 0.95;
torsoGroup.add(neckMesh);

const headGroup = new THREE.Group();
headGroup.position.set(0, 1.15, 0);
robotRoot.add(headGroup);

// Head Helmet
const helmetGeo = new THREE.SphereGeometry(0.46, 32, 24);
helmetGeo.scale(1, 0.9, 1.05);
const helmetMesh = new THREE.Mesh(helmetGeo, whiteArmorMat);
headGroup.add(helmetMesh);

// Visor (dark curved curved face shield)
const visorGeo = new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI, 0, Math.PI * 0.55);
const visorMesh = new THREE.Mesh(visorGeo, visorMat);
visorMesh.rotation.x = Math.PI * 0.1;
visorMesh.position.set(0, 0.04, 0.08);
headGroup.add(visorMesh);

// Antennas / Ear nodes
const earGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16);
const leftEar = new THREE.Mesh(earGeo, darkCarbonMat);
leftEar.rotation.z = Math.PI / 2;
leftEar.position.set(-0.48, 0.05, 0);
headGroup.add(leftEar);

const rightEar = leftEar.clone();
rightEar.position.set(0.48, 0.05, 0);
headGroup.add(rightEar);

// Fin Antenna on top
const finGeo = new THREE.BoxGeometry(0.04, 0.18, 0.22);
const finMesh = new THREE.Mesh(finGeo, jointMat);
finMesh.position.set(0, 0.44, -0.05);
headGroup.add(finMesh);

// AI Eyes (Twin futuristic glowing visor apertures)
// THREE.CapsuleGeometry only exists in three.js r139+; fall back to a cylinder
const eyeGeo = typeof THREE.CapsuleGeometry === 'function'
  ? new THREE.CapsuleGeometry(0.045, 0.1, 4, 12)
  : new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16);
const leftEye = new THREE.Mesh(eyeGeo, eyeGlowMat);
leftEye.rotation.z = Math.PI / 2;
leftEye.position.set(-0.16, 0.06, 0.44);
headGroup.add(leftEye);

const rightEye = leftEye.clone();
rightEye.position.set(0.16, 0.06, 0.44);
headGroup.add(rightEye);

// 3. Left Arm (mirrored presentation pose — cradles the pin together with the right hand)
const leftArmGroup = new THREE.Group();
leftArmGroup.position.set(-0.4, 0.78, 0.05);
robotRoot.add(leftArmGroup);

const shoulderGeo = new THREE.SphereGeometry(0.12, 16, 16);
const leftShoulder = new THREE.Mesh(shoulderGeo, whiteArmorMat);
leftArmGroup.add(leftShoulder);

const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.32, 16);
const leftUpperArm = new THREE.Mesh(upperArmGeo, darkCarbonMat);
leftUpperArm.position.set(-0.08, -0.18, 0.08);
leftUpperArm.rotation.set(-0.3, 0, 0.3);
leftArmGroup.add(leftUpperArm);

const leftForearmGroup = new THREE.Group();
leftForearmGroup.position.set(-0.14, -0.32, 0.16);
leftArmGroup.add(leftForearmGroup);

const forearmGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.3, 16);
const leftForearm = new THREE.Mesh(forearmGeo, whiteArmorMat);
leftForearm.position.set(-0.05, -0.05, 0.2);
leftForearm.rotation.set(-1.1, -0.3, 0.2);
leftForearmGroup.add(leftForearm);

const handGeo = new THREE.SphereGeometry(0.07, 12, 12);
const leftHand = new THREE.Mesh(handGeo, jointMat);
leftHand.position.set(-0.1, 0.05, 0.35);
leftForearmGroup.add(leftHand);

// 4. Right Arm (mirrored presentation pose — cradles the pin together with the left hand)
const rightArmGroup = new THREE.Group();
rightArmGroup.position.set(0.4, 0.78, 0.05);
robotRoot.add(rightArmGroup);

const rightShoulder = new THREE.Mesh(shoulderGeo, whiteArmorMat);
rightArmGroup.add(rightShoulder);

const rightUpperArm = new THREE.Mesh(upperArmGeo, darkCarbonMat);
rightUpperArm.position.set(0.08, -0.18, 0.08);
rightUpperArm.rotation.set(-0.3, 0, -0.3);
rightArmGroup.add(rightUpperArm);

const rightForearmGroup = new THREE.Group();
rightForearmGroup.position.set(0.14, -0.32, 0.16);
rightArmGroup.add(rightForearmGroup);

const rightForearm = new THREE.Mesh(forearmGeo, whiteArmorMat);
rightForearm.position.set(0.05, -0.05, 0.2);
rightForearm.rotation.set(-1.1, 0.3, -0.2);
rightForearmGroup.add(rightForearm);

const rightHand = new THREE.Mesh(handGeo, jointMat);
rightHand.position.set(0.1, 0.05, 0.35);
rightForearmGroup.add(rightHand);

// Base presentation pose — hands meet in front of the chest where the pin sits.
// The animation loop only adds small oscillations around these values.
leftArmGroup.rotation.set(-0.25, 0, 1.45);
rightArmGroup.rotation.set(-0.25, 0, -1.45);

// Google Maps Pin Marker — held between BOTH hands at chest height
const pinGroup = new THREE.Group();
pinGroup.position.set(0, 0.62, 0.62);
pinGroup.scale.set(0.55, 0.55, 0.55);
robotRoot.add(pinGroup);

// Google Maps Pin Colors
const gRed = new THREE.MeshPhongMaterial({ color: 0xea4335, shininess: 80 });
const gBlue = new THREE.MeshPhongMaterial({ color: 0x4285f4, shininess: 80 });
const gGreen = new THREE.MeshPhongMaterial({ color: 0x34a853, shininess: 80 });
const gYellow = new THREE.MeshPhongMaterial({ color: 0xfbbc05, shininess: 80 });
const gWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

// Pin Head Bulb
const pinHeadGeo = new THREE.SphereGeometry(0.24, 20, 20);
const pinHead = new THREE.Mesh(pinHeadGeo, gRed);
pinGroup.add(pinHead);

// Pin Inner Center Hole / Dot
const pinHoleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.49, 16);
const pinHole = new THREE.Mesh(pinHoleGeo, gWhite);
pinHole.rotation.x = Math.PI / 2;
pinGroup.add(pinHole);

// Pin Taper Point
const pinConeGeo = new THREE.ConeGeometry(0.22, 0.38, 20);
const pinCone = new THREE.Mesh(pinConeGeo, gRed);
pinCone.rotation.x = Math.PI;
pinCone.position.set(0, -0.22, 0);
pinGroup.add(pinCone);

// Stylized Google Colored Quad-Accents around the pin
const quad1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 16, Math.PI * 0.45), gBlue);
quad1.position.z = 0.02;
pinGroup.add(quad1);

const quad2 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 16, Math.PI * 0.45), gGreen);
quad2.rotation.z = Math.PI * 0.5;
quad2.position.z = 0.02;
pinGroup.add(quad2);

const quad3 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 16, Math.PI * 0.45), gYellow);
quad3.rotation.z = Math.PI;
quad3.position.z = 0.02;
pinGroup.add(quad3);

// Interactive State variables
window.__trafficAssistantState = 'idle'; // 'idle', 'listening', 'thinking', 'answering'
window.__setTrafficAssistantState = function(state) {
  window.__trafficAssistantState = state;
  if (state === 'listening') {
    eyeGlowMat.color.setHex(0xfacc15); // amber
    chestCoreMat.color.setHex(0xfacc15);
  } else if (state === 'thinking') {
    eyeGlowMat.color.setHex(0xa855f7); // purple
    chestCoreMat.color.setHex(0xa855f7);
  } else if (state === 'answering') {
    eyeGlowMat.color.setHex(0x10b981); // emerald green
    chestCoreMat.color.setHex(0x10b981);
  } else {
    eyeGlowMat.color.setHex(0x00f2fe); // default cyan
    chestCoreMat.color.setHex(0x38bdf8);
  }
};

window.__setTrafficSeverityColor = function(hexColor) {
  rimLight.color.set(hexColor);
  accentLight.color.set(hexColor);
};

// Entrance animation variables
let entranceTime = 0;
const entranceDuration = 1.6;
robotRoot.position.y = 3.5; // Starts in sky and lands down smoothly
robotRoot.scale.set(0.01, 0.01, 0.01);

// Mouse tracking
let mouseX = 0;
let mouseY = 0;
let targetHeadX = 0;
let targetHeadY = 0;

window.addEventListener('mousemove', (e) => {
  const rect = container.getBoundingClientRect();
  const x = e.clientX - (rect.left + rect.width / 2);
  const y = e.clientY - (rect.top + rect.height / 2);
  mouseX = (x / (window.innerWidth * 0.5)) * 0.4;
  mouseY = (y / (window.innerHeight * 0.5)) * 0.3;
});

// Clicking the robot triggers a playful hop — the surrounding widget
// (inline onclick in index.html) opens the AI chat panel.
let clickBounce = 0;
container.addEventListener('click', () => {
  clickBounce = 1;
});

// Render Loop
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Entrance Landing Animation
  if (entranceTime < entranceDuration) {
    entranceTime += delta;
    const progress = Math.min(1, entranceTime / entranceDuration);
    // Smooth elastic bounce landing
    const easeOutBack = (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const tEased = easeOutBack(progress);
    robotRoot.position.y = THREE.MathUtils.lerp(3.5, 0, Math.min(1, progress * 1.1));
    const s = Math.min(1, tEased);
    robotRoot.scale.set(s, s, s);
  } else {
    // Grounded idle: subtle anti-gravity float with a slow body sway
    robotRoot.position.y = -0.02 + Math.sin(time * 2.2) * 0.03;
    robotRoot.rotation.y = Math.sin(time * 0.6) * 0.06;
  }

  // Head tracking
  targetHeadX = THREE.MathUtils.lerp(targetHeadX, mouseX, 0.08);
  targetHeadY = THREE.MathUtils.lerp(targetHeadY, -mouseY, 0.08);
  headGroup.rotation.y = targetHeadX + Math.sin(time * 1.5) * 0.05;
  headGroup.rotation.x = Math.max(-0.25, Math.min(0.25, targetHeadY + Math.cos(time * 1.8) * 0.03));

  // Both arms cradle the Google Maps pin — matching phases keep the hands on it
  const armSway = Math.sin(time * 1.6);
  const presentLift = Math.sin(time * 0.8) * 0.5 + 0.5; // slow 0..1 presenting rhythm
  leftArmGroup.rotation.x = -0.25 + armSway * 0.03 - presentLift * 0.05;
  rightArmGroup.rotation.x = -0.25 + armSway * 0.03 - presentLift * 0.05;
  leftArmGroup.rotation.z = 1.45 + Math.sin(time * 1.6) * 0.035;
  rightArmGroup.rotation.z = -1.45 - Math.sin(time * 1.6) * 0.035;
  leftForearmGroup.rotation.x = Math.sin(time * 2.0) * 0.05;
  rightForearmGroup.rotation.x = Math.sin(time * 2.0) * 0.05;

  // Pin: presented between the palms with a gentle yaw and tilt
  pinGroup.rotation.y = Math.sin(time * 0.9) * 0.45;
  pinGroup.rotation.z = Math.sin(time * 1.3) * 0.06;
  pinGroup.position.y = 0.62 + Math.sin(time * 2.2) * 0.012 + presentLift * 0.02;

  // Legs: gentle walking-in-place loop with heel-lift on the push-off leg
  const step = time * 2.6;
  leftLeg.legGroup.rotation.x = Math.sin(step) * 0.16;
  rightLeg.legGroup.rotation.x = Math.sin(step + Math.PI) * 0.16;
  leftLeg.shinGroup.rotation.x = Math.max(0, Math.sin(step)) * 0.42;
  rightLeg.shinGroup.rotation.x = Math.max(0, -Math.sin(step)) * 0.42;

  // Eye blink every few seconds (scale.x squishes the visor capsules vertically)
  const blinkCycle = time % 3.8;
  const blink = blinkCycle > 3.5 ? Math.abs(Math.cos(((blinkCycle - 3.5) / 0.3) * Math.PI)) : 1;
  leftEye.scale.x = blink;
  rightEye.scale.x = blink;

  // Hover ring pulse
  hoverRing.scale.setScalar(1 + Math.sin(time * 4) * 0.08);

  // States handling
  const st = window.__trafficAssistantState;
  if (st === 'thinking') {
    headGroup.rotation.z = Math.sin(time * 6) * 0.12;
    coreSphere.scale.setScalar(1 + Math.sin(time * 12) * 0.25);
  } else if (st === 'listening') {
    headGroup.rotation.z = 0.15;
    coreSphere.scale.setScalar(1.2);
  } else if (st === 'answering') {
    // Cheerful double-arm raise presenting the pin
    const cheer = Math.sin(time * 5) * 0.5 + 0.5;
    leftArmGroup.rotation.x = -0.25 - cheer * 0.22;
    rightArmGroup.rotation.x = -0.25 - cheer * 0.22;
    pinGroup.position.y = 0.62 + cheer * 0.05;
    robotRoot.position.y += Math.sin(time * 5) * 0.03;
  } else {
    headGroup.rotation.z = 0;
    coreSphere.scale.setScalar(1 + Math.sin(time * 2) * 0.08);
  }

  // Click reaction: small hop when the robot is clicked (opens the chat too)
  if (clickBounce > 0) {
    clickBounce = Math.max(0, clickBounce - delta * 1.4);
    robotRoot.position.y += Math.sin(clickBounce * Math.PI) * 0.16;
  }

  renderer.render(scene, camera);
}

animate();

// Resize listener
window.addEventListener('resize', () => {
  const newW = container.clientWidth || 280;
  const newH = container.clientHeight || 280;
  camera.aspect = newW / newH;
  camera.updateProjectionMatrix();
  renderer.setSize(newW, newH);
});
}
