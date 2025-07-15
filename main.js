import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/EXRLoader.js';
import { Water } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/objects/Water.js';


class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
};


class BasicCharacterController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
    this._velocity = new THREE.Vector3(0, 0, 0);

    this._animations = {};
    this._input = new BasicCharacterControllerInput();
    this._stateMachine = new CharacterFSM(
      new BasicCharacterControllerProxy(this._animations));

    this._LoadModels();
  }
  get Position() {
    return this._target.position;
  }

  get Rotation() {
    return this._target.quaternion;
  }

  _LoadModels() {
    const loader = new FBXLoader();
    loader.setPath('./resources/player/');
    loader.load('Paladin J Nordstrom.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      this._target = fbx;
      this._params.scene.add(this._target);

      this._mixer = new THREE.AnimationMixer(this._target);

      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState('idle');
      };

      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0];
        const action = this._mixer.clipAction(clip);

        this._animations[animName] = {
          clip: clip,
          action: action,
        };
      };

      const loader = new FBXLoader(this._manager);
      loader.setPath('./resources/player/');
      loader.load('Walking.fbx', (a) => { _OnLoad('walk', a); });
      loader.load('Running.fbx', (a) => { _OnLoad('run', a); });
      loader.load('Idle.fbx', (a) => { _OnLoad('idle', a); });
    });
  }

  Update(timeInSeconds) {
    if (!this._target) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
      velocity.x * this._decceleration.x,
      velocity.y * this._decceleration.y,
      velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
      Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._input._keys.shift) {
      acc.multiplyScalar(2.0);
    }

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }
    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);

    oldPosition.copy(controlObject.position);

    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
};

class BasicCharacterControllerInput {
  constructor() {
    this._Init();
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
      shift: false,
    };
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};

class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;

    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
};

class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState('idle', IdleState);
    this._AddState('walk', WalkState);
    this._AddState('run', RunState);
  }
};

class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() { }
  Exit() { }
  Update() { }
};

class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'run') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState('run');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift) {
        this._parent.SetState('walk');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'idle';
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations['idle'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.5, true);
      idleAction.play();
    } else {
      idleAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      this._parent.SetState('walk');
    }
  }
};

class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 20, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(0, 10, 50);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // const t = 0.05;
    // const t = 4.0 * timeElapsed;
    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}

class Application {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);
    this._threejs.toneMapping = THREE.ACESFilmicToneMapping;
    this._threejs.toneMappingExposure = 1;

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);
    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
    });
    this._scene = new THREE.Scene();

    let directionalLight = new THREE.DirectionalLight(0xff8c66, 0.8);
    directionalLight.position.set(100, 35, 50);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500.0;
    directionalLight.shadow.camera.left = 100;
    directionalLight.shadow.camera.right = -100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this._scene.add(directionalLight);
    this._directionalLight = directionalLight;

    let ambientLight = new THREE.AmbientLight(0xc92e3b, 0.3);
    this._scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xfc032c, 12);
    spotLight.position.set(0, 10, 550);
    spotLight.angle = Math.PI / 8;
    spotLight.penumbra = 0.8;
    spotLight.decay = 2;
    spotLight.distance = 500;
    spotLight.castShadow = false;
    const spotLightTarget = new THREE.Object3D();
    spotLightTarget.position.set(0, 5, -30);
    this._scene.add(spotLightTarget);
    spotLight.target = spotLightTarget;
    this._scene.add(spotLight);

    const controls = new OrbitControls(
      this._camera, this._threejs.domElement);
    controls.target.set(0, 10, 0);
    controls.update();

    const exrLoader = new EXRLoader();
    exrLoader.load('./resources/environment/twilight.exr', (texture) => {
      const pmremGenerator = new THREE.PMREMGenerator(this._threejs);
      pmremGenerator.compileEquirectangularShader();
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      this._scene.background = envMap;
      this._scene.environment = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    });

    this._waterFlowSpeed = 2;

    this._mixers = [];
    this._previousRAF = null;

    this._LoadAnimatedModel();
    this._LoadEnvironment();
    this._LoadPoroModel();
    this._CreateWater();

    this._RAF();
    this._CreateRain();
  }

  _LoadPoroModel() {
    const loader = new GLTFLoader();
    loader.load('./resources/poro-lol/source/model.glb', (gltf) => {
      const poroModel = gltf.scene;
      poroModel.position.set(0, 10, 445);
      poroModel.scale.setScalar(10.0);
      poroModel.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
        }
      });
      gltf.scene.rotation.y = Math.PI;
      this._scene.add(poroModel);
    });
  }

  _LoadEnvironment() {
    const loader = new GLTFLoader();
    loader.load('./resources/environment/scene_export.glb', (gltf) => {
      gltf.scene.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.isLight) {
            child.castShadow = true;
            child.shadow.bias = -0.001;
            child.shadow.mapSize.width = 4096;
            child.shadow.mapSize.height = 2048;
          }

          if (child.material && child.material.map) {
            const texture = child.material.map;
            const maxAnisotropy = this._threejs.capabilities.getMaxAnisotropy();
            texture.anisotropy = maxAnisotropy;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(10, 10);
            texture.needsUpdate = true;
          }
        }
      });

      gltf.scene.position.set(0, 1.5, 250);
      gltf.scene.rotation.y = Math.PI;
      gltf.scene.scale.setScalar(15.0);

      this._scene.add(gltf.scene);
      if (gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        this._mixers.push(mixer);
      }
    });
  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene,
    }
    this._controls = new BasicCharacterController(params);
    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
      target: this._controls,
    });
  }

  _LoadAnimatedModelAndPlay(path, modelFile, animFile, offset) {
    const loader = new FBXLoader();
    loader.setPath(path);
    loader.load(modelFile, (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });
      fbx.position.copy(offset);

      const anim = new FBXLoader();
      anim.setPath(path);
      anim.load(animFile, (anim) => {
        const m = new THREE.AnimationMixer(fbx);
        this._mixers.push(m);
        const idle = m.clipAction(anim.animations[0]);
        idle.play();
      });
      this._scene.add(fbx);
    });
  }

  _CreateRain() {
    const rainCount = 10000;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 6); // each line segment has 2 points * 3 coords
    const rainVelocities = new Float32Array(rainCount * 2);
    for (let i = 0; i < rainCount; i++) {
      // Start point of line segment (x, y, z)
      const x = Math.random() * 400 - 200;
      const y = Math.random() * 500;
      const z = Math.random() * 400 - 200;
      // End point is just below start point, to create a vertical line (streak)
      const endY = y - 5;

      // fill start point coords
      rainPositions[i * 6 + 0] = x;
      rainPositions[i * 6 + 1] = y;
      rainPositions[i * 6 + 2] = z;

      // fill end point coords
      rainPositions[i * 6 + 3] = x;
      rainPositions[i * 6 + 4] = endY;
      rainPositions[i * 6 + 5] = z;

      rainVelocities[i * 2 + 0] = 0;
      rainVelocities[i * 2 + 1] = 0;

    }

    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(rainVelocities, 1));
    const rainMaterial = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.6,
    });
    rainMaterial.depthTest = false;
    rainMaterial.depthWrite = false;
    rainMaterial.renderOrder = 999;

    this._rain = new THREE.LineSegments(rainGeometry, rainMaterial);
    this._scene.add(this._rain);
  }

  _UpdateRain(timeElapsed) {
    if (!this._rain) return;

    const positions = this._rain.geometry.attributes.position.array;
    const velocities = this._rain.geometry.attributes.velocity.array;

    for (let i = 0; i < positions.length; i += 3) {
      velocities[i / 3] -= 9.8 * timeElapsed * 0.5; // gravity
      positions[i + 1] += velocities[i / 3] * timeElapsed;

      if (positions[i + 1] < 0) {
        positions[i + 1] = 500;
        velocities[i / 3] = 0;
      }
    }

    this._rain.geometry.attributes.position.needsUpdate = true;
  }

  _CreateWater() {
    const waterGeometry = new THREE.PlaneGeometry(2000, 2000);
    const waterNormals = new THREE.TextureLoader().load('./resources/water_norm.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });

    waterNormals.repeat.set(15, 15);

    this._water = new Water(
      waterGeometry,
      {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: this._directionalLight.position.clone().normalize(),
        sunColor: this._directionalLight.color,
        waterColor: 0xc47e85,
        distortionScale: 100,
        fog: this._scene.fog !== undefined
      }
    );

    this._water.rotation.x = -Math.PI / 2;
    this._water.position.y = 0;
    this._scene.add(this._water);
    this._water.material.uniforms['size'].value = 4.0;
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    if (this._mixers) {
      this._mixers.map(m => m.update(timeElapsedS));
    }

    if (this._controls) {
      this._controls.Update(timeElapsedS);
    }
    this._thirdPersonCamera.Update(timeElapsedS);
    this._UpdateRain(timeElapsedS);

    if (this._water) {
      this._water.material.uniforms['time'].value += timeElapsedS * this._waterFlowSpeed;
    }
  }
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new Application();
});