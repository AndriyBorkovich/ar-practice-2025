import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODE = "immersive-ar";

async function activateXR(): Promise<void> {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  const gl = canvas.getContext("webgl2", { xrCompatible: true });
  if (!gl) throw new Error("WebGL not supported");

  // Create a new THREE.Scene
  const scene = new THREE.Scene();

  // initialize materials
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
    new THREE.MeshBasicMaterial({ color: 0x0000ff }),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
    new THREE.MeshBasicMaterial({ color: 0x00ffff }),
    new THREE.MeshBasicMaterial({ color: 0xffff00 }),
  ];

  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), materials);
  // set cube position
  cube.position.set(1, 1, 1);
  // add cube to scene
  scene.add(cube);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight.position.set(10, 15, 10);
  scene.add(directionalLight);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    preserveDrawingBuffer: true,
    canvas: canvas,
    context: gl,
  });
  renderer.autoClear = false;

  // Create a new THREE.PerspectiveCamera
  const camera = new THREE.PerspectiveCamera();
  camera.matrixAutoUpdate = false;

  if (!navigator.xr) {
    throw new Error("WebXR is not supported by your browser");
  }

  try {
    const supported = await navigator.xr.isSessionSupported(MODE);
    if (!supported) {
      throw new Error(`${MODE} mode is not supported by your browser/device`);
    }
  } catch (e) {
    throw new Error("Error checking WebXR support: " + e);
  }

  const session = await navigator.xr.requestSession(MODE, {
    requiredFeatures: ["local", "hit-test"],
  });

  // Create a new XRWebGLLayer
  const baseLayer = new XRWebGLLayer(session, gl);
  session.updateRenderState({
    baseLayer,
  });

  const referenceSpaceTypes: XRReferenceSpaceType[] = [
    "local",
    "local-floor",
    "bounded-floor",
    "unbounded",
    "viewer",
  ];

  let referenceSpace: XRReferenceSpace | null = null;
  let hitTestSource: XRHitTestSource | undefined = undefined;

  const viewerSpace = await session.requestReferenceSpace("viewer");
  if (session.requestHitTestSource) {
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  }

  // observe how reference space types and request reference space
  // are applied to the scene
  for (const spaceType of referenceSpaceTypes) {
    try {
      // request reference space
      referenceSpace = await session.requestReferenceSpace(spaceType);
      console.log("Reference space established:", spaceType);
      break;
    } catch (e) {
      console.log(e);
      console.log("Reference space failed:", spaceType);
      continue;
    }
  }

  if (!referenceSpace) {
    throw new Error("No reference space could be established");
  }

  const loader = new GLTFLoader();
  let reticle: any;
  loader.load(
    "https://immersive-web.github.io/webxr-samples/media/gltf/reticle/reticle.gltf",
    function (gltf: any) {
      reticle = gltf.scene;
      reticle.visible = false;
      scene.add(reticle);
    }
  );
  let model: any;
  loader.load(
    "https://immersive-web.github.io/webxr-samples/media/gltf/space/space.gltf",
    function (gltf: any) {
      model = gltf.scene;
    }
  );

  session.addEventListener("select", (event) => {
    if (model) {
      const clone = model.clone();
      clone.position.copy(reticle.position);
      scene.add(clone);
    }
  });

  // Create a render loop that allows us to draw on the AR view.
  const onXRFrame = (time: number, frame: XRFrame) => {
    // Queue up the next draw request.
    session.requestAnimationFrame(onXRFrame);

    const baseLayer = session.renderState.baseLayer;
    if (!baseLayer) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);

    const pose = frame.getViewerPose(referenceSpace);
    if (pose) {
      const view = pose.views[0];

      const viewport = baseLayer.getViewport(view);
      if (!viewport) return;
      renderer.setSize(viewport.width, viewport.height);

      // Use the view's transform matrix and projection matrix to configure the THREE.camera.
      camera.matrix.fromArray(view.transform.matrix);
      camera.projectionMatrix.fromArray(view.projectionMatrix);
      camera.updateMatrixWorld(true);

      if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0 && reticle) {
          const hitPose = hitTestResults[0].getPose(referenceSpace);
          reticle.visible = true;
          reticle.position.set(
            hitPose?.transform.position.x,
            hitPose?.transform.position.y,
            hitPose?.transform.position.z
          );
          reticle.updateMatrixWorld(true);
        }
      }

      // Render the scene with THREE.WebGLRenderer.
      renderer.render(scene, camera);
    }
  };

  session.requestAnimationFrame(onXRFrame);
}

// Make the function available globally
(window as any).activateXR = activateXR;
