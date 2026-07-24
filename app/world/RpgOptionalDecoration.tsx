"use client";

import { useLoader } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  type RefObject
} from "react";
import { TextureLoader } from "three";
import {
  RpgAssetAvailabilityGate,
  RpgAssetBoundary
} from "./RpgAssetBoundary";

const HANABI_SIGN_ASSET = "/assets/world/hanabi-festival-sign.svg";

function HanabiFestivalSign({
  telemetry
}: {
  telemetry: RefObject<HTMLDivElement | null>;
}) {
  const texture = useLoader(TextureLoader, HANABI_SIGN_ASSET);

  useEffect(() => {
    telemetry.current?.setAttribute(
      "data-optional-decoration",
      "available"
    );
  }, [telemetry]);

  return (
    <mesh position={[27, 2.3, -17.5]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[4, 1.5]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

export function RpgOptionalDecoration({
  telemetry
}: {
  telemetry: RefObject<HTMLDivElement | null>;
}) {
  const handleAssetError = () => {
    telemetry.current?.setAttribute(
      "data-optional-decoration",
      "omitted"
    );
  };
  return (
    <RpgAssetAvailabilityGate
      assetId="hanabi-festival-sign"
      src={HANABI_SIGN_ASSET}
      fallback={null}
      onError={handleAssetError}
    >
      <RpgAssetBoundary
        assetId="hanabi-festival-sign"
        fallback={null}
        onError={handleAssetError}
      >
        <Suspense fallback={null}>
          <HanabiFestivalSign telemetry={telemetry} />
        </Suspense>
      </RpgAssetBoundary>
    </RpgAssetAvailabilityGate>
  );
}
