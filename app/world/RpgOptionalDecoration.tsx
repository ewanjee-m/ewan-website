"use client";

import { useLoader } from "@react-three/fiber";
import { Suspense, useEffect, type RefObject } from "react";
import { TextureLoader } from "three";
import { RpgAssetBoundary } from "./RpgAssetBoundary";

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
  return (
    <RpgAssetBoundary
      assetId="hanabi-festival-sign"
      fallback={null}
      onError={() => {
        telemetry.current?.setAttribute(
          "data-optional-decoration",
          "omitted"
        );
      }}
    >
      <Suspense fallback={null}>
        <HanabiFestivalSign telemetry={telemetry} />
      </Suspense>
    </RpgAssetBoundary>
  );
}
