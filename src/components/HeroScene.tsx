// @ts-nocheck — R3F JSX intrinsic types are incompatible with some Three.js versions
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useEffect, useState, Suspense, Component, type ReactNode } from "react";
import { BufferGeometry, BufferAttribute, AdditiveBlending, NormalBlending } from "three";
import type { Mesh, Points } from "three";
import { useAppStore } from "@/store/appStore";

/**
 * Ambient background scene.
 *
 * This sits behind every page, so it must read as atmosphere, never as content.
 * The previous version used opaque metallic geometry at full opacity, which
 * punched through the cards in front of it and looked like rendering artifacts.
 * The rules now:
 *
 *   · Everything is transparent and additively blended — shapes tint the
 *     background rather than occluding it.
 *   · Geometry lives far back (z ≤ −6) and well outside the central column
 *     where text sits.
 *   · The canvas is masked to a radial vignette so the middle of the screen,
 *     where content is, stays clean.
 *   · Rendering stops when the tab is hidden, and the whole scene is skipped
 *     under prefers-reduced-motion.
 */

class SceneErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ── Elements ─────────────────────────────────────────────────────────────────

function SoftOrb({ position, color, speed = 1, scale = 1, opacity = 0.22, blending = AdditiveBlending }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    mesh.rotation.x = t * 0.06 * speed;
    mesh.rotation.y = t * 0.09 * speed;
    mesh.position.y = position[1] + Math.sin(t * 0.25 * speed) * 0.45;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 3]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={blending}
        depthWrite={false}
        wireframe
      />
    </mesh>
  );
}

function SoftRing({ position, color, scale = 1, opacity = 0.18, blending = AdditiveBlending }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    mesh.rotation.x = t * 0.14;
    mesh.rotation.z = t * 0.09;
    mesh.position.y = position[1] + Math.sin(t * 0.18) * 0.3;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <torusGeometry args={[1, 0.06, 12, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={blending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Particles({ blending = AdditiveBlending, opacity = 0.42 }) {
  const points = useRef<Points>(null);
  const count = 260;

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 28;
      // Keep the field behind the content plane.
      positions[i * 3 + 2] = -4 - Math.random() * 12;

      const warm = Math.random() > 0.45;
      colors[i * 3] = warm ? 0.86 : 0.22;
      colors[i * 3 + 1] = warm ? 0.22 : 0.68;
      colors[i * 3 + 2] = warm ? 0.24 : 0.42;
    }

    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    return geo;
  }, []);

  // BufferGeometry holds GPU buffers; React will not release them for us.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const node = points.current;
    if (!node) return;
    node.rotation.y = state.clock.elapsedTime * 0.012;
    node.rotation.x = Math.sin(state.clock.elapsedTime * 0.008) * 0.08;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={blending}
      />
    </points>
  );
}

/** Suspends the render loop while the tab is hidden. */
function RenderGate() {
  const { invalidate, setFrameloop } = useThree();

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setFrameloop("never");
      } else {
        setFrameloop("always");
        invalidate();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [invalidate, setFrameloop]);

  return null;
}

// ── Scene ────────────────────────────────────────────────────────────────────

export default function HeroScene() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const theme = useAppStore((state) => state.theme);
  const isLight = theme === "light";
  // Additive blending brightens a dark background beautifully but washes out
  // against white. Normal blending preserves the same moving geometry in light
  // mode without turning it into invisible white glare.
  const blending = isLight ? NormalBlending : AdditiveBlending;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // The CSS orb/mesh layer in Layout already carries the atmosphere; a static
  // WebGL context would add cost for nothing.
  if (reducedMotion) return null;

  return (
    <SceneErrorBoundary>
      <div
        className="w-full h-full"
        style={{
          opacity: isLight ? 0.72 : 0.5,
          // Keeps the centre column — where all the text lives — clear.
          maskImage:
            "radial-gradient(ellipse 65% 55% at 50% 45%, transparent 0%, black 82%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 65% 55% at 50% 45%, transparent 0%, black 82%)",
        }}
      >
        <Canvas
          aria-hidden="true"
          camera={{ position: [0, 0, 9], fov: 40 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
          style={{ background: "transparent" }}
        >
          <RenderGate />
          <Suspense fallback={null}>
            <SoftOrb position={[-6.5, 1.5, -7]} color="#dc2626" speed={0.6} scale={1.6} opacity={isLight ? 0.34 : 0.22} blending={blending} />
            <SoftOrb position={[6.8, -1.8, -8]} color="#16a34a" speed={0.4} scale={1.3} opacity={isLight ? 0.28 : 0.22} blending={blending} />
            <SoftOrb position={[2.5, 4.2, -10]} color="#ef4444" speed={0.3} scale={0.9} opacity={isLight ? 0.24 : 0.16} blending={blending} />
            <SoftRing position={[5.5, 2.6, -6]} color="#ef4444" scale={1.1} opacity={isLight ? 0.3 : 0.18} blending={blending} />
            <SoftRing position={[-5, -3.2, -6.5]} color="#22c55e" scale={0.85} opacity={isLight ? 0.26 : 0.18} blending={blending} />
            <SoftRing position={[-2, 2.4, -11]} color="#f87171" scale={0.6} opacity={isLight ? 0.2 : 0.12} blending={blending} />
            <Particles blending={blending} opacity={isLight ? 0.62 : 0.42} />
          </Suspense>
        </Canvas>
      </div>
    </SceneErrorBoundary>
  );
}
