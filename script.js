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

// 7. Product & Texture State
const loader = new GLTFLoader();
let activeProductKey = 'shirt';
let debugTexturePlane = null;
let testGridTexture = null;
let lastUserTexture = null;

const products = {
    shirt:  { path:'models/t_shirt.glb',        group:null, meshes:[], ready:false, uvMode:'cylindrical' },
    cup:    { path:'models/mug_new.glb',        group:null, meshes:[], ready:false, uvMode:'cylindrical', padding:{ top:0.05, bottom:0.05 } },
    laptop: { path:'models/office_laptop.glb',  group:null, meshes:[], ready:false, uvMode:'planar-back', padding:{ margin:0.08 } }
};

const COVER_MODE = 'wrap';
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

// UV helpers
function generateCylindricalUVsPadded(geometry, padTop=0, padBottom=0) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox; const size = new THREE.Vector3(); bb.getSize(size);
    const posAttr = geometry.attributes.position; const count = posAttr.count; const uvs = new Float32Array(count*2);
    const TWO_PI = Math.PI*2; const span = 1 - padTop - padBottom;
    for (let i=0;i<count;i++) {
        const x=posAttr.getX(i), y=posAttr.getY(i), z=posAttr.getZ(i);
        let angle=Math.atan2(z,x); angle=(angle+Math.PI)/TWO_PI;
        let v=(y-bb.min.y)/(size.y||1); v = padBottom + v*span;
        uvs[i*2]=angle; uvs[i*2+1]=THREE.MathUtils.clamp(v,0,1);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs,2));
    console.log('[UVCylPad] verts=', count, 'padTop=', padTop, 'padBottom=', padBottom);
}
function generatePlanarBackUVs(geometry, margin=0) {
    geometry.computeBoundingBox(); const bb=geometry.boundingBox; const size=new THREE.Vector3(); bb.getSize(size);
    const posAttr=geometry.attributes.position; const count=posAttr.count; const uvs=new Float32Array(count*2); const span=1-margin*2;
    for (let i=0;i<count;i++) { let x=posAttr.getX(i); let y=posAttr.getY(i); let u=(x-bb.min.x)/(size.x||1); let v=(y-bb.min.y)/(size.y||1); if (margin>0){u=margin+u*span; v=margin+v*span;} uvs[i*2]=THREE.MathUtils.clamp(u,0,1); uvs[i*2+1]=THREE.MathUtils.clamp(v,0,1);} 
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs,2));
    console.log('[UVPlanarBack] XY verts=', count, 'margin=', margin);
}

function loadProduct(key) {
    const p = products[key]; if (!p || p.ready) return; console.log('[Product] Loading', key);
    loader.load(p.path, gltf => {
        p.group = gltf.scene; p.group.visible = (key===activeProductKey);
        p.group.traverse(child=>{
            if (child.isMesh) {
                p.meshes.push(child);
                if (p.uvMode==='cylindrical') {
                    if (p.padding) generateCylindricalUVsPadded(child.geometry, p.padding.top||0, p.padding.bottom||0); else generateCylindricalUVs(child.geometry);
                } else if (p.uvMode==='planar-back') {
                    generatePlanarBackUVs(child.geometry, p.padding?.margin||0);
                }
                logMeshDiagnostics(child);
                child.material = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.8, metalness:0.1 });
            }
        });
        scene.add(p.group); p.ready=true; console.log('[Product] Ready', key, 'meshes=', p.meshes.length);
        if (key===activeProductKey) {
            const initialTexturePath = document.querySelector('.swatch.active')?.dataset.texture;
            if (initialTexturePath) updateTexture(initialTexturePath);
        }
    }, undefined, err=>console.error('[Product] Load fail', key, err));
}

function switchProduct(newKey) {
    if (!products[newKey] || activeProductKey===newKey) return; const old=products[activeProductKey]; if (old?.group) old.group.visible=false;
    activeProductKey=newKey; const np=products[newKey]; if (!np.ready) loadProduct(newKey); else { np.group.visible=true; if (lastUserTexture) applyTextureToActive(lastUserTexture); }
    document.querySelectorAll('.product-btn').forEach(b=>b.classList.toggle('active', b.dataset.product===activeProductKey));
}

// Kick off loads
loadProduct('shirt'); setTimeout(()=>{ loadProduct('cup'); loadProduct('laptop'); }, 400);

// 8. Texture Swapping Logic
const textureLoader = new THREE.TextureLoader();

function applyTextureToActive(tex) {
    const p = products[activeProductKey]; if (!p?.meshes.length) return;
    p.meshes.forEach((m,i)=>{
        if (p.uvMode==='cylindrical' && FORCE_CYLINDRICAL_UV) {
            if (p.padding) generateCylindricalUVsPadded(m.geometry, p.padding.top||0, p.padding.bottom||0); else generateCylindricalUVs(m.geometry);
        } else if (p.uvMode==='planar-back') {
            generatePlanarBackUVs(m.geometry, p.padding?.margin||0);
        }
        if (!m.material || !(m.material instanceof THREE.MeshStandardMaterial)) {
            m.material = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.8, metalness:0.1 });
        }
        m.material.map = tex; m.material.needsUpdate = true;
        console.log(`[Texture] Applied to ${activeProductKey} mesh #${i}`);
    });
}

function updateTexture(texturePath) {
    const p = products[activeProductKey]; if (!p?.meshes.length) { console.warn('Product not ready', activeProductKey); return; }
    console.log('[Texture] Loading', texturePath, 'for', activeProductKey);
    textureLoader.load(texturePath, tex => {
        lastUserTexture = tex; tex.flipY=false; tex.colorSpace=THREE.SRGBColorSpace;
        if (p.uvMode==='cylindrical') { tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping; }
        else { tex.wrapS=THREE.ClampToEdgeWrapping; tex.wrapT=THREE.ClampToEdgeWrapping; }
        tex.repeat.set(1,1);
        applyTextureToActive(tex);
        if (!debugTexturePlane) { const g=new THREE.PlaneGeometry(0.6,0.6); const m=new THREE.MeshBasicMaterial({ map:tex, side:THREE.DoubleSide }); debugTexturePlane=new THREE.Mesh(g,m); debugTexturePlane.position.set(-1.2,0.8,0); scene.add(debugTexturePlane); }
        else { debugTexturePlane.material.map = tex; debugTexturePlane.material.needsUpdate=true; }
    }, undefined, err=>console.error('[Texture] Failed', texturePath, err));
}

// Keyboard toggle for UV test grid (press G)
// (Removed obsolete single-product debug plane code block)

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
    applyTextureToActive(tex); lastUserTexture=tex;
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
// (Removed right-side image buttons panel logic)

// Debug: press H to outline UI elements if still hidden
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
        if (k==='h') {
            document.querySelectorAll('#pattern-buttons, .pattern-gen').forEach(el=>{ el.style.outline = el.style.outline? '' : '2px dashed red';});
    } else if (k==='g') {
        const p = products[activeProductKey]; if (!p.meshes.length) return; const usingGrid = p.meshes[0].material.map === testGridTexture;
        if (usingGrid && lastUserTexture) { p.meshes.forEach(m=>{ m.material.map=lastUserTexture; m.material.needsUpdate=true; }); }
        else { const grid=createOrGetTestGridTexture(); p.meshes.forEach(m=>{ m.material.map=grid; m.material.needsUpdate=true; }); }
    } else if (k==='1') switchProduct('shirt'); else if (k==='2') switchProduct('cup'); else if (k==='3') switchProduct('laptop');
});

// Product button events
document.querySelectorAll('.product-btn').forEach(btn=>btn.addEventListener('click', ()=>switchProduct(btn.dataset.product)));

// 10. Animation Loop
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }
animate();

// 11. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});