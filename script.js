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
renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color output
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
let modelMeshes = []; // This will hold all the mesh parts of the model

loader.load(
    'models/t_shirt.glb', // Path to your 3D model
    function (gltf) {
        const model = gltf.scene;
        
        console.log('Model loaded, traversing children...', gltf.scene);

        // Find and store all meshes from the model
        model.traverse((child) => {
            if (child.isMesh) {
                console.log('Found mesh:', child.name);
                modelMeshes.push(child);
            }
        });

        if (modelMeshes.length > 0) {
            console.log(`Found ${modelMeshes.length} meshes to texture.`);
        } else {
            console.error("Could not find any meshes in the model.");
            return; // Stop if no meshes found
        }

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
    if (modelMeshes.length === 0) {
        console.log('updateTexture called but no model meshes are set.');
        return;
    }

    console.log(`Updating texture to: ${texturePath}`);

    textureLoader.load(texturePath, (texture) => {
        console.log('Texture loaded:', texture);
        
        // Ensure the texture repeats, which is crucial for patterns
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 8); // Increased tiling to make the pattern more visible
        
        texture.flipY = false; 
        texture.colorSpace = THREE.SRGBColorSpace;
        
        // Create a new material to ensure settings are applied correctly
        const newMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.1,
            roughness: 0.8,
        });
        
        // Apply the new material to all meshes
        modelMeshes.forEach(mesh => {
            mesh.material = newMaterial;
        });
        console.log('Texture and new material applied to all meshes.');
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