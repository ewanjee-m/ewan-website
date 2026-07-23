import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "../..");
const mode = process.env.ARCHITECTURE_STATIC_CHECK === "1"
  ? "static"
  : process.env.ARCHITECTURE_FAIL_STOP_SELFTEST === "1"
    ? "selftest"
    : process.env.ARCHITECTURE_LEGACY_CHECK === "1"
      ? "legacy"
      : process.env.ARCHITECTURE_FREEZE_ONLY === "1"
        ? "freeze"
        : process.env.ARCHITECTURE_PREFLIGHT === "1"
          ? "preflight"
          : "attempt";
const requestedEvidenceDirectory = process.env.ARCHITECTURE_EVIDENCE_DIR;
const requestedStrictPreflightDirectory =
  process.env.ARCHITECTURE_STRICT_PREFLIGHT_DIR;
const baseURL = process.env.ARCHITECTURE_BASE_URL ?? "http://127.0.0.1:4180";
const port = new URL(baseURL).port || "4180";
const globalLockPathForAttempt = (attemptNumber) =>
  join(
    projectDirectory,
    `.omx/state/g005-architecture-attempt-${attemptNumber}-lock.json`
  );
function assertAttempt4Number(attemptNumber) {
  if (attemptNumber !== 4) {
    throw new Error(
      "Recovery harness permits attempt 4 only; attempts 2 and 3 are immutable and non-finalizable."
    );
  }
}

function assertInitialAttemptDispatch({
  attemptNumber,
  evidenceDirectory,
  strictPreflightDirectory
}) {
  assertAttempt4Number(attemptNumber);
  if (evidenceDirectory) {
    throw new Error(
      "Initial full capture selects its own fresh locked evidence directory; ARCHITECTURE_EVIDENCE_DIR is finalize-only."
    );
  }
  if (!strictPreflightDirectory) {
    throw new Error(
      "Attempt 4 initial capture requires explicit ARCHITECTURE_STRICT_PREFLIGHT_DIR."
    );
  }
  return {
    attemptNumber,
    strictPreflightDirectory: resolve(strictPreflightDirectory)
  };
}

const recoveryPlanPath = join(
  projectDirectory,
  ".omx/plans/g005-attempt4-occlusion-evidence-recovery.md"
);
const criticApprovalPath = join(
  projectDirectory,
  ".omx/plans/reviews/g005-attempt4-occlusion-evidence-recovery-critic-approval.md"
);
const executableAuthority = {
  recoveryPlan: {
    path: ".omx/plans/g005-attempt4-occlusion-evidence-recovery.md",
    sha256:
      "036c3a7e87a1458e5fe770d04e73364eaac64ff4de5d40e4f0c992e72840e4ad"
  },
  criticApproval: {
    path:
      ".omx/plans/reviews/g005-attempt4-occlusion-evidence-recovery-critic-approval.md",
    sha256:
      "06e1bbcbc8cb0c07f56b7be7c4c90bf4f6c45bcd259d042f08637935eb363f93",
    verdict: "APPROVE",
    reviewedPlanSha256:
      "036c3a7e87a1458e5fe770d04e73364eaac64ff4de5d40e4f0c992e72840e4ad"
  }
};
const predecessorEvidenceDirectory = join(
  projectDirectory,
  "test-results/visual-fidelity/20260723T065307Z-attempt-2"
);
const predecessorFiles = [
  {
    name: "lock",
    path: globalLockPathForAttempt(2),
    relativePath: ".omx/state/g005-architecture-attempt-2-lock.json",
    sha256:
      "1ed8824a43b8a671d59731a5f30b7ca143cf56b071f28d8e2a53066b73b75892"
  },
  {
    name: "architectureAttempt",
    path: join(predecessorEvidenceDirectory, "architecture-attempt.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T065307Z-attempt-2/architecture-attempt.json",
    sha256:
      "fd06e6ba150373e1a4d52e1be80407188c40e3dbfa7f99622010bde63802a7f4"
  },
  {
    name: "approvedReference",
    path: join(predecessorEvidenceDirectory, "approved-reference.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T065307Z-attempt-2/approved-reference.json",
    sha256:
      "192d724639d839ca2f0506a0771345cc798dfcd46312f27053eaecc3c7db83da"
  },
  {
    name: "attemptSlotConsumed",
    path: join(predecessorEvidenceDirectory, "attempt-slot-consumed.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T065307Z-attempt-2/attempt-slot-consumed.json",
    sha256:
      "d1fd51e86beab44c7b1c859f26a036666d01b95047a9804228393e6da95b850a"
  },
  {
    name: "sourceManifest",
    path: join(
      predecessorEvidenceDirectory,
      "attempt-source-test-hashes.json"
    ),
    relativePath:
      "test-results/visual-fidelity/20260723T065307Z-attempt-2/attempt-source-test-hashes.json",
    sha256:
      "72ca4c299cf5d3f218b52cd27bcb7311bad1098501fc4d3cd0a2bf67af5f5f48"
  },
  {
    name: "modificationManifest",
    path: join(
      predecessorEvidenceDirectory,
      "modification-diff-manifest.json"
    ),
    relativePath:
      "test-results/visual-fidelity/20260723T065307Z-attempt-2/modification-diff-manifest.json",
    sha256:
      "3f549324de5eb426c55c9717f5639b9eb9515421f3ab769446156a69b7d0b6f8"
  }
];
const attempt3EvidenceDirectory = join(
  projectDirectory,
  "test-results/visual-fidelity/20260723T075929Z-attempt-3"
);
const attempt3InventorySha256 =
  "37752670fa87d26e7d9846585d977d02545310e809e64caa85f17b8cccc92213";
const attempt3Files = [
  {
    name: "lock",
    path: globalLockPathForAttempt(3),
    relativePath: ".omx/state/g005-architecture-attempt-3-lock.json",
    sha256:
      "48552202e729109bb799225efd5264b24ae32f36efaba8dae4c6f9b873a2ce85"
  },
  {
    name: "architectureAttempt",
    path: join(attempt3EvidenceDirectory, "architecture-attempt.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T075929Z-attempt-3/architecture-attempt.json",
    sha256:
      "e70baa908395b8c430e41cc522dee43c624de5670d46f9f53778f9b932f9dfba"
  },
  {
    name: "approvedReference",
    path: join(attempt3EvidenceDirectory, "approved-reference.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T075929Z-attempt-3/approved-reference.json",
    sha256:
      "0b0bba78619dbc6916036d7aaacd81c9b11d1f6a12b31078e2e3d7db78c5744c"
  },
  {
    name: "attemptSlotConsumed",
    path: join(attempt3EvidenceDirectory, "attempt-slot-consumed.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T075929Z-attempt-3/attempt-slot-consumed.json",
    sha256:
      "bc00d25827a0c07ba4bc927968458028273958f5d71abf66895e4da4059261af"
  },
  {
    name: "sourceManifest",
    path: join(attempt3EvidenceDirectory, "attempt-source-test-hashes.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T075929Z-attempt-3/attempt-source-test-hashes.json",
    sha256:
      "cd63bfc1663330a8ec6365ce7142640ba14e88c6c4a1782e1d692a9b3064d7e3"
  },
  {
    name: "modificationManifest",
    path: join(attempt3EvidenceDirectory, "modification-diff-manifest.json"),
    relativePath:
      "test-results/visual-fidelity/20260723T075929Z-attempt-3/modification-diff-manifest.json",
    sha256:
      "8e6b51344df2b859babbb8d1778a34a428e114f92ee5d8b33997279d3977fcca"
  }
];
const requestPath = join(
  projectDirectory,
  ".omx/backups/20260722T015104Z/g005-pivot-allowlist-request.json"
);
const approvalPath = join(
  projectDirectory,
  ".omx/backups/20260722T015104Z/g005-pivot-allowlist-approval.json"
);
const preEditGatePath = join(
  projectDirectory,
  ".omx/backups/20260722T015104Z/g005-pivot-pre-edit-gate.json"
);
const changeIntentPath = join(
  projectDirectory,
  ".omx/backups/20260722T015104Z/change-intent.json"
);
const handoffPath = join(
  projectDirectory,
  ".omx/plans/ralplan-handoff-visual-fidelity-map-alignment.json"
);
const dirtyBaselinePath = join(
  projectDirectory,
  ".omx/backups/20260722T015104Z/dirty-files-before.json"
);
const backdropPath = join(
  projectDirectory,
  "public/assets/world/world-environment-concept.png"
);
const legacyAttemptPath = join(
  projectDirectory,
  "test-results/visual-fidelity/20260723T014233Z-attempt-1/architecture-attempt.json"
);
const authority = {
  request:
    "11607566a5c1db2492e45b7ac3ce2b33eb24f8aaa4aa7a51f54f7f8ca13f108c",
  approval:
    "dd55102961a1605ca9f254d574c66039e2ebcb3b2b97a9157b4b75933fdac476",
  preEditGate:
    "63f5fb5da5d03d395b9c0777cadbbffbedb9239712fd6d388e93f9e831722c8e",
  changeIntent:
    "e31172180db8c46eba2b6ff49270867c5c5da493ad2eeb72bc61811440531050",
  handoff:
    "9a3b1c1410969a92a9c6abcf4d2c57318df130929596dd367d7fc531390ddc19",
  backdrop:
    "6e5c9a1fedd0ed14327b09bd160ade3cf6fcbea0229e998f9d9d689f8ad6f255",
  legacyAttempt:
    "36ff474c70a0d5ab00b61ceb308a0d736b68b6319288d07d287fe22ccc89b94c"
};
const desktopRows = [
  "start",
  "selection-male",
  "selection-female",
  "world-male",
  "world-female",
  "zone-airport",
  "zone-tokyo",
  "zone-gyukatsu",
  "zone-sakura",
  "zone-hanabi",
  "mini-map",
  "full-map"
];
const mobileRows = [
  "start",
  "selection-female",
  "world-female",
  "expanded-mini-map",
  "full-map"
];
const requiredGateIds = [
  "WORLD-01",
  "WORLD-03",
  "WORLD-06",
  "WORLD-07",
  "CAM-01",
  "CAM-02",
  "COMP-01",
  "BROWSER-BOUNDS"
];
const generatedCacheExclusions = [
  ".cache/",
  ".next/",
  ".vinext/",
  ".wrangler/",
  "dist/",
  "node_modules/",
  "test-results/"
];
const vitestExclusions = [
  ".omx/**",
  ...generatedCacheExclusions.map((prefix) => `${prefix}**`),
  "tests/e2e/**"
];
const unitGates = [
  {
    id: "WORLD-01",
    files: ["tests/rpg-world-model.test.ts"],
    pattern: "WORLD-01 canonical RPG world model"
  },
  {
    id: "WORLD-03",
    files: ["tests/rpg-world-geometry.test.ts"],
    pattern:
      "accepts only the route union after collision and canal subtraction|flood-fills from spawn to all arrivals and crosses the canal only on the bridge"
  },
  {
    id: "WORLD-06",
    files: ["tests/rpg-reference-registration.test.ts"],
    pattern: "WORLD-06 measured non-affine reference registration"
  },
  {
    id: "WORLD-07",
    files: ["tests/rpg-reference-registration.test.ts"],
    pattern: "WORLD-07 conforming registration topology"
  },
  {
    id: "CAM-01",
    files: [
      "tests/rpg-camera-placement.test.ts",
      "tests/flat-camera-placement.test.ts"
    ],
    pattern:
      "canonical player viewport projection|fixed reference-image camera placement"
  },
  {
    id: "CAM-02",
    files: [
      "tests/rpg-camera-placement.test.ts",
      "tests/camera-rig.test.ts",
      "tests/rpg-world-transform.test.ts",
      "tests/rpg-screen-movement.test.ts"
    ],
    pattern:
      "measured fixed-backdrop RPG camera|fixed-backdrop camera rig|mobile|source window|ordinary"
  },
  {
    id: "COMP-01",
    files: [
      "tests/rpg-world-depth-bands.test.ts",
      "tests/start-experience.test.tsx",
      "tests/rpg-mini-map.test.ts",
      "tests/rpg-mini-map-component.test.tsx",
      "tests/rpg-world-map-component.test.tsx",
      "tests/rpg-player-sprite-renderer.test.tsx",
      "tests/rpg-player-renderer-integration.test.ts",
      "tests/world-mini-map-integration.test.tsx"
    ],
    pattern: null
  }
];

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
const sha256Buffer = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");
const sha256 = async (path) => sha256Buffer(await readFile(path));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const canonicalComparableJson = (value) =>
  JSON.stringify(
    value && typeof value === "object"
      ? Array.isArray(value)
        ? value.map((entry) => JSON.parse(canonicalComparableJson(entry)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [
                key,
                JSON.parse(canonicalComparableJson(value[key]))
              ])
          )
      : value
  );
const utcStamp = () =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const recoveryModificationPaths = [
  "app/world/RpgWorldBackdrop.tsx",
  "app/world/RpgReferenceSceneComposition.tsx",
  "tests/rpg-player-renderer-integration.test.ts",
  "tests/visual/approved-reference.spec.ts",
  "tests/visual/architecture-attempt.mjs"
];
const attempt4ModificationPaths = [
  "tests/visual/approved-reference.spec.ts",
  "tests/visual/architecture-attempt.mjs"
];

function assertCanonicalTuple(actual, label) {
  if (
    canonicalComparableJson(actual) !==
    canonicalComparableJson(executableAuthority)
  ) {
    throw new Error(`${label} executable authority tuple mismatch.`);
  }
}

async function validateExecutableAuthority(...storedTuples) {
  const planSha256 = await sha256(recoveryPlanPath);
  const approvalSha256 = await sha256(criticApprovalPath);
  const approval = await readFile(criticApprovalPath, "utf8");
  const verdict = approval.match(/^- Verdict: `([^`]+)`$/m)?.[1] ?? null;
  const reviewedPlanSha256 =
    approval.match(/^- Reviewed plan SHA-256: `([a-f0-9]{64})`$/m)?.[1] ??
    null;
  const recomputed = {
    recoveryPlan: {
      path: executableAuthority.recoveryPlan.path,
      sha256: planSha256
    },
    criticApproval: {
      path: executableAuthority.criticApproval.path,
      sha256: approvalSha256,
      verdict,
      reviewedPlanSha256
    }
  };
  assertCanonicalTuple(recomputed, "Recomputed");
  for (const [index, tuple] of storedTuples.entries()) {
    assertCanonicalTuple(tuple, `Stored ${index + 1}`);
  }
  return recomputed;
}

async function validateAttempt2Predecessor() {
  const files = [];
  for (const immutable of predecessorFiles) {
    if (!(await exists(immutable.path))) {
      throw new Error(`Attempt 2 predecessor file is missing: ${immutable.relativePath}`);
    }
    const actualSha256 = await sha256(immutable.path);
    if (actualSha256 !== immutable.sha256) {
      throw new Error(
        `Attempt 2 predecessor SHA-256 mismatch: ${immutable.relativePath}`
      );
    }
    files.push({
      name: immutable.name,
      path: immutable.relativePath,
      sha256: actualSha256
    });
  }
  const lock = await readJson(predecessorFiles[0].path);
  const attempt = await readJson(predecessorFiles[1].path);
  if (
    lock.attemptNumber !== 2 ||
    lock.phase !== "lock_acquired" ||
    resolve(lock.evidenceDirectory ?? "") !== predecessorEvidenceDirectory ||
    attempt.attempt !== 2 ||
    resolve(attempt.evidenceDirectory ?? "") !== predecessorEvidenceDirectory ||
    attempt.phase !== "INCOMPLETE" ||
    attempt.lastCompletedState !== "slot_consumed" ||
    attempt.status !== "INCOMPLETE" ||
    attempt.attemptSlotConsumed !== true ||
    attempt.countsAsValidAttempt !== false ||
    attempt.harnessStatus !== "FAIL" ||
    attempt.executionFailed !== true
  ) {
    throw new Error("Attempt 2 predecessor state is not the immutable INCOMPLETE slot-consumed state.");
  }
  if (
    !(await verifyScreenshotSnapshot(
      predecessorEvidenceDirectory,
      attempt.screenshotSnapshot ?? []
    ))
  ) {
    throw new Error("Attempt 2 predecessor screenshots drifted.");
  }
  return {
    attemptNumber: 2,
    lockPath: predecessorFiles[0].relativePath,
    evidenceDirectory: predecessorEvidenceDirectory,
    phase: attempt.phase,
    lastCompletedState: attempt.lastCompletedState,
    status: attempt.status,
    attemptSlotConsumed: attempt.attemptSlotConsumed,
    countsAsValidAttempt: attempt.countsAsValidAttempt,
    harnessStatus: attempt.harnessStatus,
    executionFailed: attempt.executionFailed,
    screenshotCount: attempt.screenshotSnapshot.length,
    screenshotSnapshotVerified: true,
    files
  };
}

async function regularFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) return regularFiles(absolute);
        if (entry.isFile()) return [absolute];
        throw new Error(`Inventory contains non-regular entry: ${absolute}`);
      })
    )
  ).flat();
}

function buildCanonicalInventory(entries) {
  const canonicalEntries = entries.map((entry) => {
    if (
      typeof entry.relativePath !== "string" ||
      entry.relativePath === "" ||
      entry.relativePath.startsWith("/") ||
      entry.relativePath.startsWith("../") ||
      entry.relativePath.includes("\\") ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isInteger(entry.size) ||
      entry.size < 0 ||
      !Number.isFinite(entry.mtimeMs)
    ) {
      throw new Error("Canonical inventory entry is invalid.");
    }
    return { ...entry };
  });
  canonicalEntries.sort((left, right) =>
    Buffer.from(left.relativePath).compare(Buffer.from(right.relativePath))
  );
  const bytes = Buffer.from(
    canonicalEntries
      .map(
        ({ sha256: digest, size, mtimeMs, relativePath: entryPath }) =>
          `${digest}  ${size}  ${String(mtimeMs)}  ${entryPath}\n`
      )
      .join(""),
    "utf8"
  );
  return {
    entries: canonicalEntries,
    bytes,
    regularFileCount: canonicalEntries.length,
    sha256: sha256Buffer(bytes)
  };
}

function canonicalInventoryEncodingMatches(candidateBytes, canonical) {
  return (
    Buffer.isBuffer(candidateBytes) &&
    candidateBytes.length > 0 &&
    candidateBytes[candidateBytes.length - 1] === 0x0a &&
    candidateBytes.equals(canonical.bytes) &&
    sha256Buffer(candidateBytes) === canonical.sha256 &&
    candidateBytes.toString("utf8").split("\n").length - 1 ===
      canonical.regularFileCount
  );
}

async function collectCanonicalInventory(directory) {
  const entries = await Promise.all(
    (await regularFiles(directory)).map(async (absolute) => {
      const metadata = await stat(absolute);
      return {
        relativePath: relative(directory, absolute).split(sep).join("/"),
        sha256: await sha256(absolute),
        size: metadata.size,
        mtimeMs: metadata.mtimeMs
      };
    })
  );
  return buildCanonicalInventory(entries);
}

async function validateCanonicalInventory(
  directory,
  { expectedCount, expectedSha256 }
) {
  const inventory = await collectCanonicalInventory(directory);
  if (inventory.regularFileCount !== expectedCount) {
    throw new Error("Canonical inventory count drift.");
  }
  if (inventory.sha256 !== expectedSha256) {
    throw new Error("Canonical inventory SHA-256 mismatch.");
  }
  if (!canonicalInventoryEncodingMatches(inventory.bytes, inventory)) {
    throw new Error("Canonical inventory encoding drift.");
  }
  return inventory;
}

async function validateAttempt3Predecessor() {
  const files = [];
  for (const immutable of attempt3Files) {
    if (!(await exists(immutable.path))) {
      throw new Error(
        `Attempt 3 predecessor file is missing: ${immutable.relativePath}`
      );
    }
    const actualSha256 = await sha256(immutable.path);
    if (actualSha256 !== immutable.sha256) {
      throw new Error(
        `Attempt 3 predecessor SHA-256 mismatch: ${immutable.relativePath}`
      );
    }
    files.push({
      name: immutable.name,
      path: immutable.relativePath,
      sha256: actualSha256
    });
  }
  const inventory = await validateCanonicalInventory(
    attempt3EvidenceDirectory,
    {
      expectedCount: 27,
      expectedSha256: attempt3InventorySha256
    }
  );
  const nestedAttempt2 = await validateAttempt2Predecessor();
  const lock = await readJson(attempt3Files[0].path);
  const attempt = await readJson(attempt3Files[1].path);
  const approved = await readJson(attempt3Files[2].path);
  if (
    lock.schemaVersion !== 2 ||
    lock.attemptNumber !== 3 ||
    lock.phase !== "lock_acquired" ||
    resolve(lock.evidenceDirectory ?? "") !== attempt3EvidenceDirectory ||
    canonicalJson(lock.predecessor) !== canonicalJson(nestedAttempt2) ||
    canonicalJson(lock.executableAuthority) !==
      canonicalJson(attempt.executableAuthority) ||
    canonicalJson(lock.strictPreflight) !==
      canonicalJson(attempt.strictPreflight) ||
    lock.frozenManifestSha256 !== attempt.frozenManifestSha256 ||
    attempt.attempt !== 3 ||
    resolve(attempt.evidenceDirectory ?? "") !== attempt3EvidenceDirectory ||
    canonicalJson(attempt.predecessor) !== canonicalJson(nestedAttempt2) ||
    attempt.phase !== "INCOMPLETE" ||
    attempt.lastCompletedState !== "slot_consumed" ||
    attempt.status !== "INCOMPLETE" ||
    attempt.attemptSlotConsumed !== true ||
    attempt.countsAsAttempt !== false ||
    attempt.countsAsValidAttempt !== false ||
    attempt.harnessStatus !== "FAIL" ||
    attempt.executionFailed !== true ||
    attempt.desktopRows?.length !== 5 ||
    attempt.mobileRows?.length !== 0 ||
    !strictRequestLedgersPass(approved.requestLedgers)
  ) {
    throw new Error(
      "Attempt 3 predecessor state is not the immutable INCOMPLETE slot-consumed state."
    );
  }
  if (
    !Array.isArray(attempt.screenshotSnapshot) ||
    attempt.screenshotSnapshot.length !== 5 ||
    !(await verifyScreenshotSnapshot(
      attempt3EvidenceDirectory,
      attempt.screenshotSnapshot
    ))
  ) {
    throw new Error("Attempt 3 predecessor screenshots drifted.");
  }
  return {
    attemptNumber: 3,
    lockPath: attempt3Files[0].relativePath,
    evidenceDirectory: attempt3EvidenceDirectory,
    phase: attempt.phase,
    lastCompletedState: attempt.lastCompletedState,
    status: attempt.status,
    attemptSlotConsumed: attempt.attemptSlotConsumed,
    countsAsAttempt: attempt.countsAsAttempt,
    countsAsValidAttempt: attempt.countsAsValidAttempt,
    harnessStatus: attempt.harnessStatus,
    executionFailed: attempt.executionFailed,
    desktopScreenshotCount: attempt.desktopRows.length,
    mobileScreenshotCount: attempt.mobileRows.length,
    requestLedgersVerified: true,
    screenshotSnapshot: attempt.screenshotSnapshot,
    screenshotSnapshotVerified: true,
    inventory: {
      regularFileCount: inventory.regularFileCount,
      lockIncluded: false,
      algorithm:
        "posix-relative-path-byte-sort-two-spaces-String(mtimeMs)-final-LF",
      sha256: inventory.sha256
    },
    nestedAttempt2,
    files
  };
}

async function validateExactRecoveryModifications(frozen) {
  const predecessorManifest = await readJson(predecessorFiles[4].path);
  const predecessorByPath = new Map(
    (predecessorManifest.entries ?? []).map((entry) => [entry.path, entry])
  );
  const changedPaths = frozen.manifest.entries
    .filter(
      (entry) =>
        predecessorByPath.get(entry.path)?.sha256 !== entry.sha256 ||
        predecessorByPath.get(entry.path)?.mode !== entry.mode
    )
    .map(({ path }) => path);
  if (
    canonicalJson([...changedPaths].sort()) !==
    canonicalJson([...recoveryModificationPaths].sort())
  ) {
    throw new Error(
      `Recovery modifications must be the exact five ordered paths; received ${JSON.stringify(changedPaths)}.`
    );
  }
  return {
    status: "PASS",
    exactPathCount: 5,
    paths: recoveryModificationPaths
  };
}

async function validateExactAttempt4Modifications(frozen) {
  const attempt3Manifest = await readJson(attempt3Files[4].path);
  const attempt3ByPath = new Map(
    (attempt3Manifest.entries ?? []).map((entry) => [entry.path, entry])
  );
  const changedPaths = frozen.manifest.entries
    .filter(
      (entry) =>
        attempt3ByPath.get(entry.path)?.sha256 !== entry.sha256 ||
        attempt3ByPath.get(entry.path)?.mode !== entry.mode
    )
    .map(({ path }) => path);
  if (
    canonicalJson([...changedPaths].sort()) !==
    canonicalJson([...attempt4ModificationPaths].sort())
  ) {
    throw new Error(
      `Attempt 4 modifications must be the exact two ordered paths; received ${JSON.stringify(changedPaths)}.`
    );
  }
  return {
    status: "PASS",
    exactPathCount: 2,
    paths: attempt4ModificationPaths
  };
}

async function fsyncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeExclusiveJson(path, value) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(canonicalJson(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDirectory(dirname(path));
}

async function writeExclusiveBytes(path, bytes) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDirectory(dirname(path));
}

async function writeAtomicJson(path, value) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(canonicalJson(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
  await fsyncDirectory(dirname(path));
}

function run(command, args, { logPath, env = {} } = {}) {
  return new Promise((resolveRun) => {
    const startedAt = new Date().toISOString();
    const log = createWriteStream(logPath, { flags: "wx" });
    log.write(`$ ${command} ${args.join(" ")}\n`);
    const child = spawn(command, args, {
      cwd: projectDirectory,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    const finish = (exitCode, signal, error = null) => {
      if (settled) return;
      settled = true;
      if (error) log.write(`${error.stack ?? error.message}\n`);
      log.end(() =>
        resolveRun({
          startedAt,
          completedAt: new Date().toISOString(),
          exitCode,
          signal,
          error: error?.message ?? null
        })
      );
    };
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once("error", (error) => finish(1, null, error));
    child.once("close", (exitCode, signal) =>
      finish(exitCode ?? 1, signal ?? null)
    );
  });
}

function capture(command, args) {
  return new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(command, args, {
      cwd: projectDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", rejectCapture);
    child.once("close", (exitCode, signal) => {
      if (exitCode !== 0) {
        rejectCapture(
          new Error(
            `${command} exited ${exitCode} (${signal ?? "no signal"}): ${Buffer.concat(stderr).toString("utf8")}`
          )
        );
        return;
      }
      resolveCapture(Buffer.concat(stdout));
    });
  });
}

function parsePorcelain(buffer) {
  const tokens = buffer.toString("utf8").split("\0").filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const status = token.slice(0, 2);
    const path = token.slice(3);
    entries.push({ status, path });
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return entries;
}

async function validateAuthority() {
  const files = [
    ["request", requestPath],
    ["approval", approvalPath],
    ["preEditGate", preEditGatePath],
    ["changeIntent", changeIntentPath],
    ["handoff", handoffPath],
    ["backdrop", backdropPath]
  ];
  for (const [name, path] of files) {
    if ((await sha256(path)) !== authority[name]) {
      throw new Error(`${name} authority SHA-256 mismatch.`);
    }
  }
  const request = await readJson(requestPath);
  const approval = await readJson(approvalPath);
  const preEditGate = await readJson(preEditGatePath);
  const changeIntent = await readJson(changeIntentPath);
  const handoff = await readJson(handoffPath);
  const requestPaths = (request.entries ?? []).map(({ path }) => path);
  const g005Entries = (changeIntent.entries ?? []).filter(
    ({ storyId }) => storyId === "G005"
  );
  if (
    request.storyId !== "G005" ||
    requestPaths.length !== 39 ||
    new Set(requestPaths).size !== 39
  ) {
    throw new Error("G005 request must contain exactly 39 unique ordered paths.");
  }
  if (
    approval.verdict !== "APPROVE" ||
    approval.request?.sha256 !== authority.request ||
    approval.exactSetEvidence?.requestUniquePathCount !== 39
  ) {
    throw new Error("G005 exact-39 approval is not authoritative.");
  }
  if (
    preEditGate.verdict !== "PASS" ||
    preEditGate.exactScopeEvidence?.uniquePathCount !== 39 ||
    preEditGate.authorizationChain?.request?.sha256 !== authority.request ||
    preEditGate.authorizationChain?.approval?.sha256 !== authority.approval ||
    preEditGate.authorizationChain?.changeIntent?.sha256 !==
      authority.changeIntent
  ) {
    throw new Error("G005 immediate pre-edit gate is not PASS for exact 39.");
  }
  if (
    g005Entries.length !== 39 ||
    g005Entries.some(({ path }, index) => path !== requestPaths[index])
  ) {
    throw new Error("G005 change-intent entries must exactly match request order.");
  }
  if (
    handoff.terminal_state !== "complete" ||
    handoff.current_superseding_handoff !== true ||
    handoff.execution_handoff_allowed !== true ||
    handoff.ralplan_consensus_gate?.complete !== true ||
    handoff.final_ralplan_architect_review?.verdict !== "APPROVE" ||
    handoff.final_ralplan_critic_review?.verdict !== "APPROVE" ||
    handoff.scope_protection?.exact_path_count !== 39 ||
    handoff.scope_protection?.request?.sha256 !== authority.request ||
    handoff.scope_protection?.approval?.sha256 !== authority.approval ||
    handoff.scope_protection?.change_intent?.sha256 !== authority.changeIntent
  ) {
    throw new Error("Final RALPLAN handoff consensus or exact-39 scope is invalid.");
  }
  return { request, approval, preEditGate, changeIntent, handoff, requestPaths };
}

async function freezeCurrentManifest() {
  const validated = await validateAuthority();
  const entries = [];
  for (const requestEntry of validated.request.entries) {
    const absolutePath = join(projectDirectory, requestEntry.path);
    if (!(await exists(absolutePath))) {
      throw new Error(`Authorized path is missing after implementation: ${requestEntry.path}`);
    }
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) {
      throw new Error(`Authorized path is not a regular file: ${requestEntry.path}`);
    }
    entries.push({
      path: requestEntry.path,
      operation: requestEntry.operation,
      mode: metadata.mode & 0o777,
      size: metadata.size,
      sha256: await sha256(absolutePath)
    });
  }
  const manifest = {
    schemaVersion: 1,
    storyId: "G005",
    canonicalOrder: "allowlist-request",
    exactPathCount: 39,
    authority: {
      requestSha256: authority.request,
      approvalSha256: authority.approval,
      preEditGateSha256: authority.preEditGate,
      changeIntentSha256: authority.changeIntent,
      handoffSha256: authority.handoff,
      backdropSha256: authority.backdrop
    },
    entries
  };
  const bytes = Buffer.from(canonicalJson(manifest));
  return {
    manifest,
    bytes,
    sha256: sha256Buffer(bytes),
    validated
  };
}

async function verifyFrozenManifest(expectedSha256) {
  const current = await freezeCurrentManifest();
  if (current.sha256 !== expectedSha256) {
    throw new Error(
      `Frozen exact-39 manifest drifted: expected ${expectedSha256}, received ${current.sha256}.`
    );
  }
  return current;
}

async function validateLegacyAttempt() {
  const before = await sha256(legacyAttemptPath);
  const manifest = await readJson(legacyAttemptPath);
  const validProjection =
    manifest.countsAsAttempt === true &&
    ["PASS", "FAIL"].includes(manifest.status) &&
    manifest.executionFailed === false;
  const acceptsMissingAttempt2Fields =
    !("attemptSlotConsumed" in manifest) &&
    !("countsAsValidAttempt" in manifest) &&
    !("phase" in manifest);
  const after = await sha256(legacyAttemptPath);
  const result = {
    mode: "LEGACY_READ_ONLY_CHECK",
    path: relative(projectDirectory, legacyAttemptPath),
    beforeSha256: before,
    afterSha256: after,
    expectedSha256: authority.legacyAttempt,
    schemaVersion: manifest.schemaVersion,
    status: manifest.status,
    executionFailed: manifest.executionFailed,
    validAttemptProjection: validProjection,
    acceptsMissingAttempt2Fields,
    evidenceWrites: 0,
    result:
      before === authority.legacyAttempt &&
      after === authority.legacyAttempt &&
      manifest.schemaVersion === 2 &&
      manifest.status === "FAIL" &&
      validProjection &&
      acceptsMissingAttempt2Fields
        ? "PASS"
        : "FAIL"
  };
  if (result.result !== "PASS") throw new Error("Legacy attempt 1 compatibility failed.");
  return result;
}

async function buildOutsideAllowlistManifest(
  evidenceDirectory,
  frozen,
  { write = true } = {}
) {
  const dirtyBaseline = await readJson(dirtyBaselinePath);
  const authorizedPaths = new Set(
    (frozen.validated.changeIntent.entries ?? []).map(({ path }) => path)
  );
  const protectedPrefixes = ["app/", "tests/", "docs/", "public/assets/"];
  const isProtected = (path) =>
    protectedPrefixes.some((prefix) => path.startsWith(prefix));
  const isGeneratedCache = (path) =>
    generatedCacheExclusions.some((prefix) => path.startsWith(prefix));
  const baselineByPath = new Map(
    (dirtyBaseline.entries ?? [])
      .filter(({ path }) => isProtected(path) && !isGeneratedCache(path))
      .map((entry) => [entry.path, entry])
  );
  const currentStatus = parsePorcelain(
    await capture("git", [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all"
    ])
  ).filter(({ path }) => isProtected(path) && !isGeneratedCache(path));
  const currentByPath = new Map(currentStatus.map((entry) => [entry.path, entry]));
  const drift = [];
  for (const path of new Set([...baselineByPath.keys(), ...currentByPath.keys()])) {
    if (authorizedPaths.has(path)) continue;
    const baseline = baselineByPath.get(path) ?? null;
    const current = currentByPath.get(path) ?? null;
    const currentSha256 =
      current && (await exists(join(projectDirectory, path)))
        ? await sha256(join(projectDirectory, path))
        : null;
    if (
      baseline?.status === current?.status &&
      baseline?.contentSha256 === currentSha256
    ) {
      continue;
    }
    drift.push({
      path,
      baselineStatus: baseline?.status ?? null,
      currentStatus: current?.status ?? null,
      baselineSha256: baseline?.contentSha256 ?? null,
      currentSha256
    });
  }
  drift.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    storyId: "G005",
    exactAuthorizedPathCount: 39,
    frozenManifestSha256: frozen.sha256,
    outsideAllowlistDrift: {
      result: drift.length === 0 ? "PASS" : "FAIL",
      detected: drift.length > 0,
      protectedPrefixes,
      generatedCacheExclusions,
      authorizedPathsSource: relative(projectDirectory, changeIntentPath),
      dirtyBaselineSource: relative(projectDirectory, dirtyBaselinePath),
      drift
    }
  };
  const path = write
    ? join(evidenceDirectory, "modification-diff-manifest.json")
    : null;
  if (path) await writeAtomicJson(path, manifest);
  return { path, manifest, driftDetected: drift.length > 0 };
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "server did not answer";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/en`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}/en: ${lastError}`);
}

async function serverIsReady(url) {
  try {
    return (await fetch(`${url}/en`)).ok;
  } catch {
    return false;
  }
}

function strictSeamEvidencePasses(seam) {
  return (
    seam?.method === "browser-canvas-image-data" &&
    seam?.passed === true &&
    seam?.outsideMaskChangedPixelCount === 0 &&
    Number.isFinite(seam?.boundaryMaximumDelta) &&
    seam.boundaryMaximumDelta >= 0 &&
    seam.boundaryMaximumDelta <= 1 &&
    seam?.seamComponentCount === 0 &&
    Number.isFinite(seam?.maximumChannelDelta) &&
    seam.maximumChannelDelta >= 0 &&
    Number.isFinite(seam?.changedPixelCount) &&
    Number.isInteger(seam.changedPixelCount) &&
    seam.changedPixelCount >= 0 &&
    Array.isArray(seam?.normalizedPolygons) &&
    seam.normalizedPolygons.length > 0 &&
    seam.normalizedPolygons.every(
      (polygon) =>
        Array.isArray(polygon) &&
        polygon.length >= 3 &&
        polygon.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every(
              (coordinate) =>
                Number.isFinite(coordinate) &&
                coordinate >= 0 &&
                coordinate <= 1
            )
        )
    )
  );
}

const playerRatioEpsilon = Number.EPSILON;

function finiteBoundsWithin(bounds, maximumX, maximumY) {
  return (
    bounds !== null &&
    typeof bounds === "object" &&
    [
      bounds.minimumX,
      bounds.minimumY,
      bounds.maximumX,
      bounds.maximumY
    ].every(Number.isFinite) &&
    bounds.minimumX >= 0 &&
    bounds.minimumY >= 0 &&
    bounds.maximumX <= maximumX &&
    bounds.maximumY <= maximumY &&
    bounds.minimumX <= bounds.maximumX &&
    bounds.minimumY <= bounds.maximumY
  );
}

function ratioMatches(actual, expected) {
  return (
    Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    Math.abs(actual - expected) <= playerRatioEpsilon
  );
}

function strictPlayerProofPasses(proof, expectedProfile, expectedZone) {
  const occlusion = proof?.occlusion;
  const minimumRatio = expectedZone === "airport" ? 0.12 : 0.18;
  const maximumRatio = expectedZone === "airport" ? 0.3 : 0.4;
  const playerAlphaPixels = occlusion?.playerAlphaPixels;
  const intersectionAlphaPixels = occlusion?.intersectionAlphaPixels;
  const measuredIntersectionRatio =
    Number.isInteger(playerAlphaPixels) && playerAlphaPixels > 0
      ? intersectionAlphaPixels / playerAlphaPixels
      : Number.NaN;
  return (
    proof?.passed === true &&
    proof?.visibleState?.profile === expectedProfile &&
    proof?.visibleState?.zone === expectedZone &&
    proof?.foregroundUnchanged === true &&
    Array.isArray(proof?.failedPredicates) &&
    proof.failedPredicates.length === 0 &&
    occlusion?.coordinateSpace === "normalized-image-frame" &&
    occlusion?.passed === true &&
    !Object.prototype.hasOwnProperty.call(
      occlusion,
      "outsideMaskChangedPixelCount"
    ) &&
    occlusion?.equivalence?.passed === true &&
    occlusion?.equivalence?.equivalenceTolerance === 0 &&
    Number.isInteger(occlusion?.equivalence?.polygonCount) &&
    occlusion.equivalence.polygonCount > 0 &&
    Number.isInteger(occlusion?.equivalence?.pointCount) &&
    occlusion.equivalence.pointCount >= 3 &&
    occlusion?.classificationParity?.passed === true &&
    Number.isInteger(occlusion?.classificationParity?.mismatchCount) &&
    occlusion.classificationParity.mismatchCount === 0 &&
    Number.isInteger(
      occlusion?.classificationParity?.comparedAlphaPixels
    ) &&
    occlusion?.classificationParity?.comparedAlphaPixels ===
      playerAlphaPixels &&
    occlusion?.normalizedPolygonCount ===
      occlusion?.equivalence?.polygonCount &&
    occlusion?.sourcePolygonCount === occlusion?.equivalence?.polygonCount &&
    finiteBoundsWithin(occlusion?.normalizedPointBounds, 1, 1) &&
    finiteBoundsWithin(occlusion?.measuredNormalizedPlayerBounds, 1, 1) &&
    finiteBoundsWithin(occlusion?.sourcePointBounds, 1817, 866) &&
    Number.isInteger(playerAlphaPixels) &&
    playerAlphaPixels > 0 &&
    Number.isInteger(intersectionAlphaPixels) &&
    intersectionAlphaPixels >= 0 &&
    intersectionAlphaPixels <= playerAlphaPixels &&
    ratioMatches(
      occlusion?.intersectionRatio,
      measuredIntersectionRatio
    ) &&
    occlusion?.ratioConsistencyTolerance === playerRatioEpsilon &&
    occlusion.intersectionRatio >= minimumRatio &&
    occlusion.intersectionRatio <= maximumRatio &&
    ratioMatches(
      occlusion?.playerRemainingRatio,
      1 - measuredIntersectionRatio
    ) &&
    occlusion.playerRemainingRatio >= 0.65 &&
    Number.isFinite(occlusion?.alphaBottomToFootCssPixels) &&
    occlusion.alphaBottomToFootCssPixels >= 0 &&
    occlusion.alphaBottomToFootCssPixels <= 2 &&
    Array.isArray(occlusion?.failedPredicates) &&
    occlusion.failedPredicates.length === 0
  );
}

function strictPlayerProofsPass(playerProofs) {
  return (
    playerProofs &&
    Object.keys(playerProofs).sort().join(",") ===
      "desktopAirport,desktopHanabi,mobileHanabi" &&
    strictPlayerProofPasses(
      playerProofs.desktopAirport,
      "desktop",
      "airport"
    ) &&
    strictPlayerProofPasses(
      playerProofs.desktopHanabi,
      "desktop",
      "hanabi"
    ) &&
    strictPlayerProofPasses(
      playerProofs.mobileHanabi,
      "mobile",
      "hanabi"
    )
  );
}

function expectedLedgerAssets(character) {
  return [
    "",
    "-back",
    "-run-front-a",
    "-run-front-b",
    "-run-back-a",
    "-run-back-b",
    "-run-right",
    "-run-right-b"
  ]
    .map(
      (suffix) =>
        `/assets/characters/runtime/player-${character}${suffix}.webp`
    )
    .sort();
}

function strictRequestLedgersPass(ledgers) {
  const identities = [
    {
      identity: "desktop-male",
      profile: "desktop",
      viewport: { width: 1440, height: 900 },
      character: "male"
    },
    {
      identity: "desktop-female",
      profile: "desktop",
      viewport: { width: 1440, height: 900 },
      character: "female"
    },
    {
      identity: "mobile-female",
      profile: "mobile",
      viewport: { width: 390, height: 844 },
      character: "female"
    }
  ];
  return (
    Array.isArray(ledgers) &&
    ledgers.length === identities.length &&
    ledgers.every((ledger, index) => {
      const expected = identities[index];
      const runtimeAssets = Array.isArray(ledger.runtimeAssets)
        ? [...ledger.runtimeAssets].sort()
        : [];
      const runtimeRequests = Array.isArray(ledger.requests)
        ? [
            ...new Set(
              ledger.requests.filter(
                (path) =>
                  typeof path === "string" &&
                  path.startsWith(
                    "/assets/characters/runtime/player-"
                  ) &&
                  path.endsWith(".webp")
              )
            )
          ].sort()
        : [];
      const approvedSourceRequests = Array.isArray(ledger.requests)
        ? ledger.requests.filter(
            (path) =>
              path === "/assets/world/world-environment-concept.png"
          )
        : [];
      const measurements = Array.isArray(
        ledger.runtimeAssetMeasurements
      )
        ? [...ledger.runtimeAssetMeasurements].sort((left, right) =>
            left.asset.localeCompare(right.asset)
          )
        : [];
      const opposite =
        expected.character === "male" ? "female" : "male";
      return (
        ledger.identity === expected.identity &&
        ledger.profile === expected.profile &&
        canonicalJson(ledger.viewport) === canonicalJson(expected.viewport) &&
        ledger.character === expected.character &&
        Array.isArray(ledger.requests) &&
        canonicalJson(runtimeAssets) ===
          canonicalJson(expectedLedgerAssets(expected.character)) &&
        canonicalJson(runtimeRequests) === canonicalJson(runtimeAssets) &&
        runtimeAssets.every(
          (asset) => !asset.includes(`player-${opposite}`)
        ) &&
        measurements.length === 8 &&
        measurements.every(
          ({ asset, naturalWidth, naturalHeight }, measurementIndex) =>
            asset === runtimeAssets[measurementIndex] &&
            naturalWidth === 768 &&
            naturalHeight === 1152
        ) &&
        Array.isArray(ledger.approvedSourceRequests) &&
        ledger.approvedSourceRequests.length >= 1 &&
        canonicalJson(ledger.approvedSourceRequests) ===
          canonicalJson(approvedSourceRequests) &&
        ledger.approvedSourceRequests.every(
          (asset) =>
            asset === "/assets/world/world-environment-concept.png"
        ) &&
        canonicalJson(ledger.approvedSourceDom) ===
          canonicalJson({
            backdropSource:
              "/assets/world/world-environment-concept.png",
            backdropComplete: true,
            backdropNaturalWidth: 1817,
            backdropNaturalHeight: 866,
            foregroundSource:
              "/assets/world/world-environment-concept.png",
            foregroundComplete: true,
            foregroundNaturalWidth: 1817,
            foregroundNaturalHeight: 866
          }) &&
        Array.isArray(ledger.errors) &&
        ledger.errors.length === 0
      );
    })
  );
}

async function validateApprovedReference(evidenceDirectory) {
  const path = join(evidenceDirectory, "approved-reference.json");
  if (!(await exists(path))) return { evidence: null, blockers: ["approved-reference.json is missing."] };
  const evidence = await readJson(path);
  const blockers = [];
  const desktopIds = (evidence.desktop?.rows ?? []).map(({ id }) => id);
  const mobileIds = (evidence.mobile?.rows ?? []).map(({ id }) => id);
  if (JSON.stringify(desktopIds) !== JSON.stringify(desktopRows)) {
    blockers.push("Desktop evidence must contain the exact 12 unique rows in order.");
  }
  if (JSON.stringify(mobileIds) !== JSON.stringify(mobileRows)) {
    blockers.push("Mobile evidence must contain the exact five unique rows in order.");
  }
  if (
    evidence.desktop?.viewport?.width !== 1440 ||
    evidence.desktop?.viewport?.height !== 900 ||
    evidence.mobile?.viewport?.width !== 390 ||
    evidence.mobile?.viewport?.height !== 844
  ) {
    blockers.push("Desktop or mobile viewport contract is invalid.");
  }
  if (
    evidence.authorizedPathCount !== 39 ||
    evidence.approvedSource?.asset !==
      "/assets/world/world-environment-concept.png" ||
    evidence.approvedSource?.naturalWidth !== 1817 ||
    evidence.approvedSource?.naturalHeight !== 866 ||
    evidence.approvedSource?.backdropImageCount !== 1 ||
    evidence.approvedSource?.foregroundImageCount !== 1
  ) {
    blockers.push("Approved backdrop/foreground source identity is invalid.");
  }
  if (
    evidence.assertions?.exactDesktopRows !== true ||
    evidence.assertions?.exactMobileRows !== true ||
    evidence.assertions?.exactDesktopScreenshotCount !== true ||
    evidence.assertions?.exactMobileScreenshotCount !== true ||
    evidence.assertions?.zeroRuntimeErrors !== true ||
    evidence.assertions?.zeroActionErrors !== true ||
    evidence.assertions?.clipSeamPassed !== true ||
    evidence.assertions?.exactFreshContextRequestLedgers !== true
  ) {
    blockers.push("Top-level browser assertions are incomplete.");
  }
  if (
    !strictSeamEvidencePasses(evidence.clipSeam)
  ) {
    blockers.push("Same-source foreground clip seam evidence failed.");
  }
  if (
    !Array.isArray(evidence.errors) ||
    evidence.errors.length !== 0 ||
    !Array.isArray(evidence.actionErrors) ||
    evidence.actionErrors.length !== 0
  ) {
    blockers.push("Runtime or action errors were recorded.");
  }
  if (!strictRequestLedgersPass(evidence.requestLedgers)) {
    blockers.push("Character/source request ledgers are incomplete.");
  }
  const screenshots = [
    ...(evidence.screenshots?.desktop ?? []),
    ...(evidence.screenshots?.mobile ?? [])
  ];
  if (screenshots.length !== 17) blockers.push("Screenshot inventory must contain exactly 17 files.");
  for (const screenshot of screenshots) {
    const screenshotPath = resolve(evidenceDirectory, screenshot);
    if (
      relative(evidenceDirectory, screenshotPath).startsWith("..") ||
      !(await exists(screenshotPath))
    ) {
      blockers.push(`Screenshot is missing: ${screenshot}`);
    }
  }
  return { evidence, blockers };
}

function hasExactPassingGates(attempt) {
  return (
    Array.isArray(attempt.namedGateResults) &&
    attempt.namedGateResults.length === 8 &&
    requiredGateIds.every(
      (id) =>
        attempt.namedGateResults.filter((result) => result.id === id).length ===
          1 &&
        attempt.namedGateResults.find((result) => result.id === id)?.status ===
          "PASS"
    )
  );
}

async function snapshotPaths(evidenceDirectory, paths) {
  return Promise.all(
    paths.map(async (path) => {
      const absolutePath = join(evidenceDirectory, path);
      const metadata = await stat(absolutePath);
      return {
        path,
        sha256: await sha256(absolutePath),
        size: metadata.size,
        mtimeMs: metadata.mtimeMs
      };
    })
  );
}

async function screenshotSnapshot(evidenceDirectory, evidence) {
  return snapshotPaths(evidenceDirectory, [
    ...(evidence.screenshots?.desktop ?? []),
    ...(evidence.screenshots?.mobile ?? [])
  ]);
}

async function verifyScreenshotSnapshot(evidenceDirectory, expected) {
  try {
    const actual = await snapshotPaths(
      evidenceDirectory,
      expected.map(({ path }) => path)
    );
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

async function verifyExactScreenshotSnapshot(
  evidenceDirectory,
  expectedPaths,
  expected
) {
  return (
    Array.isArray(expected) &&
    canonicalJson(expected.map(({ path }) => path)) ===
      canonicalJson(expectedPaths) &&
    expected.every(
      ({ path, sha256: digest, size, mtimeMs }) =>
        typeof path === "string" &&
        /^[a-f0-9]{64}$/.test(digest) &&
        Number.isInteger(size) &&
        size > 0 &&
        Number.isFinite(mtimeMs)
    ) &&
    (await verifyScreenshotSnapshot(evidenceDirectory, expected))
  );
}

async function recursiveFileInventory(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const inventory = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      inventory.push(
        ...(await recursiveFileInventory(join(directory, entry.name), path))
      );
    } else if (entry.isFile()) {
      inventory.push(path);
    } else {
      throw new Error(`Preflight contains a non-regular entry: ${path}`);
    }
  }
  return inventory.sort();
}

const strictPreflightScreenshots = [
  "desktop/zone-airport.png",
  "desktop/zone-hanabi.png",
  "mobile/world-female.png",
  "mobile/full-map.png"
];

async function validateStrictPreflight(
  evidenceDirectory,
  {
    expectedFrozenManifestSha256 = null,
    requireAttempt4LockAbsent = false
  } = {}
) {
  const resolvedDirectory = resolve(evidenceDirectory);
  const evidencePath = join(resolvedDirectory, "strict-preflight.json");
  if (!(await exists(evidencePath))) {
    throw new Error("Passing strict-preflight.json is missing.");
  }
  const evidence = await readJson(evidencePath);
  const currentAuthority = await validateExecutableAuthority(
    evidence.executableAuthority
  );
  const predecessor = await validateAttempt3Predecessor();
  const screenshotSnapshotVerified =
    await verifyExactScreenshotSnapshot(
      resolvedDirectory,
      strictPreflightScreenshots,
      evidence.screenshotSnapshot
    );
  if (
    evidence.schemaVersion !== 3 ||
    evidence.mode !== "strict-preflight" ||
    evidence.status !== "PASS" ||
    evidence.attemptNumber !== 4 ||
    evidence.countsAsAttempt !== false ||
    evidence.createsGlobalLock !== false ||
    evidence.createsReviews !== false ||
    resolve(evidence.evidenceDirectory ?? "") !== resolvedDirectory ||
    (expectedFrozenManifestSha256 !== null &&
      evidence.candidateFrozenManifestSha256 !==
        expectedFrozenManifestSha256) ||
    canonicalJson(evidence.predecessor) !== canonicalJson(predecessor) ||
    evidence.recoveryModifications?.status !== "PASS" ||
    evidence.recoveryModifications?.exactPathCount !== 5 ||
    canonicalJson(evidence.recoveryModifications?.paths) !==
      canonicalJson(recoveryModificationPaths) ||
    evidence.attempt4Modifications?.status !== "PASS" ||
    evidence.attempt4Modifications?.exactPathCount !== 2 ||
    canonicalJson(evidence.attempt4Modifications?.paths) !==
      canonicalJson(attempt4ModificationPaths) ||
    evidence.outsideAllowlist?.result !== "PASS" ||
    evidence.outsideAllowlist?.detected !== false ||
    !hasExactPassingGates(evidence) ||
    !strictSeamEvidencePasses(evidence.clipSeam) ||
    !strictPlayerProofsPass(evidence.playerProofs) ||
    !strictRequestLedgersPass(evidence.requestLedgers) ||
    canonicalJson(evidence.screenshots) !==
      canonicalJson(strictPreflightScreenshots) ||
    !screenshotSnapshotVerified ||
    !Array.isArray(evidence.errors) ||
    evidence.errors.length !== 0
  ) {
    throw new Error("Strict preflight evidence is not the exact passing non-consuming contract.");
  }
  assertCanonicalTuple(currentAuthority, "Current strict preflight");
  for (const screenshot of strictPreflightScreenshots) {
    if (!(await exists(join(resolvedDirectory, screenshot)))) {
      throw new Error(`Strict preflight screenshot is missing: ${screenshot}`);
    }
  }
  for (const forbidden of [
    "architecture-attempt.json",
    "attempt-slot-consumed.json",
    "vision-review.json",
    "verifier-review.json",
    "approved-reference.json"
  ]) {
    if (await exists(join(resolvedDirectory, forbidden))) {
      throw new Error(`Strict preflight created forbidden artifact: ${forbidden}`);
    }
  }
  const inventory = await recursiveFileInventory(resolvedDirectory);
  const allowed = inventory.every(
    (path) =>
      path === "strict-preflight.json" ||
      strictPreflightScreenshots.includes(path) ||
      path.endsWith(".log")
  );
  if (!allowed) {
    throw new Error(
      `Strict preflight inventory contains forbidden artifacts: ${JSON.stringify(inventory)}`
    );
  }
  if (
    requireAttempt4LockAbsent &&
    (await exists(globalLockPathForAttempt(4)))
  ) {
    throw new Error("Attempt 4 lock must not exist while validating strict preflight.");
  }
  return {
    evidence,
    evidencePath,
    sha256: await sha256(evidencePath),
    inventory,
    predecessor,
    screenshotSnapshot: evidence.screenshotSnapshot
  };
}

function reviewPathFromEnvironment(name, fallback) {
  const value = process.env[name] ?? fallback;
  return isAbsolute(value) ? value : resolve(projectDirectory, value);
}

function terminalReviewOutcome(visionVerdict, verifierVerdict) {
  const reviewFailed =
    visionVerdict === "FAIL" || verifierVerdict === "FAIL";
  return {
    status: reviewFailed ? "FAIL" : "PASS",
    countsAsAttempt: !reviewFailed,
    countsAsValidAttempt: !reviewFailed,
    executionFailed: reviewFailed
  };
}

async function readReview(path, expectedRole, storedAttempt, evidenceDirectory) {
  if (!(await exists(path))) return { valid: false, blocker: `${expectedRole} review is missing.` };
  const review = await readJson(path);
  let validVerifierAuthority = true;
  if (expectedRole === "verifier") {
    try {
      await validateExecutableAuthority(
        storedAttempt.executableAuthority,
        review.executableAuthority
      );
    } catch {
      validVerifierAuthority = false;
    }
  }
  const dimensions = review.pivotDimensions;
  const levels = ["info", "low", "medium", "high"];
  const validDimensions =
    dimensions &&
    ["grounding", "occlusion", "characterIntegration"].every((key) =>
      levels.includes(dimensions[key])
    );
  const reviewerIdentity =
    review.reviewerIdentity ?? review.reviewer?.id ?? review.reviewer;
  const reviewedAt = review.reviewedAt;
  const reviewEvidenceDirectory = resolve(review.evidenceDirectory ?? "");
  const valid =
    (review.attemptNumber ?? review.attempt) === storedAttempt.attempt &&
    reviewEvidenceDirectory === evidenceDirectory &&
    review.agentRole === expectedRole &&
    typeof reviewerIdentity === "string" &&
    reviewerIdentity.trim() !== "" &&
    ["PASS", "FAIL"].includes(review.verdict) &&
    typeof reviewedAt === "string" &&
    Number.isFinite(Date.parse(reviewedAt)) &&
    validDimensions &&
    validVerifierAuthority;
  return valid
    ? {
        valid: true,
        path,
        verdict: review.verdict,
        reviewedAt,
        reviewerIdentity: reviewerIdentity.trim(),
        agentRole: review.agentRole,
        pivotDimensions: dimensions,
        executableAuthority: review.executableAuthority ?? null
      }
    : {
        valid: false,
        blocker: `${expectedRole} review must identify this attempt/directory, role, reviewer, ordered time, PASS|FAIL, normalized pivotDimensions, and verifier authority.`
      };
}

async function readAndValidateLock(expectedAttemptNumber = 4) {
  if (expectedAttemptNumber !== 4) {
    throw new Error(
      "Attempts 2 and 3 are immutable and non-finalizable; only attempt 4 is supported."
    );
  }
  const lockPath = globalLockPathForAttempt(expectedAttemptNumber);
  const lock = await readJson(lockPath);
  if (
    lock.schemaVersion !== 2 ||
    lock.attemptNumber !== expectedAttemptNumber ||
    lock.phase !== "lock_acquired" ||
    typeof lock.evidenceDirectory !== "string" ||
    typeof lock.frozenManifestSha256 !== "string" ||
    lock.attempt4Modifications?.status !== "PASS" ||
    lock.attempt4Modifications?.exactPathCount !== 2 ||
    canonicalJson(lock.attempt4Modifications?.paths) !==
      canonicalJson(attempt4ModificationPaths) ||
    typeof lock.strictPreflight?.evidenceDirectory !== "string" ||
    typeof lock.strictPreflight?.sha256 !== "string" ||
    !Array.isArray(lock.strictPreflight?.screenshotSnapshot)
  ) {
    throw new Error("Attempt-specific global lock is structurally invalid.");
  }
  await validateExecutableAuthority(lock.executableAuthority);
  const predecessor = await validateAttempt3Predecessor();
  const currentFrozen = await verifyFrozenManifest(
    lock.frozenManifestSha256
  );
  const attempt4Modifications =
    await validateExactAttempt4Modifications(currentFrozen);
  if (canonicalJson(lock.predecessor) !== canonicalJson(predecessor)) {
    throw new Error("Attempt 4 lock predecessor tuple mismatch.");
  }
  if (
    canonicalJson(lock.attempt4Modifications) !==
    canonicalJson(attempt4Modifications)
  ) {
    throw new Error("Attempt 4 lock exact-two modification tuple mismatch.");
  }
  const preflight = await validateStrictPreflight(
    lock.strictPreflight.evidenceDirectory,
    { expectedFrozenManifestSha256: lock.frozenManifestSha256 }
  );
  if (
    preflight.sha256 !== lock.strictPreflight.sha256 ||
    resolve(lock.strictPreflight.evidenceDirectory) !==
      resolve(preflight.evidence.evidenceDirectory) ||
    canonicalJson(lock.strictPreflight.screenshotSnapshot) !==
      canonicalJson(preflight.screenshotSnapshot)
  ) {
    throw new Error("Attempt 4 lock strict-preflight hash or directory mismatch.");
  }
  return lock;
}

async function finalizeAttempt(attemptNumber, evidenceDirectory) {
  if (attemptNumber !== 4) {
    throw new Error("Attempts 2 and 3 are immutable and cannot be finalized.");
  }
  const lock = await readAndValidateLock(attemptNumber);
  if (resolve(lock.evidenceDirectory) !== evidenceDirectory) {
    throw new Error("Explicit finalize directory does not match the global lock.");
  }
  const sourceManifestPath = join(
    evidenceDirectory,
    "attempt-source-test-hashes.json"
  );
  const attemptPath = join(evidenceDirectory, "architecture-attempt.json");
  if (!(await exists(sourceManifestPath)) || !(await exists(attemptPath))) {
    throw new Error("Finalize requires the locked root source and attempt manifests.");
  }
  if ((await sha256(sourceManifestPath)) !== lock.frozenManifestSha256) {
    throw new Error("Locked frozen manifest digest does not match root manifest.");
  }
  await verifyFrozenManifest(lock.frozenManifestSha256);
  const attempt = await readJson(attemptPath);
  await validateExecutableAuthority(
    lock.executableAuthority,
    attempt.executableAuthority
  );
  if (
    attempt.attempt !== attemptNumber ||
    resolve(attempt.evidenceDirectory) !== evidenceDirectory ||
    attempt.phase !== "capture_complete" ||
    attempt.lastCompletedState !== "capture_complete" ||
    attempt.attemptSlotConsumed !== true ||
    attempt.countsAsValidAttempt !== false
  ) {
    throw new Error("Only capture_complete locked evidence may be finalized.");
  }
  if (
    canonicalJson(attempt.predecessor) !== canonicalJson(lock.predecessor) ||
    canonicalJson(attempt.attempt4Modifications) !==
      canonicalJson(lock.attempt4Modifications) ||
    canonicalJson(attempt.strictPreflight) !==
      canonicalJson(lock.strictPreflight)
  ) {
    throw new Error("Architecture manifest authority chain differs from lock.");
  }
  if (
    !(await verifyScreenshotSnapshot(
      evidenceDirectory,
      attempt.screenshotSnapshot ?? []
    ))
  ) {
    throw new Error("Screenshot SHA-256, size, or mtime drifted before finalize.");
  }
  const visionPath = reviewPathFromEnvironment(
    "ARCHITECTURE_VISION_REVIEW_PATH",
    join(evidenceDirectory, "vision-review.json")
  );
  const verifierPath = reviewPathFromEnvironment(
    "ARCHITECTURE_VERIFIER_REVIEW_PATH",
    join(evidenceDirectory, "verifier-review.json")
  );
  const inside = [visionPath, verifierPath].every((path) => {
    const child = relative(evidenceDirectory, resolve(path));
    return child !== "" && !child.startsWith("..") && !isAbsolute(child);
  });
  const vision = await readReview(
    visionPath,
    "vision",
    attempt,
    evidenceDirectory
  );
  const verifier = await readReview(
    verifierPath,
    "verifier",
    attempt,
    evidenceDirectory
  );
  const reviewsValid =
    inside &&
    resolve(visionPath) !== resolve(verifierPath) &&
    vision.valid &&
    verifier.valid &&
    vision.reviewerIdentity !== verifier.reviewerIdentity &&
    Date.parse(verifier.reviewedAt) > Date.parse(vision.reviewedAt);
  if (!reviewsValid) {
    const blockers = [
      ...(inside ? [] : ["Both reviews must be inside the evidence directory."]),
      ...(vision.valid ? [] : [vision.blocker]),
      ...(verifier.valid ? [] : [verifier.blocker]),
      ...(vision.valid &&
      verifier.valid &&
      vision.reviewerIdentity === verifier.reviewerIdentity
        ? ["Review identities must be distinct."]
        : []),
      ...(vision.valid &&
      verifier.valid &&
      Date.parse(verifier.reviewedAt) <= Date.parse(vision.reviewedAt)
        ? ["Verifier review must be later than vision review."]
        : [])
    ];
    attempt.blockers = [...new Set([...(attempt.blockers ?? []), ...blockers])];
    attempt.blocker = attempt.blockers[0] ?? null;
    attempt.status = "INCOMPLETE";
    attempt.countsAsAttempt = false;
    attempt.countsAsValidAttempt = false;
    await writeAtomicJson(attemptPath, attempt);
    process.exitCode = 1;
    return;
  }
  const executionComplete =
    hasExactPassingGates(attempt) &&
    attempt.capture?.status === "PASS" &&
    attempt.harnessStatus === "PASS" &&
    attempt.desktopRows?.length === 12 &&
    attempt.mobileRows?.length === 5 &&
    typeof attempt.modificationDiffManifestPath === "string";
  if (!executionComplete) {
    throw new Error("capture_complete manifest lacks required execution evidence.");
  }
  const reviewOutcome = terminalReviewOutcome(
    vision.verdict,
    verifier.verdict
  );
  await validateExecutableAuthority(
    lock.executableAuthority,
    attempt.executableAuthority,
    verifier.executableAuthority
  );
  attempt.phase = "reviews_complete";
  attempt.lastCompletedState = "reviews_complete";
  attempt.visionReview = {
    path: relative(evidenceDirectory, vision.path),
    verdict: vision.verdict,
    reviewedAt: vision.reviewedAt,
    reviewerIdentity: vision.reviewerIdentity,
    agentRole: vision.agentRole,
    pivotDimensions: vision.pivotDimensions
  };
  attempt.verifierReview = {
    path: relative(evidenceDirectory, verifier.path),
    verdict: verifier.verdict,
    reviewedAt: verifier.reviewedAt,
    reviewerIdentity: verifier.reviewerIdentity,
    agentRole: verifier.agentRole,
    pivotDimensions: verifier.pivotDimensions,
    executableAuthority: verifier.executableAuthority
  };
  attempt.status = reviewOutcome.status;
  attempt.phase = attempt.status;
  attempt.lastCompletedState = "reviews_complete";
  attempt.countsAsAttempt = reviewOutcome.countsAsAttempt;
  attempt.countsAsValidAttempt = reviewOutcome.countsAsValidAttempt;
  attempt.executionFailed = reviewOutcome.executionFailed;
  attempt.finalizedAt = new Date().toISOString();
  if (reviewOutcome.status === "FAIL") {
    attempt.blockers = [
      ...(attempt.blockers ?? []).filter(
        (blocker) => !blocker.includes("reviews are pending")
      ),
      "Independent vision or verifier verdict is FAIL."
    ];
  } else {
    attempt.blockers = (attempt.blockers ?? []).filter(
      (blocker) => !blocker.includes("reviews are pending")
    );
  }
  attempt.blockers = [...new Set(attempt.blockers)];
  attempt.blocker = attempt.blockers[0] ?? null;
  if (
    !(await verifyScreenshotSnapshot(
      evidenceDirectory,
      attempt.screenshotSnapshot
    ))
  ) {
    throw new Error("Screenshot evidence changed during finalize.");
  }
  const finalLock = await readAndValidateLock(attemptNumber);
  await validateExecutableAuthority(
    finalLock.executableAuthority,
    attempt.executableAuthority,
    verifier.executableAuthority
  );
  await writeAtomicJson(attemptPath, attempt);
  process.exitCode = attempt.status === "PASS" ? 0 : 1;
}

async function executeAttempt(
  attemptNumber,
  evidenceDirectory,
  strictPreflightDirectory
) {
  if (attemptNumber !== 4) {
    throw new Error("Recovery execution is attempt 4 initial capture only.");
  }
  if (!strictPreflightDirectory) {
    throw new Error(
      "Attempt 4 initial capture requires explicit ARCHITECTURE_STRICT_PREFLIGHT_DIR."
    );
  }
  const globalLockPath = globalLockPathForAttempt(attemptNumber);
  if (await exists(globalLockPath)) {
    throw new Error(
      "Attempt 4 global lock already exists; recapture is forbidden. Use explicit locked ARCHITECTURE_EVIDENCE_DIR only for capture_complete finalize."
    );
  }
  if (await exists(evidenceDirectory)) {
    throw new Error(`Evidence directory must be absent before lock: ${evidenceDirectory}`);
  }
  await mkdir(dirname(globalLockPath), { recursive: true });
  const frozen = await freezeCurrentManifest();
  const recoveryModifications =
    await validateExactRecoveryModifications(frozen);
  const attempt4Modifications =
    await validateExactAttempt4Modifications(frozen);
  const predecessor = await validateAttempt3Predecessor();
  const outsideAllowlist = await buildOutsideAllowlistManifest(
    evidenceDirectory,
    frozen,
    { write: false }
  );
  if (outsideAllowlist.driftDetected) {
    throw new Error(
      "Protected paths outside approved change intent drifted from baseline."
    );
  }
  const preflight = await validateStrictPreflight(
    strictPreflightDirectory,
    {
      expectedFrozenManifestSha256: frozen.sha256,
      requireAttempt4LockAbsent: true
    }
  );
  if (
    canonicalJson(preflight.predecessor) !== canonicalJson(predecessor) ||
    canonicalJson(preflight.evidence.recoveryModifications) !==
      canonicalJson(recoveryModifications) ||
    canonicalJson(preflight.evidence.attempt4Modifications) !==
      canonicalJson(attempt4Modifications)
  ) {
    throw new Error("Strict preflight predecessor or recovery scope drifted.");
  }
  if (
    (await exists(globalLockPath)) ||
    (await exists(evidenceDirectory))
  ) {
    throw new Error(
      "Attempt 4 lock or evidence directory appeared before exclusive lock."
    );
  }
  const preflightForLock = await validateStrictPreflight(
    strictPreflightDirectory,
    {
      expectedFrozenManifestSha256: frozen.sha256,
      requireAttempt4LockAbsent: true
    }
  );
  if (
    preflightForLock.sha256 !== preflight.sha256 ||
    canonicalJson(preflightForLock.screenshotSnapshot) !==
      canonicalJson(preflight.screenshotSnapshot)
  ) {
    throw new Error(
      "Strict preflight manifest or screenshot snapshot drifted before exclusive lock."
    );
  }
  const currentAuthority = await validateExecutableAuthority(
    preflightForLock.evidence.executableAuthority
  );
  const lock = {
    schemaVersion: 2,
    attemptNumber,
    evidenceDirectory,
    frozenManifestSha256: frozen.sha256,
    executableAuthority: currentAuthority,
    predecessor,
    attempt4Modifications,
    strictPreflight: {
      evidenceDirectory: resolve(strictPreflightDirectory),
      manifestPath: "strict-preflight.json",
      sha256: preflightForLock.sha256,
      screenshotSnapshot: preflightForLock.screenshotSnapshot
    },
    phase: "lock_acquired",
    createdAt: new Date().toISOString()
  };
  await writeExclusiveJson(globalLockPath, lock);
  await mkdir(dirname(evidenceDirectory), { recursive: true });
  await mkdir(evidenceDirectory);
  const sourceManifestPath = join(
    evidenceDirectory,
    "attempt-source-test-hashes.json"
  );
  const attemptPath = join(evidenceDirectory, "architecture-attempt.json");
  await writeExclusiveBytes(sourceManifestPath, frozen.bytes);
  if ((await sha256(sourceManifestPath)) !== frozen.sha256) {
    throw new Error("Root frozen manifest does not match global lock.");
  }
  const attempt = {
    schemaVersion: 3,
    attempt: attemptNumber,
    generatedAt: new Date().toISOString(),
    evidenceDirectory,
    frozenManifestSha256: frozen.sha256,
    frozenManifestPath: "attempt-source-test-hashes.json",
    executableAuthority: currentAuthority,
    predecessor,
    strictPreflight: lock.strictPreflight,
    recoveryModifications,
    attempt4Modifications,
    phase: "evidence_ready",
    lastCompletedState: "evidence_ready",
    status: "INCOMPLETE",
    attemptSlotConsumed: false,
    countsAsAttempt: false,
    countsAsValidAttempt: false,
    executionFailed: true,
    harnessStatus: "PENDING",
    baseURL,
    namedGateResults: [],
    desktopRows: [],
    mobileRows: [],
    browserBoundsEvidence: null,
    screenshotSnapshot: [],
    capture: {
      status: "PENDING",
      startedAt: null,
      completedAt: null,
      exitCode: null,
      signal: null,
      logPath: "playwright.log"
    },
    devServer: {
      command: `npm run dev -- --port ${port} --host 127.0.0.1`,
      started: false,
      reused: false,
      ready: false,
      exitCode: null,
      signal: null,
      logPath: "dev-server.log"
    },
    modificationDiffManifestPath: null,
    blockers: [],
    blocker: null
  };
  const persist = async () => {
    assertCanonicalTuple(
      attempt.executableAuthority,
      "Architecture manifest"
    );
    if (
      canonicalJson(attempt.predecessor) !==
        canonicalJson(lock.predecessor) ||
      canonicalJson(attempt.attempt4Modifications) !==
        canonicalJson(lock.attempt4Modifications) ||
      canonicalJson(attempt.strictPreflight) !==
        canonicalJson(lock.strictPreflight)
    ) {
      throw new Error(
        "Architecture manifest authority chain drifted from lock."
      );
    }
    attempt.blocker = attempt.blockers[0] ?? null;
    await writeAtomicJson(attemptPath, attempt);
  };
  await persist();
  let devServer = null;
  let devLog = null;
  let modificationManifest = null;
  try {
    modificationManifest = await buildOutsideAllowlistManifest(
      evidenceDirectory,
      frozen
    );
    attempt.modificationDiffManifestPath = relative(
      evidenceDirectory,
      modificationManifest.path
    );
    if (modificationManifest.driftDetected) {
      attempt.blockers.push(
        "Protected paths outside approved change intent drifted from baseline."
      );
    }
    await persist();
    for (const gate of unitGates) {
      const missingFiles = [];
      for (const file of gate.files) {
        if (!(await exists(join(projectDirectory, file)))) missingFiles.push(file);
      }
      const logPath = `${gate.id}.log`;
      if (missingFiles.length > 0) {
        await writeFile(
          join(evidenceDirectory, logPath),
          `Missing required files: ${missingFiles.join(", ")}\n`,
          { flag: "wx" }
        );
        attempt.namedGateResults.push({
          id: gate.id,
          files: gate.files,
          pattern: gate.pattern,
          status: "FAIL",
          exitCode: 1,
          signal: null,
          logPath,
          missingFiles
        });
        attempt.blockers.push(`${gate.id}: required test file is missing.`);
        await persist();
        continue;
      }
      const args = ["vitest", "run", ...gate.files];
      if (gate.pattern) args.push("-t", gate.pattern);
      args.push(
        "--reporter=default",
        ...vitestExclusions.flatMap((pattern) => ["--exclude", pattern])
      );
      const result = await run("npx", args, {
        logPath: join(evidenceDirectory, logPath)
      });
      const status = result.exitCode === 0 ? "PASS" : "FAIL";
      attempt.namedGateResults.push({
        id: gate.id,
        files: gate.files,
        pattern: gate.pattern,
        ...result,
        status,
        logPath
      });
      if (status !== "PASS") {
        attempt.blockers.push(`${gate.id}: gate failed; see ${logPath}.`);
      }
      await persist();
    }
    await verifyFrozenManifest(frozen.sha256);
    attempt.phase = "gates_complete";
    attempt.lastCompletedState = "gates_complete";
    await persist();
    if (
      attempt.namedGateResults.length !== 7 ||
      attempt.namedGateResults.some(({ status }) => status !== "PASS")
    ) {
      throw new Error(
        "All seven pre-browser named gates must PASS before the attempt slot is consumed."
      );
    }
    await validateExecutableAuthority(
      lock.executableAuthority,
      attempt.executableAuthority
    );
    const currentPredecessor = await validateAttempt3Predecessor();
    if (
      canonicalJson(currentPredecessor) !==
      canonicalJson(lock.predecessor)
    ) {
      throw new Error("Attempt 3 predecessor drifted before slot consumption.");
    }
    const currentPreflight = await validateStrictPreflight(
      lock.strictPreflight.evidenceDirectory,
      { expectedFrozenManifestSha256: frozen.sha256 }
    );
    if (currentPreflight.sha256 !== lock.strictPreflight.sha256) {
      throw new Error("Strict preflight drifted before slot consumption.");
    }
    const currentOutside = await buildOutsideAllowlistManifest(
      evidenceDirectory,
      frozen,
      { write: false }
    );
    if (currentOutside.driftDetected) {
      throw new Error("Outside-allowlist drift appeared before slot consumption.");
    }

    const slotPath = join(evidenceDirectory, "attempt-slot-consumed.json");
    await writeExclusiveJson(slotPath, {
      schemaVersion: 1,
      attemptNumber,
      attemptSlotConsumed: true,
      createdAt: new Date().toISOString()
    });
    attempt.attemptSlotConsumed = true;
    attempt.phase = "slot_consumed";
    attempt.lastCompletedState = "slot_consumed";
    await persist();

    if (await serverIsReady(baseURL)) {
      attempt.devServer.reused = true;
      attempt.devServer.ready = true;
    } else {
      devLog = createWriteStream(join(evidenceDirectory, "dev-server.log"), {
        flags: "wx"
      });
      devServer = spawn(
        "npm",
        ["run", "dev", "--", "--port", port, "--host", "127.0.0.1"],
        {
          cwd: projectDirectory,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
      attempt.devServer.started = true;
      devServer.stdout.pipe(devLog, { end: false });
      devServer.stderr.pipe(devLog, { end: false });
      devServer.once("exit", (exitCode, signal) => {
        attempt.devServer.exitCode = exitCode;
        attempt.devServer.signal = signal;
      });
      await waitForServer(baseURL);
      attempt.devServer.ready = true;
    }
    const captureResult = await run(
      "npx",
      [
        "playwright",
        "test",
        "--config=playwright.visual.config.ts",
        "approved-reference.spec.ts",
        "--grep",
        "captures and validates"
      ],
      {
        logPath: join(evidenceDirectory, "playwright.log"),
        env: {
          ARCHITECTURE_BASE_URL: baseURL,
          ARCHITECTURE_EVIDENCE_DIR: evidenceDirectory,
          ARCHITECTURE_ATTEMPT_NUMBER: String(attemptNumber),
          ARCHITECTURE_STRICT_EVIDENCE: "1"
        }
      }
    );
    Object.assign(attempt.capture, captureResult, {
      status: captureResult.exitCode === 0 ? "PASS" : "FAIL"
    });
    if (attempt.capture.status !== "PASS") {
      attempt.blockers.push("Approved-reference Playwright capture failed.");
    }
    const approved = await validateApprovedReference(evidenceDirectory);
    attempt.blockers.push(...approved.blockers);
    attempt.desktopRows = approved.evidence?.desktop?.rows ?? [];
    attempt.mobileRows = approved.evidence?.mobile?.rows ?? [];
    attempt.browserBoundsEvidence = approved.evidence
      ? {
          verdict: approved.blockers.length === 0 ? "PASS" : "FAIL",
          desktopRows: desktopRows,
          mobileRows: mobileRows,
          approvedSource: approved.evidence.approvedSource,
          clipSeam: approved.evidence.clipSeam
        }
      : null;
    const browserStatus =
      approved.blockers.length === 0 &&
      attempt.desktopRows.length === 12 &&
      attempt.mobileRows.length === 5
        ? "PASS"
        : "FAIL";
    attempt.namedGateResults.push({
      id: "BROWSER-BOUNDS",
      files: ["tests/visual/approved-reference.spec.ts"],
      pattern:
        "desktop 12, mobile 5, shared transform, source bounds, terrain maps, clip seam",
      startedAt: attempt.capture.startedAt,
      completedAt: attempt.capture.completedAt,
      exitCode: browserStatus === "PASS" ? 0 : 1,
      signal: attempt.capture.signal,
      status: browserStatus,
      logPath: "playwright.log"
    });
    if (browserStatus !== "PASS") {
      attempt.blockers.push("BROWSER-BOUNDS: browser evidence failed validation.");
    }
    const postCaptureOutside = await buildOutsideAllowlistManifest(
      evidenceDirectory,
      frozen,
      { write: false }
    );
    if (postCaptureOutside.driftDetected) {
      attempt.blockers.push(
        "Protected paths outside approved change intent drifted from baseline."
      );
    }
    await verifyFrozenManifest(frozen.sha256);
    attempt.screenshotSnapshot = approved.evidence
      ? await screenshotSnapshot(evidenceDirectory, approved.evidence)
      : [];
    attempt.harnessStatus =
      browserStatus === "PASS" &&
      hasExactPassingGates(attempt) &&
      modificationManifest !== null &&
      !modificationManifest.driftDetected &&
      !postCaptureOutside.driftDetected
        ? "PASS"
        : "FAIL";
    if (
      attempt.capture.status === "PASS" &&
      attempt.harnessStatus === "PASS" &&
      attempt.screenshotSnapshot.length === 17
    ) {
      attempt.phase = "capture_complete";
      attempt.lastCompletedState = "capture_complete";
    } else {
      attempt.phase = "INCOMPLETE";
    }
  } catch (error) {
    attempt.phase = "INCOMPLETE";
    attempt.harnessStatus = "FAIL";
    attempt.blockers.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (devServer && devServer.exitCode === null) {
      devServer.kill("SIGTERM");
      await new Promise((resolveWait) => {
        const timeout = setTimeout(resolveWait, 5_000);
        devServer.once("exit", () => {
          clearTimeout(timeout);
          resolveWait();
        });
      });
      if (devServer.exitCode === null) devServer.kill("SIGKILL");
    }
    devLog?.end();
    attempt.executionFailed =
      attempt.phase !== "capture_complete" ||
      attempt.harnessStatus !== "PASS" ||
      !hasExactPassingGates(attempt);
    attempt.blockers.push(
      "Independent vision and verifier reviews are pending; use this exact locked evidence directory to finalize."
    );
    attempt.blockers = [...new Set(attempt.blockers)];
    attempt.completedAt = new Date().toISOString();
    await persist();
  }
  process.stdout.write(`${canonicalJson(lock)}`);
  process.exitCode = 1;
}

async function runBoundedPreflight() {
  const attemptNumber = Number(process.env.ARCHITECTURE_ATTEMPT_NUMBER);
  if (
    attemptNumber !== 4 ||
    process.env.ARCHITECTURE_STRICT_EVIDENCE !== "1"
  ) {
    throw new Error(
      "Strict preflight requires ARCHITECTURE_ATTEMPT_NUMBER=4 and ARCHITECTURE_STRICT_EVIDENCE=1."
    );
  }
  if (!requestedEvidenceDirectory) {
    throw new Error(
      "Strict preflight requires explicit ARCHITECTURE_EVIDENCE_DIR."
    );
  }
  const evidenceDirectory = resolve(requestedEvidenceDirectory);
  const currentAuthority = await validateExecutableAuthority();
  await validateAuthority();
  const predecessor = await validateAttempt3Predecessor();
  const frozen = await freezeCurrentManifest();
  const recoveryModifications =
    await validateExactRecoveryModifications(frozen);
  const attempt4Modifications =
    await validateExactAttempt4Modifications(frozen);
  const outsideAllowlist = await buildOutsideAllowlistManifest(
    evidenceDirectory,
    frozen,
    { write: false }
  );
  if (outsideAllowlist.driftDetected) {
    throw new Error(
      "Protected paths outside approved change intent drifted from baseline."
    );
  }
  if (await exists(globalLockPathForAttempt(4))) {
    throw new Error(
      "Strict preflight is forbidden after the attempt 4 lock exists."
    );
  }
  if (await exists(evidenceDirectory)) {
    throw new Error(
      `Strict preflight directory must be fresh: ${evidenceDirectory}`
    );
  }
  await mkdir(evidenceDirectory, { recursive: true });
  const playwrightOutputDirectory = join(
    tmpdir(),
    `ewan-g005-strict-preflight-${process.pid}-${randomUUID()}`
  );
  const namedGateResults = [];
  let devServer = null;
  let devLog = null;
  try {
    for (const gate of unitGates) {
      const missingFiles = [];
      for (const file of gate.files) {
        if (!(await exists(join(projectDirectory, file)))) {
          missingFiles.push(file);
        }
      }
      const logPath = `${gate.id}.log`;
      if (missingFiles.length > 0) {
        await writeFile(
          join(evidenceDirectory, logPath),
          `Missing required files: ${missingFiles.join(", ")}\n`,
          { flag: "wx" }
        );
        namedGateResults.push({
          id: gate.id,
          files: gate.files,
          pattern: gate.pattern,
          status: "FAIL",
          exitCode: 1,
          signal: null,
          logPath,
          missingFiles
        });
        continue;
      }
      const args = ["vitest", "run", ...gate.files];
      if (gate.pattern) args.push("-t", gate.pattern);
      args.push(
        "--reporter=default",
        ...vitestExclusions.flatMap((pattern) => ["--exclude", pattern])
      );
      const result = await run("npx", args, {
        logPath: join(evidenceDirectory, logPath)
      });
      namedGateResults.push({
        id: gate.id,
        files: gate.files,
        pattern: gate.pattern,
        ...result,
        status: result.exitCode === 0 ? "PASS" : "FAIL",
        logPath
      });
    }
    if (
      namedGateResults.length !== 7 ||
      namedGateResults.some(({ status }) => status !== "PASS")
    ) {
      throw new Error(
        "All seven strict preflight unit gates must PASS before browser work."
      );
    }
    await verifyFrozenManifest(frozen.sha256);
    const preBrowserPredecessor = await validateAttempt3Predecessor();
    if (
      canonicalJson(preBrowserPredecessor) !==
      canonicalJson(predecessor)
    ) {
      throw new Error("Attempt 3 predecessor drifted during unit preflight.");
    }
    await validateExecutableAuthority(currentAuthority);
    if (await exists(globalLockPathForAttempt(4))) {
      throw new Error("Attempt 4 lock appeared before preflight browser work.");
    }
    if (!(await serverIsReady(baseURL))) {
      devLog = createWriteStream(join(evidenceDirectory, "dev-server.log"), {
        flags: "wx"
      });
      devServer = spawn(
        "npm",
        ["run", "dev", "--", "--port", port, "--host", "127.0.0.1"],
        {
          cwd: projectDirectory,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
      devServer.stdout.pipe(devLog, { end: false });
      devServer.stderr.pipe(devLog, { end: false });
      await waitForServer(baseURL);
    }
    const result = await run(
      "npx",
      [
        "playwright",
        "test",
        "--config=playwright.visual.config.ts",
        "approved-reference.spec.ts",
        "--output",
        playwrightOutputDirectory,
        "--grep",
        "bounded preflight"
      ],
      {
        logPath: join(evidenceDirectory, "playwright.log"),
        env: {
          ARCHITECTURE_BASE_URL: baseURL,
          ARCHITECTURE_EVIDENCE_DIR: evidenceDirectory,
          ARCHITECTURE_ATTEMPT_NUMBER: "4",
          ARCHITECTURE_PREFLIGHT: "1",
          ARCHITECTURE_STRICT_EVIDENCE: "1"
        }
      }
    );
    const evidencePath = join(evidenceDirectory, "strict-preflight.json");
    const evidence =
      result.exitCode === 0 && (await exists(evidencePath))
        ? await readJson(evidencePath)
        : null;
    const browserScreenshotSnapshotVerified =
      evidence !== null &&
      (await verifyExactScreenshotSnapshot(
        evidenceDirectory,
        strictPreflightScreenshots,
        evidence.screenshotSnapshot
      ));
    if (
      result.exitCode !== 0 ||
      evidence?.schemaVersion !== 2 ||
      evidence?.mode !== "strict-preflight" ||
      evidence?.status !== "PASS" ||
      evidence?.attemptNumber !== 4 ||
      evidence?.countsAsAttempt !== false ||
      evidence?.createsGlobalLock !== false ||
      evidence?.createsReviews !== false ||
      canonicalJson(evidence?.screenshots) !==
        canonicalJson(strictPreflightScreenshots) ||
      !browserScreenshotSnapshotVerified ||
      !strictSeamEvidencePasses(evidence?.clipSeam) ||
      !strictPlayerProofsPass(evidence?.playerProofs) ||
      !strictRequestLedgersPass(evidence?.requestLedgers) ||
      !Array.isArray(evidence?.errors) ||
      evidence.errors.length !== 0
    ) {
      throw new Error(
        "Strict browser preflight did not produce three normalized player proofs, honest seam, three ledgers, and exact four screenshots."
      );
    }
    namedGateResults.push({
      id: "BROWSER-BOUNDS",
      files: ["tests/visual/approved-reference.spec.ts"],
      pattern:
        "three normalized player proofs, strict seam, three fresh request ledgers, exact four screenshots",
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      exitCode: 0,
      signal: result.signal,
      status: "PASS",
      logPath: "playwright.log"
    });
    const finalFrozen = await verifyFrozenManifest(frozen.sha256);
    await validateExactRecoveryModifications(finalFrozen);
    await validateExactAttempt4Modifications(finalFrozen);
    const finalPredecessor = await validateAttempt3Predecessor();
    const finalOutside = await buildOutsideAllowlistManifest(
      evidenceDirectory,
      frozen,
      { write: false }
    );
    const finalAuthority = await validateExecutableAuthority(
      currentAuthority
    );
    if (
      canonicalJson(finalPredecessor) !== canonicalJson(predecessor) ||
      finalOutside.driftDetected ||
      (await exists(globalLockPathForAttempt(4)))
    ) {
      throw new Error(
        "Strict preflight authority, predecessor, scope, or no-lock invariant drifted."
      );
    }
    const completedEvidence = {
      ...evidence,
      schemaVersion: 3,
      status: "PASS",
      candidateFrozenManifestSha256: frozen.sha256,
      executableAuthority: finalAuthority,
      predecessor: finalPredecessor,
      recoveryModifications,
      attempt4Modifications,
      outsideAllowlist:
        finalOutside.manifest.outsideAllowlistDrift,
      namedGateResults
    };
    await writeAtomicJson(evidencePath, completedEvidence);
    const validatedPreflight = await validateStrictPreflight(
      evidenceDirectory,
      {
        expectedFrozenManifestSha256: frozen.sha256,
        requireAttempt4LockAbsent: true
      }
    );
    process.stdout.write(
      `${canonicalJson({
        mode: "STRICT_PREFLIGHT",
        status: "PASS",
        countsAsAttempt: false,
        createsGlobalLock: false,
        createsReviews: false,
        evidenceDirectory,
        candidateFrozenManifestSha256: frozen.sha256,
        executableAuthority: finalAuthority,
        predecessor: finalPredecessor,
        screenshots: completedEvidence.screenshots,
        manifestSha256: validatedPreflight.sha256
      })}`
    );
  } finally {
    if (devServer && devServer.exitCode === null) {
      devServer.kill("SIGTERM");
      await new Promise((resolveWait) => {
        const timeout = setTimeout(resolveWait, 5_000);
        devServer.once("exit", () => {
          clearTimeout(timeout);
          resolveWait();
        });
      });
      if (devServer.exitCode === null) devServer.kill("SIGKILL");
    }
    devLog?.end();
    await rm(playwrightOutputDirectory, {
      recursive: true,
      force: true
    });
  }
}

async function runFailStopSelftest() {
  const root = join(
    projectDirectory,
    "test-results/visual-fidelity/fail-stop-protocol-tests",
    `${utcStamp()}-${process.pid}-${randomUUID()}`
  );
  await mkdir(root, { recursive: true });
  const results = [];
  const record = (id, passed, evidence) => {
    results.push({ id, status: passed ? "PASS" : "FAIL", evidence });
  };

  const concurrentRoot = join(root, "concurrent");
  await mkdir(concurrentRoot);
  const concurrentLock = join(concurrentRoot, "lock.json");
  const contenders = await Promise.allSettled([
    writeExclusiveJson(concurrentLock, { owner: "a" }),
    writeExclusiveJson(concurrentLock, { owner: "b" })
  ]);
  record(
    "concurrent-initial-lock",
    contenders.filter(({ status }) => status === "fulfilled").length === 1,
    contenders.map(({ status }) => status)
  );

  const crashRoot = join(root, "lock-crash");
  await mkdir(crashRoot);
  const crashLock = join(crashRoot, "lock.json");
  await writeExclusiveJson(crashLock, {
    evidenceDirectory: join(crashRoot, "evidence")
  });
  let secondLockSucceeded = true;
  try {
    await writeExclusiveJson(crashLock, { owner: "second" });
  } catch {
    secondLockSucceeded = false;
  }
  record(
    "lock-crash-no-recapture",
    !secondLockSucceeded && !(await exists(join(crashRoot, "evidence"))),
    { secondLockSucceeded, evidenceDirectoryCreated: false }
  );

  const slotRoot = join(root, "post-slot-crash");
  await mkdir(slotRoot);
  const slotPath = join(slotRoot, "attempt-slot-consumed.json");
  await writeExclusiveJson(slotPath, {
    attemptNumber: 2,
    attemptSlotConsumed: true
  });
  const slot = await readJson(slotPath);
  record(
    "post-slot-crash-persists",
    slot.attemptSlotConsumed === true,
    slot
  );

  const finalizeRoot = join(root, "post-capture-finalize");
  await mkdir(finalizeRoot);
  const screenshotPath = join(finalizeRoot, "screen.png");
  await writeFile(screenshotPath, Buffer.from("immutable screenshot"), {
    flag: "wx"
  });
  const screenshotBefore = {
    sha256: await sha256(screenshotPath),
    mtimeMs: (await stat(screenshotPath)).mtimeMs
  };
  const finalizeManifestPath = join(finalizeRoot, "architecture-attempt.json");
  await writeExclusiveJson(finalizeManifestPath, {
    phase: "capture_complete",
    captureRuns: 1,
    gateRuns: 1
  });
  const finalizeManifest = await readJson(finalizeManifestPath);
  finalizeManifest.phase = "PASS";
  await writeAtomicJson(finalizeManifestPath, finalizeManifest);
  const screenshotAfter = {
    sha256: await sha256(screenshotPath),
    mtimeMs: (await stat(screenshotPath)).mtimeMs
  };
  record(
    "post-capture-finalize-preserves-screenshots",
    JSON.stringify(screenshotBefore) === JSON.stringify(screenshotAfter) &&
      finalizeManifest.captureRuns === 1 &&
      finalizeManifest.gateRuns === 1,
    { screenshotBefore, screenshotAfter, finalizeManifest }
  );

  const preflightSnapshotRoot = join(root, "preflight-screenshot-snapshot");
  await mkdir(join(preflightSnapshotRoot, "desktop"), { recursive: true });
  await mkdir(join(preflightSnapshotRoot, "mobile"), { recursive: true });
  for (const [index, screenshot] of strictPreflightScreenshots.entries()) {
    await writeFile(
      join(preflightSnapshotRoot, screenshot),
      Buffer.from(`preflight screenshot ${index}`),
      { flag: "wx" }
    );
  }
  const preflightScreenshotSnapshot = await snapshotPaths(
    preflightSnapshotRoot,
    strictPreflightScreenshots
  );
  const preflightSnapshotInitiallyValid =
    await verifyExactScreenshotSnapshot(
      preflightSnapshotRoot,
      strictPreflightScreenshots,
      preflightScreenshotSnapshot
    );
  const snapshotMetadataMutations = [
    {
      id: "preflight-screenshot-sha-drift-rejected",
      mutate(snapshot) {
        snapshot[0].sha256 = "0".repeat(64);
      }
    },
    {
      id: "preflight-screenshot-size-drift-rejected",
      mutate(snapshot) {
        snapshot[0].size += 1;
      }
    },
    {
      id: "preflight-screenshot-mtime-drift-rejected",
      mutate(snapshot) {
        snapshot[0].mtimeMs += 1;
      }
    }
  ];
  for (const mutation of snapshotMetadataMutations) {
    const candidate = structuredClone(preflightScreenshotSnapshot);
    mutation.mutate(candidate);
    record(
      mutation.id,
      !(await verifyExactScreenshotSnapshot(
        preflightSnapshotRoot,
        strictPreflightScreenshots,
        candidate
      )),
      { mutatedSnapshotRejected: true }
    );
  }
  await writeFile(
    join(preflightSnapshotRoot, strictPreflightScreenshots[1]),
    Buffer.from("drifted preflight screenshot")
  );
  const preflightSnapshotAfterDriftValid =
    await verifyExactScreenshotSnapshot(
      preflightSnapshotRoot,
      strictPreflightScreenshots,
      preflightScreenshotSnapshot
    );
  record(
    "preflight-screenshot-sha-size-mtime-drift-rejected",
    preflightSnapshotInitiallyValid && !preflightSnapshotAfterDriftValid,
    {
      exactPaths: preflightScreenshotSnapshot.map(({ path }) => path),
      preflightSnapshotInitiallyValid,
      preflightSnapshotAfterDriftValid
    }
  );

  const mismatchRoot = join(root, "mismatch");
  await mkdir(mismatchRoot);
  const frozenPath = join(mismatchRoot, "attempt-source-test-hashes.json");
  await writeFile(frozenPath, canonicalJson({ exactPathCount: 39 }), {
    flag: "wx"
  });
  const lockedDigest = sha256Buffer(Buffer.from("different"));
  const actualDigest = await sha256(frozenPath);
  record("lock-hash-directory-mismatch", lockedDigest !== actualDigest, {
    lockedDigest,
    actualDigest,
    outcome: "INCOMPLETE",
    exitCode: 1
  });

  const dispatchLockPath = join(
    root,
    "dispatch-g005-architecture-attempt-4-lock.json"
  );
  const dispatchEvidenceDirectory = join(root, "dispatch-attempt-4-evidence");
  let initialEvidenceDirectoryRejected = false;
  let initialDispatchError = null;
  try {
    assertInitialAttemptDispatch({
      attemptNumber: 4,
      evidenceDirectory: dispatchEvidenceDirectory,
      strictPreflightDirectory: join(root, "passing-preflight")
    });
  } catch (error) {
    initialEvidenceDirectoryRejected = true;
    initialDispatchError =
      error instanceof Error ? error.message : String(error);
  }
  record(
    "initial-evidence-directory-dispatch-rejected-without-side-effects",
    initialEvidenceDirectoryRejected &&
      initialDispatchError?.includes("ARCHITECTURE_EVIDENCE_DIR") === true &&
      !(await exists(dispatchLockPath)) &&
      !(await exists(dispatchEvidenceDirectory)),
    {
      initialEvidenceDirectoryRejected,
      initialDispatchError,
      lockExists: await exists(dispatchLockPath),
      evidenceDirectoryExists: await exists(dispatchEvidenceDirectory)
    }
  );

  const attemptLocksRoot = join(root, "attempt-specific-locks");
  await mkdir(attemptLocksRoot);
  const attempt2Lock = join(
    attemptLocksRoot,
    "g005-architecture-attempt-2-lock.json"
  );
  const attempt3Lock = join(
    attemptLocksRoot,
    "g005-architecture-attempt-3-lock.json"
  );
  const attempt4Lock = join(
    attemptLocksRoot,
    "g005-architecture-attempt-4-lock.json"
  );
  await writeExclusiveJson(attempt2Lock, {
    attemptNumber: 2,
    immutable: true
  });
  await writeExclusiveJson(attempt3Lock, {
    attemptNumber: 3,
    immutable: true
  });
  await writeExclusiveJson(attempt4Lock, {
    attemptNumber: 4,
    immutable: true
  });
  record(
    "attempt-specific-locks-are-distinct",
    new Set([attempt2Lock, attempt3Lock, attempt4Lock]).size === 3 &&
      (await readJson(attempt2Lock)).attemptNumber === 2 &&
      (await readJson(attempt3Lock)).attemptNumber === 3 &&
      (await readJson(attempt4Lock)).attemptNumber === 4,
    { attempt2Lock, attempt3Lock, attempt4Lock }
  );
  const attempt4LockBefore = await sha256(attempt4Lock);
  let attempt4RecaptureLockSucceeded = true;
  try {
    await writeExclusiveJson(attempt4Lock, {
      attemptNumber: 4,
      recapture: true
    });
  } catch {
    attempt4RecaptureLockSucceeded = false;
  }
  const attempt4LockAfter = await sha256(attempt4Lock);
  record(
    "attempt-4-lock-forbids-recapture",
    !attempt4RecaptureLockSucceeded &&
      attempt4LockBefore === attempt4LockAfter,
    {
      attempt4RecaptureLockSucceeded,
      attempt4LockBefore,
      attempt4LockAfter
    }
  );

  const attempt3Predecessor = await validateAttempt3Predecessor();
  record(
    "attempt-3-inventory-canonical",
    attempt3Predecessor.inventory.regularFileCount === 27 &&
      attempt3Predecessor.inventory.lockIncluded === false &&
      attempt3Predecessor.inventory.sha256 === attempt3InventorySha256,
    attempt3Predecessor.inventory
  );
  const inventoryFixture = buildCanonicalInventory([
    {
      relativePath: "z-last.json",
      sha256: "b".repeat(64),
      size: 22,
      mtimeMs: 2000.5
    },
    {
      relativePath: "nested/a-first.png",
      sha256: "a".repeat(64),
      size: 11,
      mtimeMs: 1000.25
    }
  ]);
  const inventoryLines = inventoryFixture.bytes
    .toString("utf8")
    .trimEnd()
    .split("\n");
  const inventoryMutations = [
    {
      id: "attempt-3-inventory-count-drift-rejected",
      bytes: Buffer.from(`${inventoryLines[0]}\n`, "utf8")
    },
    {
      id: "attempt-3-inventory-order-drift-rejected",
      bytes: Buffer.from(`${[...inventoryLines].reverse().join("\n")}\n`, "utf8")
    },
    {
      id: "attempt-3-inventory-delimiter-drift-rejected",
      bytes: Buffer.from(
        inventoryFixture.bytes.toString("utf8").replace("  ", " "),
        "utf8"
      )
    },
    {
      id: "attempt-3-inventory-mtime-drift-rejected",
      bytes: Buffer.from(
        inventoryFixture.bytes
          .toString("utf8")
          .replace(String(1000.25), String(1000.5)),
        "utf8"
      )
    },
    {
      id: "attempt-3-inventory-path-drift-rejected",
      bytes: Buffer.from(
        inventoryFixture.bytes
          .toString("utf8")
          .replace("nested/a-first.png", "nested\\a-first.png"),
        "utf8"
      )
    },
    {
      id: "attempt-3-inventory-final-lf-drift-rejected",
      bytes: inventoryFixture.bytes.subarray(
        0,
        inventoryFixture.bytes.length - 1
      )
    },
    {
      id: "attempt-3-inventory-hash-drift-rejected",
      bytes: Buffer.from(
        inventoryFixture.bytes
          .toString("utf8")
          .replace("a".repeat(64), `c${"a".repeat(63)}`),
        "utf8"
      )
    }
  ];
  for (const mutation of inventoryMutations) {
    record(
      mutation.id,
      !canonicalInventoryEncodingMatches(
        mutation.bytes,
        inventoryFixture
      ),
      {
        candidateSha256: sha256Buffer(mutation.bytes),
        expectedSha256: inventoryFixture.sha256
      }
    );
  }
  let invalidPosixPathRejected = false;
  try {
    buildCanonicalInventory([
      {
        relativePath: "nested\\invalid.json",
        sha256: "d".repeat(64),
        size: 1,
        mtimeMs: 1
      }
    ]);
  } catch {
    invalidPosixPathRejected = true;
  }
  record(
    "attempt-3-inventory-non-posix-entry-rejected",
    invalidPosixPathRejected,
    { invalidRelativePath: "nested\\invalid.json" }
  );

  const playerProof = (profile, zone) => ({
    passed: true,
    visibleState: { profile, zone },
    foregroundUnchanged: true,
    failedPredicates: [],
    occlusion: {
      coordinateSpace: "normalized-image-frame",
      passed: true,
      failedPredicates: [],
      equivalence: {
        passed: true,
        equivalenceTolerance: 0,
        polygonCount: 1,
        pointCount: 3
      },
      classificationParity: {
        passed: true,
        mismatchCount: 0,
        comparedAlphaPixels: 100
      },
      normalizedPolygonCount: 1,
      sourcePolygonCount: 1,
      normalizedPointBounds: {
        minimumX: 0,
        minimumY: 0,
        maximumX: 1,
        maximumY: 1
      },
      sourcePointBounds: {
        minimumX: 0,
        minimumY: 0,
        maximumX: 1817,
        maximumY: 866
      },
      measuredNormalizedPlayerBounds: {
        minimumX: 0,
        minimumY: 0,
        maximumX: 1,
        maximumY: 1
      },
      playerAlphaPixels: 100,
      intersectionAlphaPixels: 25,
      intersectionRatio: 0.25,
      ratioConsistencyTolerance: Number.EPSILON,
      playerRemainingRatio: 0.75,
      alphaBottomToFootCssPixels: 1
    }
  });
  const passingPlayerProofs = {
    desktopAirport: playerProof("desktop", "airport"),
    desktopHanabi: playerProof("desktop", "hanabi"),
    mobileHanabi: playerProof("mobile", "hanabi")
  };
  const syntheticOutsideProofs = structuredClone(passingPlayerProofs);
  syntheticOutsideProofs.desktopAirport.occlusion.outsideMaskChangedPixelCount =
    0;
  record(
    "synthetic-player-outside-mask-rejected",
    strictPlayerProofsPass(passingPlayerProofs) &&
      !strictPlayerProofsPass(syntheticOutsideProofs),
    { passingAccepted: true, syntheticOutsideAccepted: false }
  );
  const missingPlayerProofs = structuredClone(passingPlayerProofs);
  delete missingPlayerProofs.mobileHanabi;
  record(
    "missing-player-proof-rejected",
    !strictPlayerProofsPass(missingPlayerProofs),
    { missing: "mobileHanabi" }
  );
  const equivalenceDriftProofs = structuredClone(passingPlayerProofs);
  equivalenceDriftProofs.desktopAirport.occlusion.equivalence.passed = false;
  record(
    "player-equivalence-drift-rejected",
    !strictPlayerProofsPass(equivalenceDriftProofs),
    equivalenceDriftProofs.desktopAirport.occlusion.equivalence
  );
  const parityDriftProofs = structuredClone(passingPlayerProofs);
  parityDriftProofs.mobileHanabi.occlusion.classificationParity.passed = false;
  parityDriftProofs.mobileHanabi.occlusion.classificationParity.mismatchCount =
    1;
  record(
    "player-parity-drift-rejected",
    !strictPlayerProofsPass(parityDriftProofs),
    parityDriftProofs.mobileHanabi.occlusion.classificationParity
  );
  const playerMetricMutations = [
    {
      id: "player-count-ratio-inconsistency-rejected",
      mutate(proofs) {
        proofs.desktopAirport.occlusion.intersectionAlphaPixels = 26;
      }
    },
    {
      id: "player-intersection-overflow-rejected",
      mutate(proofs) {
        proofs.desktopHanabi.occlusion.intersectionAlphaPixels = 101;
        proofs.desktopHanabi.occlusion.intersectionRatio = 1.01;
        proofs.desktopHanabi.occlusion.playerRemainingRatio = -0.01;
      }
    },
    {
      id: "player-ratio-drift-rejected",
      mutate(proofs) {
        proofs.mobileHanabi.occlusion.intersectionRatio = 0.25 + 1e-8;
      }
    },
    {
      id: "player-remaining-ratio-drift-rejected",
      mutate(proofs) {
        proofs.mobileHanabi.occlusion.playerRemainingRatio = 0.75 + 1e-8;
      }
    },
    {
      id: "player-normalized-bounds-drift-rejected",
      mutate(proofs) {
        proofs.desktopAirport.occlusion.normalizedPointBounds.maximumX =
          1 + Number.EPSILON;
      }
    },
    {
      id: "player-source-bounds-drift-rejected",
      mutate(proofs) {
        proofs.desktopHanabi.occlusion.sourcePointBounds.maximumY = 867;
      }
    },
    {
      id: "player-measured-bounds-drift-rejected",
      mutate(proofs) {
        proofs.mobileHanabi.occlusion.measuredNormalizedPlayerBounds.minimumX =
          -Number.EPSILON;
      }
    }
  ];
  for (const mutation of playerMetricMutations) {
    const proofs = structuredClone(passingPlayerProofs);
    mutation.mutate(proofs);
    record(mutation.id, !strictPlayerProofsPass(proofs), {
      mutatedProofsRejected: true
    });
  }
  const failedReviewOutcome = terminalReviewOutcome("PASS", "FAIL");
  record(
    "review-fail-invalid-attempt",
    failedReviewOutcome.status === "FAIL" &&
      failedReviewOutcome.countsAsAttempt === false &&
      failedReviewOutcome.countsAsValidAttempt === false &&
      failedReviewOutcome.executionFailed === true,
    failedReviewOutcome
  );

  const result = {
    schemaVersion: 2,
    mode: "FAIL_STOP_PROTOCOL_SELFTEST",
    isolatedRoot: root,
    canonicalLockTouched: false,
    attemptSlotConsumed: false,
    tests: results,
    status: results.every(({ status }) => status === "PASS") ? "PASS" : "FAIL"
  };
  await writeExclusiveJson(join(root, "fail-stop-protocol-tests.json"), result);
  process.stdout.write(`${canonicalJson(result)}`);
  if (result.status !== "PASS") process.exitCode = 1;
}

async function staticCheck() {
  const currentExecutableAuthority =
    await validateExecutableAuthority();
  const validated = await validateAuthority();
  const predecessor = await validateAttempt3Predecessor();
  const frozen = await freezeCurrentManifest();
  const recoveryModifications =
    await validateExactRecoveryModifications(frozen);
  const attempt4Modifications =
    await validateExactAttempt4Modifications(frozen);
  const legacy = (await exists(legacyAttemptPath))
    ? await validateLegacyAttempt()
    : {
        mode: "LEGACY_READ_ONLY_CHECK",
        path: relative(projectDirectory, legacyAttemptPath),
        result: "NOT_AVAILABLE",
        evidenceWrites: 0
      };
  const rendererSources = {
    flatWorldCanvas: await readFile(
      join(projectDirectory, "app/world/FlatWorldCanvas.tsx"),
      "utf8"
    ),
    playerSprite: await readFile(
      join(projectDirectory, "app/world/RpgPlayerCharacterSprite.tsx"),
      "utf8"
    ),
    worldView: await readFile(
      join(projectDirectory, "app/world/WorldView.tsx"),
      "utf8"
    )
  };
  const forbiddenLiveRendererPatterns = [
    "@react-three/fiber",
    "useFrame",
    "useThree",
    "OrthographicCamera",
    "TextureLoader",
    "SpriteMaterial",
    "WebGL2RenderingContext",
    "supportsWebGL2",
    "webglcontextlost"
  ];
  const rendererArchitecture = {
    technology: "canvas2d",
    hasRawCanvas2D:
      rendererSources.flatWorldCanvas.includes('getContext("2d")') &&
      rendererSources.flatWorldCanvas.includes("requestAnimationFrame") &&
      rendererSources.playerSprite.includes("context.drawImage"),
    forbiddenMatches: forbiddenLiveRendererPatterns.flatMap((pattern) =>
      Object.entries(rendererSources).flatMap(([file, source]) =>
        source.includes(pattern) ? [{ file, pattern }] : []
      )
    )
  };
  rendererArchitecture.passed =
    rendererArchitecture.hasRawCanvas2D &&
    rendererArchitecture.forbiddenMatches.length === 0;
  const result = {
    mode: "STATIC_CHECK_ONLY",
    status: "INCOMPLETE",
    countsAsAttempt: false,
    countsAsValidAttempt: false,
    attemptSlotConsumed: false,
    writesEvidence: false,
    dispatchBeforeAttemptNumberValidation: true,
    exactAuthorizedPathCount: 39,
    exactAuthorizedPaths: validated.requestPaths,
    authority,
    executableAuthority: currentExecutableAuthority,
    predecessor,
    recoveryModifications,
    attempt4Modifications,
    candidateFrozenManifestSha256: frozen.sha256,
    legacy,
    requiredGateIds,
    unitGates,
    rendererArchitecture,
    browserGateId: "BROWSER-BOUNDS",
    desktopRows,
    mobileRows,
    strictPreflightRows: [
      "desktop/zone-airport",
      "desktop/zone-hanabi",
      "mobile/world-female",
      "mobile/full-map"
    ],
    failStopCases: [
      "concurrent-initial-lock",
      "lock-crash-no-recapture",
      "post-slot-crash-persists",
      "post-capture-finalize-preserves-screenshots",
      "preflight-screenshot-sha-drift-rejected",
      "preflight-screenshot-size-drift-rejected",
      "preflight-screenshot-mtime-drift-rejected",
      "preflight-screenshot-sha-size-mtime-drift-rejected",
      "lock-hash-directory-mismatch",
      "initial-evidence-directory-dispatch-rejected-without-side-effects",
      "attempt-specific-locks-are-distinct",
      "attempt-4-lock-forbids-recapture",
      "attempt-3-inventory-canonical",
      ...[
        "count",
        "order",
        "delimiter",
        "mtime",
        "path",
        "final-lf",
        "hash"
      ].map((kind) => `attempt-3-inventory-${kind}-drift-rejected`),
      "attempt-3-inventory-non-posix-entry-rejected",
      "synthetic-player-outside-mask-rejected",
      "missing-player-proof-rejected",
      "player-equivalence-drift-rejected",
      "player-parity-drift-rejected",
      "player-count-ratio-inconsistency-rejected",
      "player-intersection-overflow-rejected",
      "player-ratio-drift-rejected",
      "player-remaining-ratio-drift-rejected",
      "player-normalized-bounds-drift-rejected",
      "player-source-bounds-drift-rejected",
      "player-measured-bounds-drift-rejected",
      "review-fail-invalid-attempt"
    ],
    attemptSpecificLocks: {
      attempt2: {
        path: relative(
          projectDirectory,
          globalLockPathForAttempt(2)
        ),
        exists: await exists(globalLockPathForAttempt(2)),
        immutable: true,
        finalizable: false
      },
      attempt3: {
        path: relative(
          projectDirectory,
          globalLockPathForAttempt(3)
        ),
        exists: await exists(globalLockPathForAttempt(3)),
        immutable: true,
        finalizable: false
      },
      attempt4: {
        path: relative(
          projectDirectory,
          globalLockPathForAttempt(4)
        ),
        exists: await exists(globalLockPathForAttempt(4)),
        initialExecutionOnly: true
      }
    },
    strictPreflightContract: {
      attemptNumber: 4,
      requiresStrictEvidence: true,
      requiresExplicitFreshEvidenceDirectory: true,
      createsGlobalLock: false,
      screenshots: strictPreflightScreenshots,
      pinsScreenshotSha256SizeMtime: true
    },
    initialSuccessContract: {
      phase: "capture_complete",
      status: "INCOMPLETE",
      exitCode: 1
    },
    finalizeContract: {
      rerunsDevGatesCapture: false,
      preservesScreenshotSha256AndMtime: true
    }
  };
  process.stdout.write(`${canonicalJson(result)}`);
  process.exitCode = 1;
}

if (mode === "static") {
  await staticCheck();
} else if (mode === "selftest") {
  await runFailStopSelftest();
} else if (mode === "legacy") {
  process.stdout.write(`${canonicalJson(await validateLegacyAttempt())}`);
} else if (mode === "freeze") {
  const frozen = await freezeCurrentManifest();
  process.stdout.write(
    `${canonicalJson({
      mode: "FREEZE_ONLY",
      status: "PASS",
      writesEvidence: false,
      exactPathCount: 39,
      frozenManifestSha256: frozen.sha256,
      manifest: frozen.manifest
    })}`
  );
} else if (mode === "preflight") {
  await runBoundedPreflight();
} else {
  const attemptNumber = Number(process.env.ARCHITECTURE_ATTEMPT_NUMBER);
  assertAttempt4Number(attemptNumber);
  const globalLockPath = globalLockPathForAttempt(attemptNumber);
  if (await exists(globalLockPath)) {
    const lock = await readAndValidateLock(attemptNumber);
    if (
      !requestedEvidenceDirectory ||
      resolve(requestedEvidenceDirectory) !== resolve(lock.evidenceDirectory)
    ) {
      throw new Error(
        "Existing global lock is read-only authority; explicit matching ARCHITECTURE_EVIDENCE_DIR is required and recapture is forbidden."
      );
    }
    await finalizeAttempt(attemptNumber, resolve(requestedEvidenceDirectory));
  } else {
    const dispatch = assertInitialAttemptDispatch({
      attemptNumber,
      evidenceDirectory: requestedEvidenceDirectory,
      strictPreflightDirectory: requestedStrictPreflightDirectory
    });
    const evidenceDirectory = join(
      projectDirectory,
      "test-results",
      "visual-fidelity",
      `${utcStamp()}-attempt-${attemptNumber}`
    );
    await executeAttempt(
      attemptNumber,
      evidenceDirectory,
      dispatch.strictPreflightDirectory
    );
  }
}
