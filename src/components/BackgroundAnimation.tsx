// @ts-nocheck — R3F JSX intrinsic types incompatible with Three.js 0.160; upgrade @react-three/fiber to v9+ to resolve
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, Suspense, useMemo } from "react";
import * as THREE from "three";

function GlowSphere({ position, color, speed = 1, scale = 1 }: {
  position: [number, number, number];
  color: string;
  speed?: number;
  scale?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.15 * speed;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2 * speed;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5 * speed) * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 4]} />
      {/* @ts-ignore - R3F material type mismatch with Three.js 0.160 */}
      <meshStandardMaterial
        color={color}
        roughness={0.15}
        metalness={0.9}
        emissive={color}
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

function FloatingRing({ position, color, scale = 1 }: {
  position: [number, number, number];
  color: string;
  scale?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.4;
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.25;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.3) * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <torusGeometry args={[1, 0.25, 24, 64]} />
      <meshStandardMaterial
        color={color}
        roughness={0.2}
        metalness={0.85}
        emissive={color}
        emissiveIntensity={0.1}
      />
    </mesh>
  );
}

function Particles() {
  const points = useRef<THREE.Points>(null);
  const count = 300;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;

      if (Math.random() > 0.5) {
        colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.2; colors[i * 3 + 2] = 0.2;
      } else {
        colors[i * 3] = 0.2; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 0.4;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.elapsedTime * 0.015;
      points.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
    }
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.04} vertexColors transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

export default function BackgroundAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 9], fov: 40 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <pointLight position={[-5, 5, 5]} color="#ef4444" intensity={3} distance={15} />
          <pointLight position={[5, -3, 3]} color="#22c55e" intensity={2.5} distance={12} />
          <pointLight position={[0, 3, 6]} color="#ffffff" intensity={0.5} distance={10} />

          <GlowSphere position={[-3.5, 1.5, -1]} color="#dc2626" speed={0.6} scale={0.9} />
          <GlowSphere position={[4, -1.5, -3]} color="#16a34a" speed={0.4} scale={0.7} />
          <GlowSphere position={[1, 3, -4]} color="#ef4444" speed={0.3} scale={0.4} />
          <FloatingRing position={[3, 2, -2]} color="#ef4444" scale={0.5} />
          <FloatingRing position={[-2.5, -2.5, -2]} color="#22c55e" scale={0.35} />
          <FloatingRing position={[-1, 1, -5]} color="#ffffff" scale={0.25} />
          <Particles />
        </Suspense>
      </Canvas>
    </div>
  );
}
