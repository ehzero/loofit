import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Object3D } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CAMERA,
  CANVAS,
  CARD_SPECS,
  DEFAULT_VIEW_CONTROLS,
  PHONE_MODEL,
  SCREENSHOT_LAYOUT,
  STAGE,
  type ShowcaseCardSpec,
  type ShowcaseState,
  type ShowcaseViewControls,
} from '../config';
import { createRoundedPrismGeometry } from './geometry';
import { createCardSurface, paletteFor, type CardSurface } from './textures';

const LIGHT_TARGET_LOCAL = new Vector3(60, -40, 0);
const LIGHT_DIRECTION_DISTANCE = 6000;
const SHADOW_REFERENCE_HEIGHT = 24;
const SCREEN_BASIS_SAMPLE = 100;
const TONE_MAPPING_EXPOSURE = 0.92;
const BACK_SURFACE_EPSILON = 1e-6;

interface SurfaceEntry {
  surface: CardSurface;
  material: MeshBasicMaterial | MeshStandardMaterial;
  isWidget: boolean;
}

interface CardMeshEntry {
  spec: ShowcaseCardSpec;
  group: Group;
  body: Mesh;
}

interface ImportedPhoneEntry {
  group: Group;
  model: Group;
  baseScale: number;
  modelGroundZ: number;
}

function disposeMaterialResources(material: Material): void {
  const textures = new Set<Texture>();
  Object.values(material).forEach((value) => {
    if (value instanceof Texture) textures.add(value);
  });
  textures.forEach((texture) => texture.dispose());
  material.dispose();
}

export class ShowcaseThreeScene {
  readonly ready: Promise<void>;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly content = new Group();
  private readonly tiltGroup = new Group();
  private readonly azimuthGroup = new Group();
  private readonly surfaces = new Map<string, SurfaceEntry>();
  private readonly cardMeshes = new Map<string, CardMeshEntry>();
  private readonly widgetMaterial: MeshStandardMaterial;
  private readonly shadowMaterial: ShadowMaterial;
  private readonly keyLight: DirectionalLight;
  private readonly environmentTexture: Texture;
  private importedPhone?: ImportedPhoneEntry;
  private state: ShowcaseState;
  private viewControls: ShowcaseViewControls;
  private panelCroppingEnabled = true;

  constructor(canvas: HTMLCanvasElement, initialState: ShowcaseState) {
    this.state = { ...initialState };
    this.viewControls = { ...DEFAULT_VIEW_CONTROLS };
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(CANVAS.width, CANVAS.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const roomEnvironment = new RoomEnvironment();
    const environmentGenerator = new PMREMGenerator(this.renderer);
    this.environmentTexture = environmentGenerator.fromScene(roomEnvironment, 0.04).texture;
    this.scene.environment = this.environmentTexture;
    roomEnvironment.dispose();
    environmentGenerator.dispose();

    this.camera = this.createCamera();
    this.widgetMaterial = new MeshStandardMaterial({
      color: 0xfbfbfa,
      metalness: 0,
      roughness: 0.68,
      envMapIntensity: 0.35,
    });
    this.shadowMaterial = new ShadowMaterial({
      color: 0x252c35,
      opacity: 0.25,
      transparent: true,
    });
    this.keyLight = this.createLighting();

    this.ready = this.createStage();
    this.applyViewControls();
    this.applyTheme();
    this.render();
  }

  private createCamera(): PerspectiveCamera {
    const fieldOfView = MathUtils.radToDeg(
      2 * Math.atan(STAGE.height / (2 * this.viewControls.cameraDistance))
    );
    const camera = new PerspectiveCamera(
      fieldOfView,
      this.cameraFrameWidth() / SCREENSHOT_LAYOUT.panelHeight,
      100,
      30000
    );
    const originOffset = STAGE.height * (0.5 - CAMERA.perspectiveOriginY);
    camera.zoom = this.viewControls.cameraZoom;
    camera.position.set(0, originOffset, this.viewControls.cameraDistance);
    camera.lookAt(0, originOffset, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  private cameraFrameWidth(): number {
    return this.panelCroppingEnabled
      ? SCREENSHOT_LAYOUT.virtualWidth
      : CANVAS.width;
  }

  private createLighting(): DirectionalLight {
    // RoomEnvironment supplies the indirect light. Keep one directional key
    // light for plane definition and shadows instead of stacking fill lights.
    const keyLight = new DirectionalLight(0xffffff, 1);
    keyLight.position.set(0, 0, LIGHT_DIRECTION_DISTANCE);
    keyLight.intensity = this.viewControls.lightIntensity;
    keyLight.target.position.copy(LIGHT_TARGET_LOCAL);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.left = -1500;
    keyLight.shadow.camera.right = 1500;
    keyLight.shadow.camera.top = 1350;
    keyLight.shadow.camera.bottom = -1350;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 7000;
    keyLight.shadow.bias = -0.00008;
    keyLight.shadow.normalBias = 1.2;
    keyLight.shadow.radius = 5;
    this.scene.add(keyLight, keyLight.target);
    return keyLight;
  }

  private createStage(): Promise<void> {
    this.tiltGroup.name = 'camera-tilt';
    this.azimuthGroup.name = 'camera-azimuth';
    this.azimuthGroup.scale.setScalar(STAGE.scale);
    this.azimuthGroup.add(this.content);
    this.tiltGroup.add(this.azimuthGroup);
    this.scene.add(this.tiltGroup);

    const ground = new Mesh(
      new PlaneGeometry(STAGE.width * 1.75, STAGE.height * 1.75),
      this.shadowMaterial
    );
    ground.name = 'shadow-catcher';
    ground.position.z = -1;
    ground.receiveShadow = true;
    this.content.add(ground);

    const anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    CARD_SPECS.filter((spec) => spec.kind !== 'phone').forEach((spec) => {
      this.content.add(this.createCard(spec, anisotropy));
    });
    const phoneSpec = CARD_SPECS.find((spec) => spec.kind === 'phone');
    if (!phoneSpec) return Promise.reject(new Error('Phone showcase spec is missing.'));
    return this.loadImportedPhone(phoneSpec, anisotropy);
  }

  private createCard(spec: ShowcaseCardSpec, anisotropy: number): Group {
    const depth = spec.depth * this.viewControls.meshDepthScale;
    const radius = spec.radius * this.viewControls.cornerRadiusScale;
    const card = new Group();
    card.name = `card:${spec.id}`;
    card.position.set(
      spec.x + spec.width / 2 - STAGE.width / 2,
      STAGE.height / 2 - (spec.y + spec.height / 2),
      this.viewControls.meshZ
    );

    const surface = createCardSurface(spec, this.state, anisotropy);
    const surfaceMaterial = this.createWidgetSurfaceMaterial(surface);
    const body = new Mesh(
      createRoundedPrismGeometry({
        width: spec.width,
        height: spec.height,
        depth,
        radius,
        segments: 8,
      }),
      [
        this.widgetMaterial,
        this.widgetMaterial,
        this.widgetMaterial,
        this.widgetMaterial,
        surfaceMaterial,
        this.widgetMaterial,
      ]
    );
    body.name = `${spec.id}:rounded-body`;
    body.position.z = depth / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.renderOrder = 10;
    card.add(body);

    this.surfaces.set(spec.id, {
      surface,
      material: surfaceMaterial,
      isWidget: true,
    });

    this.cardMeshes.set(spec.id, { spec, group: card, body });
    return card;
  }

  private async loadImportedPhone(
    spec: ShowcaseCardSpec,
    anisotropy: number
  ): Promise<void> {
    const group = new Group();
    group.name = `card:${spec.id}`;
    group.position.set(
      spec.x + spec.width / 2 - STAGE.width / 2,
      STAGE.height / 2 - (spec.y + spec.height / 2),
      this.viewControls.meshZ
    );
    this.content.add(group);

    const surface = createCardSurface(spec, this.state, anisotropy);
    surface.texture.flipY = false;
    surface.texture.needsUpdate = true;
    const surfaceMaterial = new MeshBasicMaterial({
      map: surface.texture,
      toneMapped: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    surfaceMaterial.name = 'Loofit_HomeScreen';
    this.surfaces.set(spec.id, {
      surface,
      material: surfaceMaterial,
      isWidget: false,
    });

    const { scene: model } = await new GLTFLoader().loadAsync(PHONE_MODEL.url);
    model.name = 'iphone-17-pro-max-silver';
    let screenMeshes = 0;
    const backSurfaceMeshes: Mesh[] = [];
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const originalMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (originalMaterials.some(({ name }) => name === PHONE_MODEL.backSurfaceMaterial)) {
        backSurfaceMeshes.push(object);
      }
      const hasScreenMaterial = originalMaterials.some(
        ({ name }) => name === PHONE_MODEL.screenMaterial
      );
      const replaceScreenMaterial = (material: Material): Material => {
        if (material instanceof MeshStandardMaterial) {
          material.envMapIntensity = PHONE_MODEL.environmentIntensity;
          if (material.name === PHONE_MODEL.frameMaterial) {
            material.color.set(PHONE_MODEL.frameColors[this.state.theme]);
            material.metalness = PHONE_MODEL.metalness;
            material.roughness = PHONE_MODEL.roughness;
          }
        }
        if (material.name !== PHONE_MODEL.screenMaterial) return material;
        screenMeshes += 1;
        disposeMaterialResources(material);
        return surfaceMaterial;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(replaceScreenMaterial)
        : replaceScreenMaterial(object.material);
      if (hasScreenMaterial) {
        object.castShadow = false;
        object.receiveShadow = false;
        object.renderOrder = 100;
      }
    });
    if (screenMeshes === 0) {
      throw new Error(`Phone screen material not found: ${PHONE_MODEL.screenMaterial}`);
    }

    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true);
    const backSurfaceBounds = new Box3();
    backSurfaceMeshes.forEach((mesh) => backSurfaceBounds.expandByObject(mesh, true));
    const modelGroundZ = backSurfaceBounds.isEmpty()
      ? bounds.max.z
      : backSurfaceBounds.max.z;
    this.removeRearCameraGeometry(model, modelGroundZ);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const baseScale = spec.height / size.y;
    // The model faces away from the showcase camera. A 180-degree Y rotation
    // turns it around without introducing the mirrored coordinate system that
    // a negative Z scale would create. X centering is therefore inverted too.
    model.position.x = center.x * baseScale;
    model.position.y = -center.y * baseScale;
    group.add(model);
    this.importedPhone = {
      group,
      model,
      baseScale,
      modelGroundZ,
    };
    this.applyImportedPhoneTransform();
    this.render();
  }

  private removeRearCameraGeometry(model: Group, backSurfaceZ: number): void {
    model.updateMatrixWorld(true);
    const modelWorldInverse = model.matrixWorld.clone().invert();
    const rearCameraMaterials = new Set<string>(PHONE_MODEL.rearCameraMaterials);

    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some(({ name }) => rearCameraMaterials.has(name))) {
        object.visible = false;
        object.castShadow = false;
        object.receiveShadow = false;
        return;
      }

      const meshToModel = new Matrix4().multiplyMatrices(
        modelWorldInverse,
        object.matrixWorld
      );
      const modelToMesh = meshToModel.clone().invert();
      const geometry = object.geometry.clone();
      const position = geometry.getAttribute('position');
      const vertex = new Vector3();
      let flattened = false;

      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(meshToModel);
        if (vertex.z <= backSurfaceZ + BACK_SURFACE_EPSILON) continue;
        vertex.z = backSurfaceZ;
        vertex.applyMatrix4(modelToMesh);
        position.setXYZ(index, vertex.x, vertex.y, vertex.z);
        flattened = true;
      }

      if (!flattened) {
        geometry.dispose();
        return;
      }

      object.geometry = geometry;
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    });
  }

  private createWidgetSurfaceMaterial(surface: CardSurface): MeshBasicMaterial {
    const material = new MeshBasicMaterial({
      color: paletteFor(this.state).card,
      map: surface.texture,
      toneMapped: false,
    });

    // The canvas only contains widget content. Blend its alpha over the lit
    // material color so the rounded mesh owns the background and highlights.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 widgetContent = texture2D(map, vMapUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, widgetContent.rgb, widgetContent.a);
        #endif`
      );
    };
    material.customProgramCacheKey = () => 'widget-content-overlay-v1';
    return material;
  }

  private applyTheme(): void {
    const palette = paletteFor(this.state);
    this.widgetMaterial.color.set(palette.card);
    this.surfaces.forEach(({ material, isWidget }) => {
      if (!isWidget) return;
      material.color.set(palette.card);
    });
    this.applyPhoneFrameTheme();
    this.shadowMaterial.color.set(this.state.theme === 'dark' ? '#000000' : '#252c35');
    this.shadowMaterial.opacity = this.state.theme === 'dark' ? 0.46 : 0.25;
  }

  private applyPhoneFrameTheme(): void {
    if (!this.importedPhone) return;
    this.importedPhone.model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (
          material instanceof MeshStandardMaterial &&
          material.name === PHONE_MODEL.frameMaterial
        ) {
          material.color.set(PHONE_MODEL.frameColors[this.state.theme]);
        }
      });
    });
  }

  private applyViewControls(): void {
    // CSS uses a downward-positive Y axis, while Three.js uses upward-positive Y.
    // Negate both rotations when translating the reference CSS camera axes.
    this.tiltGroup.rotation.x = MathUtils.degToRad(-this.viewControls.cameraTilt);
    this.azimuthGroup.rotation.z = MathUtils.degToRad(-this.viewControls.cameraAzimuth);

    const distance = this.viewControls.cameraDistance;
    const fieldOfView = MathUtils.radToDeg(2 * Math.atan(STAGE.height / (2 * distance)));
    const originOffset = STAGE.height * (0.5 - CAMERA.perspectiveOriginY);
    this.camera.fov = fieldOfView;
    this.camera.aspect = this.cameraFrameWidth() / CANVAS.height;
    this.camera.zoom = this.viewControls.cameraZoom;
    this.camera.far = Math.max(30000, distance * 2.5);
    this.camera.position.set(0, originOffset, distance);
    this.camera.lookAt(0, originOffset, 0);
    this.camera.updateProjectionMatrix();

    this.applyScreenSpaceShadowDirection();
    this.keyLight.intensity = this.viewControls.lightIntensity;
    this.keyLight.shadow.radius = this.viewControls.shadowRadius;
    const lightDistance = this.keyLight.position.distanceTo(this.keyLight.target.position);
    this.keyLight.shadow.camera.far = Math.max(7000, lightDistance + 2500);
    this.keyLight.shadow.camera.updateProjectionMatrix();
    this.keyLight.shadow.needsUpdate = true;
  }

  private applyScreenSpaceShadowDirection(): void {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);

    const originWorld = this.content.localToWorld(new Vector3(0, 0, 0));
    const xWorld = this.content.localToWorld(new Vector3(SCREEN_BASIS_SAMPLE, 0, 0));
    const yWorld = this.content.localToWorld(new Vector3(0, SCREEN_BASIS_SAMPLE, 0));
    const originScreen = originWorld.clone().project(this.camera);
    const xScreen = xWorld.project(this.camera).sub(originScreen);
    const yScreen = yWorld.project(this.camera).sub(originScreen);

    const angle = MathUtils.degToRad(this.viewControls.shadowDirection);
    const desiredX = Math.cos(angle);
    const desiredY = -Math.sin(angle);
    const determinant = xScreen.x * yScreen.y - xScreen.y * yScreen.x;
    if (Math.abs(determinant) < 1e-8) return;

    const localX = (desiredX * yScreen.y - desiredY * yScreen.x) / determinant;
    const localY = (xScreen.x * desiredY - xScreen.y * desiredX) / determinant;
    const groundDirection = new Vector3(localX, localY, 0)
      .normalize()
      .transformDirection(this.content.matrixWorld);
    const groundNormal = new Vector3(0, 0, 1)
      .transformDirection(this.content.matrixWorld);
    const rayDirection = groundDirection
      .multiplyScalar(this.viewControls.shadowSpread)
      .addScaledVector(groundNormal, -SHADOW_REFERENCE_HEIGHT)
      .normalize();

    const targetWorld = this.content.localToWorld(LIGHT_TARGET_LOCAL.clone());
    this.keyLight.target.position.copy(targetWorld);
    this.keyLight.position
      .copy(targetWorld)
      .addScaledVector(rayDirection, -LIGHT_DIRECTION_DISTANCE);
    this.keyLight.target.updateMatrixWorld(true);
  }

  private applyMeshControls(rebuildGeometry: boolean): void {
    const depthScale = this.viewControls.meshDepthScale;
    const radiusScale = this.viewControls.cornerRadiusScale;

    this.cardMeshes.forEach(({ spec, group, body }) => {
      group.position.z = this.viewControls.meshZ;
      if (!rebuildGeometry) return;

      const depth = spec.depth * depthScale;
      body.geometry.dispose();
      body.geometry = createRoundedPrismGeometry({
        width: spec.width,
        height: spec.height,
        depth,
        radius: spec.radius * radiusScale,
        segments: 8,
      });
      body.position.z = depth / 2;
    });
    this.applyImportedPhoneTransform();
    this.keyLight.shadow.needsUpdate = true;
  }

  private applyImportedPhoneTransform(): void {
    if (!this.importedPhone) return;
    const { group, model, baseScale, modelGroundZ } = this.importedPhone;
    group.position.z = this.viewControls.meshZ;
    model.scale.setScalar(baseScale);
    model.rotation.y = Math.PI;
    model.position.z = modelGroundZ * baseScale;
    model.updateMatrixWorld(true);
  }

  setState(next: Partial<ShowcaseState>): void {
    this.state = { ...this.state, ...next };
    this.applyTheme();
    this.surfaces.forEach(({ surface }) => surface.redraw(this.state));
    this.render();
  }

  setViewControls(next: Partial<ShowcaseViewControls>): void {
    const rebuildGeometry =
      next.meshDepthScale !== undefined || next.cornerRadiusScale !== undefined;
    const repositionMeshes = rebuildGeometry || next.meshZ !== undefined;
    this.viewControls = { ...this.viewControls, ...next };
    this.applyViewControls();
    if (repositionMeshes) this.applyMeshControls(rebuildGeometry);
    this.render();
  }

  setPanelCropping(enabled: boolean): void {
    if (this.panelCroppingEnabled === enabled) return;
    this.panelCroppingEnabled = enabled;
    this.applyViewControls();
    this.render();
  }

  refreshTextures(): void {
    this.surfaces.forEach(({ surface }) => surface.redraw(this.state));
    this.render();
  }

  render(): void {
    if (!this.panelCroppingEnabled) {
      this.camera.clearViewOffset();
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, CANVAS.width, CANVAS.height);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const previousAutoClear = this.renderer.autoClear;
    const previousShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    this.renderer.autoClear = false;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, CANVAS.width, CANVAS.height);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);

    try {
      SCREENSHOT_LAYOUT.sourceOffsets.forEach((sourceX, panel) => {
        const outputX = panel * SCREENSHOT_LAYOUT.panelWidth;
        this.renderer.setViewport(
          outputX,
          0,
          SCREENSHOT_LAYOUT.panelWidth,
          SCREENSHOT_LAYOUT.panelHeight
        );
        this.renderer.setScissor(
          outputX,
          0,
          SCREENSHOT_LAYOUT.panelWidth,
          SCREENSHOT_LAYOUT.panelHeight
        );
        this.camera.setViewOffset(
          SCREENSHOT_LAYOUT.virtualWidth,
          SCREENSHOT_LAYOUT.panelHeight,
          sourceX,
          0,
          SCREENSHOT_LAYOUT.panelWidth,
          SCREENSHOT_LAYOUT.panelHeight
        );
        // The first panel refreshes the shared shadow map. Later panels reuse it
        // so the three independent camera windows keep identical lighting.
        this.renderer.shadowMap.autoUpdate = previousShadowAutoUpdate && panel === 0;
        this.renderer.render(this.scene, this.camera);
      });
    } finally {
      this.camera.clearViewOffset();
      this.renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, CANVAS.width, CANVAS.height);
      this.renderer.autoClear = previousAutoClear;
    }
  }

  dispose(): void {
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    const surfaceTextures = new Set<Texture>(
      Array.from(this.surfaces.values(), ({ surface }) => surface.texture)
    );
    this.content.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      objectMaterials.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value instanceof Texture && !surfaceTextures.has(value)) textures.add(value);
        });
      });
    });
    this.surfaces.forEach(({ surface, material }) => {
      surface.dispose();
      materials.add(material);
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    this.environmentTexture.dispose();
    this.renderer.dispose();
  }
}
