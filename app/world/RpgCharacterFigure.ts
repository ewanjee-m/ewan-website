// Written by scripts/generate-character-models.mjs from the FIGURE table the
// meshes are actually built from. Every value is a fraction of total figure
// height, shared by all six characters. Do not edit by hand: edit FIGURE in the
// generator and re-run it, or the models and the motion model drift apart in
// silence.
export const RPG_CHARACTER_FIGURE = {
  soleY: 0,
  ankleY: 0.055,
  kneeY: 0.15,
  hipJointY: 0.29,
  crotchY: 0.24,
  hipsBoneY: 0.3,
  wristY: 0.265,
  elbowY: 0.365,
  chestBoneY: 0.43,
  shoulderY: 0.465,
  torsoTopY: 0.545,
  chinY: 0.545,
  headCenterY: 0.745,
  crownY: 0.945,
  hairTopY: 1
} as const;

export type RpgCharacterFigureLandmark = keyof typeof RPG_CHARACTER_FIGURE;
