export const RPG_REFERENCE_MAP_GOLDEN = {
  imageSize: [1817, 866],
  coastline: [[0, 430], [110, 380], [300, 330], [520, 290], [760, 275], [1020, 295], [1240, 340], [1410, 390], [1600, 370], [1816, 360], [1816, 650], [1760, 720], [1670, 780], [1585, 790], [1530, 745], [1490, 675], [1425, 620], [1340, 655], [1280, 745], [1160, 820], [960, 855], [650, 865], [340, 825], [100, 690]],
  routes: {
    "airport-to-tokyo": [[430, 565], [510, 535], [600, 500], [690, 470]],
    "airport-to-gyukatsu": [[500, 600], [630, 580], [780, 555], [910, 570], [990, 590]],
    "tokyo-to-gyukatsu": [[800, 465], [850, 495], [910, 530], [970, 565]],
    "gyukatsu-to-sakura": [[1080, 635], [1150, 640], [1210, 620], [1230, 610]],
    "sakura-to-hanabi": [[1338, 570], [1390, 565], [1442, 580], [1495, 610], [1545, 640]]
  },
  nodes: {
    airport: [430, 600],
    tokyo: [760, 455],
    gyukatsu: [1035, 610],
    sakura: [1260, 595],
    hanabi: [1570, 640]
  }
} as const;

export const RPG_REFERENCE_REGISTRATION_GOLDEN = {
  sourceImage: "public/assets/world/world-environment-concept.png",
  imageSize: [1817, 866],
  zones: {
    airport: {
      sourceId: "airport-limousine-bus",
      referencePixel: [345, 520],
      spriteScale: 1.08,
      depthKey: 0.6,
      protectedRectangle: { minimumX: 165, maximumX: 525, minimumY: 430, maximumY: 610 },
      cameraFocusRectangle: { minimumX: 325, maximumX: 605, minimumY: 300, maximumY: 650 }
    },
    tokyo: {
      sourceId: "tokyo-blue-tower",
      referencePixel: [495, 195],
      spriteScale: 0.72,
      depthKey: 0.22,
      protectedRectangle: { minimumX: 429, maximumX: 561, minimumY: 65, maximumY: 320 },
      cameraFocusRectangle: { minimumX: 630, maximumX: 900, minimumY: 250, maximumY: 580 }
    },
    gyukatsu: {
      sourceId: "gyukatsu-main-machiya",
      referencePixel: [975, 450],
      spriteScale: 1,
      depthKey: 0.52,
      protectedRectangle: { minimumX: 815, maximumX: 1135, minimumY: 285, maximumY: 615 },
      cameraFocusRectangle: { minimumX: 900, maximumX: 1170, minimumY: 350, maximumY: 680 }
    },
    sakura: {
      sourceId: "sakura-tree-01",
      referencePixel: [1245, 375],
      spriteScale: 0.88,
      depthKey: 0.43,
      protectedRectangle: { minimumX: 1040, maximumX: 1455, minimumY: 165, maximumY: 590 },
      cameraFocusRectangle: { minimumX: 1150, maximumX: 1410, minimumY: 330, maximumY: 650 }
    },
    hanabi: {
      sourceId: "hanabi-apple-stall",
      referencePixel: [1655, 430],
      spriteScale: 0.96,
      depthKey: 0.5,
      protectedRectangle: { minimumX: 1500, maximumX: 1810, minimumY: 285, maximumY: 570 },
      cameraFocusRectangle: { minimumX: 1455, maximumX: 1720, minimumY: 300, maximumY: 590 }
    }
  },
  calibrationControls: [
    { id: "calibration-coast-northwest", referencePixel: [40, 300], spriteScale: 0.64, depthKey: 0.16, measurementRole: "approved-feature" },
    { id: "calibration-tokyo-tower-base", referencePixel: [495, 320], spriteScale: 0.72, depthKey: 0.28, measurementRole: "approved-feature" },
    { id: "calibration-coast-northeast", referencePixel: [1728, 300], spriteScale: 0.64, depthKey: 0.16, measurementRole: "navigable-boundary-inset" },
    { id: "calibration-airport-bus-base", referencePixel: [345, 590], spriteScale: 1.08, depthKey: 0.61, measurementRole: "approved-feature" },
    { id: "calibration-gyukatsu-base", referencePixel: [975, 600], spriteScale: 1, depthKey: 0.62, measurementRole: "approved-feature" },
    { id: "calibration-coast-southwest", referencePixel: [20, 840], spriteScale: 1.22, depthKey: 0.97, measurementRole: "approved-feature" },
    { id: "calibration-sakura-tree-base", referencePixel: [1245, 740], spriteScale: 1.17, depthKey: 0.85, measurementRole: "approved-feature" },
    { id: "calibration-coast-southeast", referencePixel: [1728, 840], spriteScale: 1.22, depthKey: 0.97, measurementRole: "navigable-boundary-inset" },
    { id: "calibration-sakura-road-west", referencePixel: [1010, 650], spriteScale: 1.12, depthKey: 0.76, measurementRole: "approved-feature" },
    { id: "calibration-gyukatsu-sakura-transition", referencePixel: [1100, 620], spriteScale: 1.05, depthKey: 0.66, measurementRole: "approved-feature" },
    { id: "calibration-canal-southwest-bank", referencePixel: [1390, 840], spriteScale: 1.22, depthKey: 0.97, measurementRole: "approved-feature" },
    { id: "calibration-bridge-west-end", referencePixel: [1370, 640], spriteScale: 1.13, depthKey: 0.8, measurementRole: "approved-feature" }
  ],
  arrivalTraversableSurfaceAnnotations: {
    airport: {
      arrivalId: "airport-arrival",
      zoneId: "airport",
      surfaceId: "airport-arrival-road-surface",
      sourceRouteId: "airport-arrival-road",
      approvedImageRectangle: { minimumX: 120, maximumX: 480, minimumY: 440, maximumY: 700 }
    },
    tokyo: {
      arrivalId: "tokyo-arrival",
      zoneId: "tokyo",
      surfaceId: "tokyo-center-connector-surface",
      sourceRouteId: "tokyo-center-connector",
      approvedImageRectangle: { minimumX: 600, maximumX: 900, minimumY: 330, maximumY: 590 }
    },
    gyukatsu: {
      arrivalId: "gyukatsu-arrival",
      zoneId: "gyukatsu",
      surfaceId: "gyukatsu-cross-street-surface",
      sourceRouteId: "gyukatsu-cross-street",
      approvedImageRectangle: { minimumX: 760, maximumX: 1320, minimumY: 420, maximumY: 710 }
    },
    sakura: {
      arrivalId: "sakura-arrival",
      zoneId: "sakura",
      surfaceId: "center-south-connector-surface",
      sourceRouteId: "center-south-connector",
      approvedImageRectangle: { minimumX: 1000, maximumX: 1460, minimumY: 480, maximumY: 760 }
    },
    hanabi: {
      arrivalId: "hanabi-arrival",
      zoneId: "hanabi",
      surfaceId: "hanabi-festival-road-surface",
      sourceRouteId: "hanabi-festival-road",
      approvedImageRectangle: { minimumX: 1450, maximumX: 1810, minimumY: 420, maximumY: 680 }
    }
  },
  depthPairs: {
    airport: {
      zoneId: "airport",
      surfaceId: "airport-arrival-road-surface",
      farWorldXZ: [-30, 16],
      nearWorldXZ: [-30, -4]
    },
    center: {
      zoneId: "tokyo",
      surfaceId: "tokyo-center-connector-surface",
      farWorldXZ: [-8, 22],
      nearWorldXZ: [-8, 12]
    },
    east: {
      zoneId: "hanabi",
      surfaceId: "hanabi-festival-road-surface",
      farWorldXZ: [24, -14],
      nearWorldXZ: [24, -19]
    }
  },
  depthPairMinimumGaps: { pixelY: 16, spriteScale: 0.04, depthKey: 0.04 },
  transitionProtectedRectangles: {
    "airport-to-tokyo:from": { sourceId: "airport-coastal-apron", minimumX: 360, maximumX: 510, minimumY: 300, maximumY: 470 },
    "airport-to-tokyo:to": { sourceId: "tokyo-neighborhood-paving", minimumX: 530, maximumX: 680, minimumY: 330, maximumY: 500 },
    "airport-to-gyukatsu:from": { sourceId: "airport-bus-plaza", minimumX: 280, maximumX: 500, minimumY: 470, maximumY: 610 },
    "airport-to-gyukatsu:to": { sourceId: "gyukatsu-stone-plaza", minimumX: 650, maximumX: 820, minimumY: 420, maximumY: 590 },
    "tokyo-to-gyukatsu:from": { sourceId: "district-volume-tokyo-east-tower", minimumX: 1000, maximumX: 1150, minimumY: 260, maximumY: 440 },
    "tokyo-to-gyukatsu:to": { sourceId: "gyukatsu-teahouse-machiya", minimumX: 1020, maximumX: 1164, minimumY: 380, maximumY: 560 },
    "gyukatsu-to-sakura:from": { sourceId: "gyukatsu-stone-plaza", minimumX: 850, maximumX: 1030, minimumY: 500, maximumY: 680 },
    "gyukatsu-to-sakura:to": { sourceId: "sakura-riverside-garden", minimumX: 1100, maximumX: 1280, minimumY: 400, maximumY: 580 },
    "sakura-to-hanabi:from": { sourceId: "sakura-bridge", minimumX: 1360, maximumX: 1540, minimumY: 500, maximumY: 680 },
    "sakura-to-hanabi:to": { sourceId: "hanabi-festival-plaza", minimumX: 1550, maximumX: 1730, minimumY: 400, maximumY: 580 }
  },
  transitionPairs: [
    { transitionId: "airport-to-tokyo", fromId: "airport-coastal-apron", toId: "tokyo-neighborhood-paving", fromRectangleKey: "airport-to-tokyo:from", toRectangleKey: "airport-to-tokyo:to" },
    { transitionId: "airport-to-gyukatsu", fromId: "airport-bus-plaza", toId: "gyukatsu-stone-plaza", fromRectangleKey: "airport-to-gyukatsu:from", toRectangleKey: "airport-to-gyukatsu:to" },
    { transitionId: "tokyo-to-gyukatsu", fromId: "district-volume-tokyo-east-tower", toId: "gyukatsu-teahouse-machiya", fromRectangleKey: "tokyo-to-gyukatsu:from", toRectangleKey: "tokyo-to-gyukatsu:to" },
    { transitionId: "gyukatsu-to-sakura", fromId: "gyukatsu-stone-plaza", toId: "sakura-riverside-garden", fromRectangleKey: "gyukatsu-to-sakura:from", toRectangleKey: "gyukatsu-to-sakura:to" },
    { transitionId: "sakura-to-hanabi", fromId: "sakura-bridge", toId: "hanabi-festival-plaza", fromRectangleKey: "sakura-to-hanabi:from", toRectangleKey: "sakura-to-hanabi:to" }
  ]
} as const;
