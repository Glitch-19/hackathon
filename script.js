// Import necessary modules from Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- SCENE SETUP ---

// 1. Scene and Background
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); // Light grey background

// 2. Container
const container = document.getElementById('viewer-container');

// 3. Camera
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.z = 2;

// 4. Renderer
const renderer = new THREE.WebGLRenderer({ antiasias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure correct color output
container.appendChild(renderer.domElement);

// 5. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Slightly brighter ambient light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// 6. Controls (to rotate the model with the mouse)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Adds a smooth inertia effect

// --- MODEL AND TEXTURE LOGIC ---

// 7. Load the 3D Model
const loader = new GLTFLoader();
let tShirtMesh = null; // Backwards compatibility main mesh
let tShirtMeshes = []; // All mesh parts to texture
let debugTexturePlane = null; // Helper plane to verify texture visibility
let testGridTexture = null; // Procedural UV test grid
let lastUserTexture = null; // Remember last real texture when toggling grid

// --- COVER CONFIG ---
// 'wrap' = one copy of image stretched around shirt (cylindrical projection)
// 'tile' = repeat pattern (old behaviour)
const COVER_MODE = 'wrap';
// Force regenerate cylindrical UVs for every mesh (ignores original model UVs)
const FORCE_CYLINDRICAL_UV = true;

// --- Helper: UV Fallback Generation & Diagnostics ---
function logMeshDiagnostics(mesh) {
    if (!mesh) return;
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    console.log('[MeshDiagnostics] name=', mesh.name, 'vertexCount=', geo.attributes.position.count, 'hasUV=', !!geo.attributes.uv, 'uvCount=', geo.attributes.uv ? geo.attributes.uv.count : 0);
    if (geo.attributes.uv) {
        const uvs = geo.attributes.uv.array;
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (let i = 0; i < uvs.length; i += 2) {
            const u = uvs[i];
            const v = uvs[i + 1];
            if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
        console.log(`[MeshDiagnostics] UV Range U:[${minU.toFixed(3)}, ${maxU.toFixed(3)}] V:[${minV.toFixed(3)}, ${maxV.toFixed(3)}]`);
        const uSpan = maxU - minU;
        const vSpan = maxV - minV;
        if (uSpan < 0.001 || vSpan < 0.001) {
            console.warn('[MeshDiagnostics] Degenerate UV range detected; regenerating fallback UVs.');
            generateFallbackPlanarUVs(geo);
        }
    } else {
        console.warn('[MeshDiagnostics] Mesh has no UVs; generating fallback planar UVs.');
        generateFallbackPlanarUVs(geo);
    }
    console.log('[MeshDiagnostics] BoundingBox min=', bb.min.toArray(), 'max=', bb.max.toArray());
}

// Old function name kept for compatibility, now delegates to cylindrical mapping
function generateFallbackPlanarUVs(geometry) { generateCylindricalUVs(geometry); }

// Cylindrical UV projection (Y axis vertical). One wrap around = one copy of image
function generateCylindricalUVs(geometry) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const posAttr = geometry.attributes.position;
    const count = posAttr.count;
    const uvs = new Float32Array(count * 2);
    const TWO_PI = Math.PI * 2;
    for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        let angle = Math.atan2(z, x); // -PI..PI
        angle = (angle + Math.PI) / TWO_PI; // 0..1
        const v = (y - bb.min.y) / (size.y || 1); // 0..1
        uvs[i * 2] = angle;
        uvs[i * 2 + 1] = THREE.MathUtils.clamp(v, 0, 1);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    console.log('[UVCyl] Generated cylindrical UVs vertices=', count);
}

function createOrGetTestGridTexture() {
    if (testGridTexture) return testGridTexture;
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,size,size);
    const steps = 16;
    for (let y=0; y<steps; y++) {
        for (let x=0; x<steps; x++) {
            ctx.fillStyle = (x+y)%2===0 ? '#ff5c5c' : '#2d6cdf';
            const cell = size/steps;
            ctx.fillRect(x*cell, y*cell, cell, cell);
        }
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(0,0,size,size);
    ctx.fillStyle = '#000';
    ctx.font = '32px monospace';
    ctx.fillText('UV TEST GRID', 20, size-20);
    testGridTexture = new THREE.CanvasTexture(canvas);
    testGridTexture.wrapS = THREE.RepeatWrapping;
    testGridTexture.wrapT = THREE.ClampToEdgeWrapping;
    testGridTexture.flipY = false;
    testGridTexture.colorSpace = THREE.SRGBColorSpace;
    console.log('[UVTestGrid] Created procedural test grid texture.');
    return testGridTexture;
}

loader.load(
    'models/t_shirt.glb', // Path to your 3D model
    function (gltf) {
        const model = gltf.scene;
        
        // Traverse the model to find the mesh we want to apply the texture to
        model.traverse((child) => {
            if (child.isMesh) {
                console.log('[ModelLoad] Found mesh candidate:', child.name, 'materialType=', child.material?.type);
                if (!tShirtMesh) {
                    tShirtMesh = child; // pick first by default
                    console.log('[ModelLoad] Selected primary mesh for texturing:', child.name);
                }
                if (FORCE_CYLINDRICAL_UV) generateCylindricalUVs(child.geometry);
                tShirtMeshes.push(child);
                logMeshDiagnostics(child);
            }
        });

    if (!tShirtMesh) {
            console.error("Could not find any mesh in the loaded model.");
            return;
        }

        // Set an initial material. A white base color is best for textures.
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.8
        });
        // Assign a fresh material instance to each mesh to ensure texture shows on all parts
        tShirtMeshes.forEach((m, idx) => {
            m.material = baseMaterial.clone();
            m.material.vertexColors = false;
            m.material.name = `TShirtMaterial_${idx}`;
        });
        console.log('[Material] Assigned new MeshStandardMaterial to', tShirtMeshes.length, 'mesh part(s).');

        scene.add(model);
        
        // Load the initially active texture once the model is ready
        const initialTexturePath = document.querySelector('.swatch.active').dataset.texture;
        updateTexture(initialTexturePath);
    },
    undefined, // onProgress callback (optional)
    function (error) {
        console.error('An error happened while loading the model:', error);
    }
);

// 8. Texture Swapping Logic
const textureLoader = new THREE.TextureLoader();

function updateTexture(texturePath) {
    if (!tShirtMesh) {
        console.warn('updateTexture called before the t-shirt mesh was loaded.');
        return;
    }

    console.log(`Attempting to load and apply texture: ${texturePath}`);

    textureLoader.load(
        texturePath, 
        // onLoad callback
        (texture) => {
            console.log('[Texture] Loaded successfully. size=', texture.image?.width, 'x', texture.image?.height);
            lastUserTexture = texture; // remember last real texture
            
            // These settings are crucial for GLB/GLTF models
            texture.flipY = false; 
            texture.colorSpace = THREE.SRGBColorSpace;

            // Configure wrapping based on COVER_MODE
            if (COVER_MODE === 'wrap') {
                texture.wrapS = THREE.RepeatWrapping; // horizontal seam at U=0/1
                texture.wrapT = THREE.ClampToEdgeWrapping; // no vertical repeat
                texture.repeat.set(1, 1);
            } else { // tile mode
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                tShirtMesh.geometry.computeBoundingBox();
                const bb = tShirtMesh.geometry.boundingBox;
                const size = new THREE.Vector3();
                bb.getSize(size);
                const tileDensity = 1.5;
                const repeatX = Math.max(1, Math.round(size.x * tileDensity));
                const repeatY = Math.max(1, Math.round(size.y * tileDensity));
                texture.repeat.set(repeatX, repeatY);
            }
            console.log(`[Texture] Mode=${COVER_MODE} repeat=${texture.repeat.x},${texture.repeat.y}`);

            // Apply map to all mesh materials (recreate material if map slot not present)
            tShirtMeshes.forEach((m, idx) => {
                if (!m.material || !(m.material instanceof THREE.MeshStandardMaterial)) {
                    m.material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness:0.1, roughness:0.8, vertexColors:false });
                }
                if (FORCE_CYLINDRICAL_UV) generateCylindricalUVs(m.geometry);
                m.material.map = texture;
                m.material.needsUpdate = true;
                console.log(`[Texture] Applied to mesh part #${idx} name=${m.name} material=${m.material.name}`);
            });
            console.log('[Texture] Completed applying texture to all parts.');

// Keyboard toggle for UV test grid (press G)
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'g') {
        if (!tShirtMeshes.length) return;
        const usingGrid = tShirtMeshes[0].material.map === testGridTexture;
        if (usingGrid) {
            if (lastUserTexture) {
                console.log('[UVTestGrid] Restoring last user texture.');
                tShirtMeshes.forEach(m=>{m.material.map = lastUserTexture; m.material.needsUpdate = true;});
            }
        } else {
            const grid = createOrGetTestGridTexture();
            console.log('[UVTestGrid] Applying test grid texture (press G again to restore).');
            tShirtMeshes.forEach(m=>{m.material.map = grid; m.material.needsUpdate = true;});
        }
    }
});

            // Create or update a debug plane with the same texture so we can visually confirm the texture data.
            if (!debugTexturePlane) {
                const planeGeo = new THREE.PlaneGeometry(0.6, 0.6);
                const planeMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
                debugTexturePlane = new THREE.Mesh(planeGeo, planeMat);
                debugTexturePlane.name = 'TextureDebugPlane';
                // Position it slightly to the side / front
                debugTexturePlane.position.set(-1.2, 0.8, 0);
                scene.add(debugTexturePlane);
                console.log('[DebugPlane] Created debug texture plane.');
            } else {
                debugTexturePlane.material.map = texture;
                debugTexturePlane.material.needsUpdate = true;
                console.log('[DebugPlane] Updated existing debug texture plane.');
            }
        },
        undefined, // onProgress callback (optional)
        // onError callback
        (error) => {
            console.error(`An error happened while loading the texture: ${texturePath}`, error);
        }
    );
}

// --- UI AND ANIMATION ---

// 9. UI Event Listeners for Swatches
const swatches = document.querySelectorAll('.swatch');
swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
        // Remove 'active' class from the currently active swatch
        document.querySelector('.swatch.active')?.classList.remove('active');
        // Add 'active' class to the clicked swatch
        swatch.classList.add('active');
        
        // Get the texture path from the 'data-texture' attribute and update the model
        const texturePath = swatch.dataset.texture;
        updateTexture(texturePath);
    });
});

// Procedural pattern generators
function makeCanvas(size=1024) { const c=document.createElement('canvas'); c.width=c.height=size; return c; }

function generateStripesTexture() {
    const c = makeCanvas(1024); const ctx=c.getContext('2d');
    for(let i=0;i<32;i++){ ctx.fillStyle=i%2? '#8a1d1d':'#ffffff'; ctx.fillRect(i*32,0,32,1024);} 
    return new THREE.CanvasTexture(c);
}
function generateCheckerTexture() {
    const c=makeCanvas(512); const ctx=c.getContext('2d'); const s=32; for(let y=0;y<512;y+=s){for(let x=0;x<512;x+=s){ctx.fillStyle=((x+y)/s)%2? '#5c2d8a':'#ffffff'; ctx.fillRect(x,y,s,s);}} return new THREE.CanvasTexture(c);
}
function generateDotsTexture() {
    const c=makeCanvas(512); const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,512,512); ctx.fillStyle='#0b5d2a'; for(let y=16;y<512;y+=48){for(let x=16;x<512;x+=48){ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();}} return new THREE.CanvasTexture(c);
}

function applyGeneratedTexture(tex) {
    tex.flipY=false; tex.colorSpace=THREE.SRGBColorSpace; tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping; tex.repeat.set(1,1);
    tShirtMeshes.forEach((m,idx)=>{ m.material.map=tex; m.material.needsUpdate=true; console.log('[Pattern] Applied to part', idx); });
    lastUserTexture=tex;
}

const patternButtons = document.querySelectorAll('.pattern-gen');
if (!patternButtons.length) {
    console.warn('[UI] No .pattern-gen buttons found in DOM at startup.');
} else {
    console.log('[UI] Pattern buttons found:', patternButtons.length);
    patternButtons.forEach(btn=>{
        btn.style.pointerEvents='auto';
        btn.addEventListener('click', ()=>{
            document.querySelector('.pattern-gen.active')?.classList.remove('active');
            btn.classList.add('active');
            const type=btn.dataset.pattern;
            let tex;
            if(type==='stripes') tex=generateStripesTexture();
            else if(type==='checker') tex=generateCheckerTexture();
            else tex=generateDotsTexture();
            applyGeneratedTexture(tex);
        });
    });
}

// Image buttons (text buttons to load existing artwork images)
const IMAGE_LIST = [
  {label:'Warli 1', path:'artworks/warli1.jpg'},
  {label:'Warli 2', path:'artworks/warli2.jpg'},
  {label:'Madhubani 1', path:'artworks/madhubani1.jpg'},
  {label:'Madhubani 2', path:'artworks/madhubani2.jpg'}
];
let imageButtonsContainer = document.getElementById('image-buttons');
if (!imageButtonsContainer) {
    console.warn('[UI] #image-buttons container missing; creating dynamically.');
    imageButtonsContainer = document.createElement('div');
    imageButtonsContainer.id='image-buttons';
    document.body.appendChild(imageButtonsContainer);
}
let activeImageBtn = null;
if (imageButtonsContainer) {
    console.log('[UI] Creating image buttons:', IMAGE_LIST.length);
    IMAGE_LIST.forEach((img, idx) => {
        const b = document.createElement('button');
        b.className = 'image-btn' + (idx===0 ? ' active' : '');
        if (idx===0) activeImageBtn = b;
        b.textContent = img.label;
        b.dataset.texture = img.path;
        b.addEventListener('click', () => {
            if (activeImageBtn === b) return;
            activeImageBtn?.classList.remove('active');
            b.classList.add('active');
            activeImageBtn = b;
            updateTexture(img.path);
        });
        imageButtonsContainer.appendChild(b);
    });
    // Also add thumbnail style buttons under text buttons
    const thumbsRow = document.createElement('div');
    thumbsRow.style.display='flex';
    thumbsRow.style.gap='8px';
    thumbsRow.style.marginTop='8px';
    IMAGE_LIST.forEach((img, idx) => {
        const t = document.createElement('button');
        t.className='image-thumb-btn'+(idx===0?' active':'');
        t.style.backgroundImage = `url(${img.path})`;
        t.title = img.label;
        t.addEventListener('click', ()=>{
            imageButtonsContainer.querySelectorAll('.image-thumb-btn.active').forEach(a=>a.classList.remove('active'));
            t.classList.add('active');
            updateTexture(img.path);
        });
        thumbsRow.appendChild(t);
    });
    imageButtonsContainer.appendChild(thumbsRow);
}

// Debug: press H to outline UI elements if still hidden
window.addEventListener('keydown', e => {
    if (e.key.toLowerCase()==='h') {
        document.querySelectorAll('#pattern-buttons, #image-buttons, .pattern-gen, .image-btn, .image-thumb-btn').forEach(el=>{
            el.style.outline = el.style.outline? '' : '2px dashed red';
        });
        console.log('[UI] Toggle debug outlines (H).');
    }
});

// 10. Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Required if enableDamping is true
    renderer.render(scene, camera);
}

animate();

// 11. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});