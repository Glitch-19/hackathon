// Import necessary modules from Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); // Light grey background

const container = document.getElementById('viewer-container');

// 2. Camera Setup
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.z = 2;

// 3. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// 4. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// 5. Controls (to rotate the model)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 6. Load the 3D Model
const loader = new GLTFLoader();
let modelMesh = null; // This will hold the part of the model we want to customize

loader.load(
    'models/t_shirt.glb', // Path to your 3D model
    function (gltf) {
        const model = gltf.scene;
        
        console.log('Model loaded, traversing children...', gltf.scene);

        // Find the mesh to apply the texture to (likely the one with the most vertices)
        model.traverse((child) => {
            if (child.isMesh) {
                console.log('Found mesh:', child.name, 'with', child.geometry.attributes.position.count, 'vertices.');
                if (!modelMesh || child.geometry.attributes.position.count > modelMesh.geometry.attributes.position.count) {
                    modelMesh = child;
                    console.log('New candidate for texturing:', modelMesh.name);
                }
            }
        });

        scene.add(model);
        
        // Initial texture load
        updateTexture('artworks/warli1.jpg');
    },
    undefined,
    function (error) {
        console.error('Error loading model:', error);
    }
);

// 7. Texture Swapping Logic
const textureLoader = new THREE.TextureLoader();

function updateTexture(texturePath) {
    if (!modelMesh) {
        console.log('updateTexture called but modelMesh is not set.');
        return;
    }

    console.log(`Updating texture to: ${texturePath}`);

    textureLoader.load(texturePath, (texture) => {
        console.log('Texture loaded:', texture);
        
        // Ensure the texture repeats, which is crucial for patterns
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); // Repeat the texture 2x2 times
        
        texture.flipY = false; 
        texture.encoding = THREE.sRGBEncoding;
        
        // Create a new material to ensure settings are applied correctly
        const newMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.1,
            roughness: 0.8,
        });
        
        modelMesh.material = newMaterial;
        console.log('Texture and new material applied.');
    },
    undefined,
    (error) => {
        console.error('Error loading texture:', error);
    });
}

// 8. UI Event Listeners
const swatches = document.querySelectorAll('.swatch');
swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
        // Update active state
        document.querySelector('.swatch.active').classList.remove('active');
        swatch.classList.add('active');
        
        // Update the 3D model's texture
        const texturePath = swatch.dataset.texture;
        updateTexture(texturePath);
    });
});


// 9. Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Update controls
    renderer.render(scene, camera);
}

animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});