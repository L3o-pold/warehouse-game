import { Canvas } from '@react-three/fiber';

export default function App() {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [4, 4, 4] }}>
        <ambientLight />
        <mesh>
          <boxGeometry />
          <meshStandardMaterial color="#2563EB" />
        </mesh>
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-white/85 px-4 py-2 font-bold shadow">WareTrack Tycoon</div>
    </div>
  );
}
