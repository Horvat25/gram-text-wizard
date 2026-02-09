import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Colors from design system (HSL to hex for Three.js)
const PRIMARY_COLOR = '#8B5CF6'; // violet-500
const PRIMARY_LIGHT = '#A78BFA'; // violet-400
const PRIMARY_DARK = '#7C3AED'; // violet-600
const ACCENT_COLOR = '#6D28D9'; // violet-700

function GenieSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -state.clock.elapsedTime * 0.4;
      innerRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.2;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <group>
        {/* Outer glowing sphere */}
        <Sphere ref={meshRef} args={[1.5, 64, 64]}>
          <MeshDistortMaterial
            color={PRIMARY_COLOR}
            attach="material"
            distort={0.4}
            speed={2}
            roughness={0.2}
            metalness={0.8}
            transparent
            opacity={0.7}
          />
        </Sphere>
        
        {/* Inner core */}
        <Sphere ref={innerRef} args={[0.8, 32, 32]}>
          <MeshDistortMaterial
            color={PRIMARY_LIGHT}
            attach="material"
            distort={0.6}
            speed={3}
            roughness={0.1}
            metalness={1}
            emissive={PRIMARY_DARK}
            emissiveIntensity={0.5}
          />
        </Sphere>
        
        {/* Energy rings */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2, 0.02, 16, 100]} />
          <meshBasicMaterial color={PRIMARY_LIGHT} transparent opacity={0.5} />
        </mesh>
        <mesh rotation={[Math.PI / 2.5, Math.PI / 4, 0]}>
          <torusGeometry args={[2.2, 0.015, 16, 100]} />
          <meshBasicMaterial color={PRIMARY_COLOR} transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 3, -Math.PI / 3, 0]}>
          <torusGeometry args={[2.4, 0.01, 16, 100]} />
          <meshBasicMaterial color={ACCENT_COLOR} transparent opacity={0.2} />
        </mesh>
      </group>
    </Float>
  );
}

function ParticleField() {
  const count = 200;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3 + Math.random() * 2;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color={PRIMARY_LIGHT}
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

interface AgentGenie3DProps {
  isProcessing?: boolean;
}

export default function AgentGenie3D({ isProcessing = false }: AgentGenie3DProps) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color={PRIMARY_LIGHT} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color={PRIMARY_COLOR} />
        <spotLight
          position={[0, 5, 0]}
          angle={0.5}
          penumbra={1}
          intensity={isProcessing ? 2 : 1}
          color={PRIMARY_DARK}
        />
        
        <GenieSphere />
        <ParticleField />
        <Stars radius={100} depth={50} count={1000} factor={2} saturation={0} fade speed={1} />
      </Canvas>
    </div>
  );
}
