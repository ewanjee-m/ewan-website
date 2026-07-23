#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, readdir, rename,
  rm, utimes, writeFile
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const THIS_FILE = fileURLToPath(import.meta.url);
export const DEFAULT_G007_PORT = 4191;
const REPOSITORY_ROOT = await realpath(path.resolve(path.dirname(THIS_FILE), "../.."));
const EVIDENCE_ROOT = path.join(REPOSITORY_ROOT, "test-results", "visual-fidelity");
const ATTEMPT4_ROOT = path.join(
  EVIDENCE_ROOT, "20260723T091950Z-attempt-4"
);
const G005_LOCKS = [2, 3, 4].map((attempt) =>
  path.join(REPOSITORY_ROOT, ".omx", "state", `g005-architecture-attempt-${attempt}-lock.json`)
);
const BASELINE_PATH = path.join(
  REPOSITORY_ROOT, ".omx", "backups", "20260722T015104Z", "dirty-files-before.json"
);
const RECOVERY_ROOT = path.join(
  REPOSITORY_ROOT, ".omx", "recovery", "g005-attempt4"
);
const RECOVERY_INCIDENT = "g007-playwright-evidence-deletion-20260723";
const RECOVERY_STATUS = "RECOVERED_SUBSET_WITH_KNOWN_LOSS";
const RECOVERY_SCOPE = "G007_PIXEL_REFERENCE_ONLY";
const RECOVERY_PLAN_SHA =
  "7c854c80281a61b96de53ae95b53e750bb0db09fb9a6a29278be884b7d7ead4a";
const RECOVERY_BUNDLE_PINS = {
  "pre-review-inventory.excerpt.txt":
    "96265863543edf09dbc349a9c1dff1a97e101ffcb95cf4b915b95db6f6d97a33",
  "capture-terminal.excerpts.json":
    "ec9ff009d5ddd2632c0db17d8f46bc47bed4b69f05f288cce4722b6b27895681",
  "screenshot-tuples.json":
    "d26fdc88edfef7b9325c9729c4910b983e6e6880f85c2bac0437b51bdb972ae5",
  "source-provenance.json":
    "6c524e3528abcd3c5b9ed12941051000daa042e701167d61da53eed442f409b6",
  "recovery-attestation.json":
    "60020fd9f6ad32e41757901c3937a62e3b18dc0e5958933f0885b15f204fee3f",
  "independent-verification.json":
    "85b9887184718fd6b5cea3021eb9dceab052b28528d2e535f22c693cc58849ac"
};
const RECOVERED_ATTEMPT4_FILES = [
  ["attempt-slot-consumed.json", "e60c46c262853e34aa033367fba194b0f2e7d3c0b7fe3110bcd2a797ee889e74", 121],
  ["attempt-source-test-hashes.json", "0ff3d356719a5ddb2a9532c1ff89c8d32cd17f6842d08818ab95076a4d8f2a12", 9077],
  ["desktop/full-map.png", "3e92d59f1e4a39629989be4434c0b62451e074a2234e564f655d3bb702f17e67", 586395, 1784798424884.1907],
  ["desktop/mini-map.png", "dd0207c917bc713617e663b4e98a620bce4617eb1788e638a7d11fcb34b74594", 2131654, 1784798424704.7607],
  ["desktop/selection-female.png", "d4dd32a2c5fa4dd9a3a0ba7456bbfdae7fd292266d6bf83fdfef3e53636b878a", 1291044, 1784798418087.4678],
  ["desktop/selection-male.png", "5870058b087bd3248b272dc68a749f8bd4a30b05681522704c964de4548bb0ca", 1282776, 1784798417860.091],
  ["desktop/start.png", "f2275333b0b7e2a65b4abed9aea9881e9424dbf2418566db148d22c97792ab35", 1439023, 1784798417596.0532],
  ["desktop/world-female.png", "8d701dd27a32a12952439ca372d4aece91f411db6948e1c3f0785d651525c56c", 2009955, 1784798421023.0176],
  ["desktop/world-male.png", "4911736cf35a9a18b2cfefa1d799d62755ce9c2107ce5a78da567c09e700b0b9", 2009662, 1784798419543.5476],
  ["desktop/zone-airport.png", "8d701dd27a32a12952439ca372d4aece91f411db6948e1c3f0785d651525c56c", 2009955, 1784798421389.435],
  ["desktop/zone-gyukatsu.png", "3ae9bee9914da19cb758b7241d73c6be2dce448bf6cd37110a98dc308a6d47e7", 2117553, 1784798423228.4292],
  ["desktop/zone-hanabi.png", "dd0207c917bc713617e663b4e98a620bce4617eb1788e638a7d11fcb34b74594", 2131654, 1784798424486.3567],
  ["desktop/zone-sakura.png", "a7b372fea7580d287511252995c7cf30cdd50b88d522b6f944d5669c57151d46", 2131583, 1784798423767.3472],
  ["desktop/zone-tokyo.png", "1492bcf37c9001c7f62596c5f7653c3f9756b738fb63b81e3ce6f7dad37efc99", 2036103, 1784798422666.838],
  ["mobile/expanded-mini-map.png", "8d9dafc0d55634e8910ee3462f38e7860af8121f1d92339cb2c5b52c3b0797d2", 473864, 1784798427045.3003],
  ["mobile/full-map.png", "8c4663e2a5137eee414e23567e70f5f45ae59497ee923b95e037074d46b9b804", 191547, 1784798427130.5547],
  ["mobile/selection-female.png", "a7b0e8e527459aaf76d0cd92fb0e71e7a03d11776c872f46168bcc0b6e48691f", 168472, 1784798425132.3198],
  ["mobile/start.png", "dd02e318745d392cee1a7ddb62c2ccb9ee85a2b0d783f7659dba4b2c75b86a53", 338436, 1784798425036.7214],
  ["mobile/world-female.png", "6ceb5a33e9a7d4ffbf6557062921d07283cb675f204308781547e85916e3b645", 463801, 1784798426939.1528],
  ["modification-diff-manifest.json", "6d464e04f6c45b9d89861e95d46ec001bb42c468bb107063f1c1bfc8e771d7c8", 753],
  ["verifier-review.json", "42396d42d9b9db6cbcff1772951ec7b1d91f1a091427ad306d0d2784d0e2e5ff", 1920],
  ["vision-review.json", "39a149c977ee5c75f0d89d797d94f8f28d84e0e99bf3f5d5a8bd76abceb3db66", 1355]
].map(([filePath, fileSha256, size, mtimeMs]) => ({
  path: filePath,
  sha256: fileSha256,
  size,
  permissions: 0o644,
  ...(mtimeMs === undefined ? {} : { mtimeMs })
}));
const KNOWN_ATTEMPT4_LOSSES = [
  "architecture-attempt.json", "approved-reference.json", "CAM-01.log",
  "CAM-02.log", "COMP-01.log", "WORLD-01.log", "WORLD-03.log",
  "WORLD-06.log", "WORLD-07.log", "dev-server.log",
  "playwright-results/.last-run.json", "playwright.log"
];
const RECOVERY_PROVENANCE_PATH =
  "/Users/musinsa/.codex/sessions/2026/07/22/rollout-2026-07-22T08-46-33-019f8712-f2a7-7533-a8a4-5d9684703058.jsonl";
const RECOVERY_PROVENANCE_RECORDS = [
  [17107, "2026-07-23T09:20:38.892Z", "call_Kv0ugFW4WaNbbWD81SRFXg3G", "21dc9bf86f82d727705709969b3259863c1522b022c6362d740ab81410f3aeba", "e409b157d15a1bd944bdf61e79a297d8ddfd63519ef61593f467d79b12aceaa2"],
  [17128, "2026-07-23T09:21:20.203Z", "call_bG5Prsw8KGBVsuXide9JFNXG", "29b5fa2661b14cab80f12bb0f00427a27599196bd19128da937391f17d5850b5", "8867fac0392a9967a72cb38dee8381c82956656d87abc1c7faae2d1cc8f3e1d9"],
  [17286, "2026-07-23T09:31:16.357Z", "call_irsq4ZjZ1FaXvcURxafBWrAG", "25b33ff369422a2804ea6df8d10a32f38d46e4025e5ab66a1fb1f734d5d02062", "bd93dad3ce243a7b5a358248de73fa4b03027d6fb313fe024defe13682f7eba9"],
  [17299, "2026-07-23T09:31:38.912Z", "call_v17jZMnht1ybWDLZXNfIkMpE", "a9b46c199a1869e5b6be2c6cd85b5ed2451bc99730ea9bfabbeff54eab53fd30", "231718871b558ab3b147b055dcf531d228c3e68376ac07f98f9828096292b5e6"]
].map(([line, timestamp, callId, recordLineSha256, decodedOutputSha256]) => ({
  line, timestamp, callId, payloadType: "custom_tool_call_output",
  recordLineSha256, decodedOutputSha256
}));
const REAL_RECOVERY_PATHS = {
  repositoryRoot: REPOSITORY_ROOT,
  attemptRoot: ATTEMPT4_ROOT,
  recoveryRoot: RECOVERY_ROOT,
  lockPaths: G005_LOCKS,
  provenancePath: RECOVERY_PROVENANCE_PATH
};
const REAL_RECOVERY_CONTRACT = {
  incidentId: RECOVERY_INCIDENT,
  status: RECOVERY_STATUS,
  scope: RECOVERY_SCOPE,
  allowedClaims: [RECOVERY_SCOPE],
  reviewedPlanSha: RECOVERY_PLAN_SHA,
  attempt: {
    allowedDirectories: ["desktop", "mobile"],
    files: RECOVERED_ATTEMPT4_FILES
  },
  locks: [
    {
      role: "predecessor",
      path: ".omx/state/g005-architecture-attempt-2-lock.json",
      sha256: "1ed8824a43b8a671d59731a5f30b7ca143cf56b071f28d8e2a53066b73b75892",
      size: 329,
      permissions: 0o644
    },
    {
      role: "predecessor",
      path: ".omx/state/g005-architecture-attempt-3-lock.json",
      sha256: "48552202e729109bb799225efd5264b24ae32f36efaba8dae4c6f9b873a2ce85",
      size: 3090,
      permissions: 0o644
    },
    {
      role: "comparisonAuthority",
      path: ".omx/state/g005-architecture-attempt-4-lock.json",
      sha256: "77e01549d5f3ba83c37f1f41c890ae1754d81fa99da80beeb5b00829d928177c",
      size: 7676,
      permissions: 0o644
    }
  ],
  knownLosses: KNOWN_ATTEMPT4_LOSSES.map((lossPath) => ({
    path: lossPath,
    requiredPresence: "absent",
    replacementProhibited: true
  })),
  bundlePins: RECOVERY_BUNDLE_PINS,
  provenance: {
    canonicalPath: RECOVERY_PROVENANCE_PATH,
    sessionId: "019f8712-f2a7-7533-a8a4-5d9684703058",
    records: RECOVERY_PROVENANCE_RECORDS
  }
};
const DESKTOP_ROWS = [
  "start", "selection-male", "selection-female", "world-male", "world-female",
  "zone-airport", "zone-tokyo", "zone-gyukatsu", "zone-sakura", "zone-hanabi",
  "mini-map", "full-map"
];
const MOBILE_ROWS = [
  "start", "selection-female", "world-female", "expanded-mini-map", "full-map"
];
const OWNERSHIP = {
  "desktop-male": ["start", "selection-male", "world-male"],
  "desktop-female": [
    "selection-female", "world-female", "zone-airport", "zone-tokyo",
    "zone-gyukatsu", "zone-sakura", "zone-hanabi", "mini-map", "full-map"
  ],
  "mobile-female": [...MOBILE_ROWS]
};
const ARRIVALS = {
  airport: [-30, 0, 0],
  tokyo: [-8, 0, 20],
  gyukatsu: [8, 0, 0],
  sakura: [9, 0, -20],
  hanabi: [26, 0, -18]
};
const REFERENCES = {
  airport: [430, 600],
  tokyo: [760, 455],
  gyukatsu: [1035, 610],
  sakura: [1260, 595],
  hanabi: [1570, 640]
};
const ROUTES = [
  "airport-to-tokyo", "airport-to-gyukatsu", "tokyo-to-gyukatsu",
  "gyukatsu-to-sakura", "sakura-to-hanabi"
];
const WORLD_ASSET = "/assets/world/world-environment-concept.png";
const GPU_REASON =
  "active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context";
const BASE_ENV_KEYS = [
  "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SHELL", "USER", "LOGNAME",
  "LANG", "LC_ALL", "TERM", "CI", "NO_COLOR", "FORCE_COLOR"
];
const IMPLICIT_PATHS = [
  ".env.development.local", ".env.local", ".env.development", ".env", ".npmrc"
];
const REQUIRED_FILES = [
  "package.json", "package-lock.json", "next.config.ts", "vite.config.ts",
  "tsconfig.json", "vitest.config.ts", "playwright.g007.config.ts",
  "tests/visual/g007-verification.spec.ts",
  "tests/visual/g007-verification.mjs",
  "tests/visual/g007-verification.test.ts"
];
const FAILURE_CODES = new Set([
  "E_IMPLICIT_INPUT_INVALID", "E_INPUT_DRIFT", "E_NPM_CONFIG_AUDIT",
  "E_REQUEST_IDENTITY", "E_VISUAL_REVIEW_MISSING", "E_VISUAL_REVIEW_INVALID",
  "E_VISUAL_REJECT", "E_ROOT_INVALID", "E_CANDIDATE_INVALID",
  "E_RESERVATION_EXISTS", "E_PORT_COLLISION", "E_DEV_EXIT",
  "E_READINESS_TIMEOUT", "E_PLAYWRIGHT", "E_CAPTURE_CONTRACT",
  "E_PROTECTED_DRIFT", "E_FINALIZE_DRIFT", "E_INTERNAL"
]);

const TOOLCHAIN_BYTES = {
  user: "script-shell=${G007_SCRIPT_SHELL}\nfund=false\naudit=false\nupdate-notifier=false\n",
  global: "fund=false\naudit=false\nupdate-notifier=false\n",
  wrapper: `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const keys = Object.keys(process.env).sort();
const forbidden = keys.filter((key) => /^(ARCHITECTURE_|VISUAL_|G005_)|ATTEMPT|LOCK|PREFLIGHT|FINALIZE/i.test(key));
fs.writeFileSync(path.join(path.dirname(process.argv[1]), "g007-npm-env-keys.json"), JSON.stringify({keys, forbidden}, null, 2) + "\\n", {flag: "wx"});
if (forbidden.length) process.exit(91);
const result = spawnSync("/bin/sh", process.argv.slice(2), {stdio: "inherit", env: process.env});
process.exit(result.status ?? 92);
`
};

class G007Error extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "G007Error";
    this.code = FAILURE_CODES.has(code) ? code : "E_INTERNAL";
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function recoveryDrift(message, cause = undefined) {
  throw new G007Error("E_PROTECTED_DRIFT", message, cause);
}

function exactRecoveryArray(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) recoveryDrift(`${label} mismatch`);
}

async function collectRecoveryTree(root, includePngMtime = false) {
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    recoveryDrift(`${root} is not a canonical directory`);
  }
  const rows = [];
  const directories = [];
  const invalidNodes = [];
  const walk = async (directory, relativeDirectory = "") => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        invalidNodes.push({ path: relative, type: "symlink" });
      } else if (info.isDirectory()) {
        directories.push(relative);
        await walk(absolute, relative);
      } else if (info.isFile()) {
        const bytes = await readFile(absolute);
        rows.push({
          path: relative,
          sha256: sha256(bytes),
          size: info.size,
          permissions: info.mode & 0o777,
          mode: info.mode,
          ...(includePngMtime && relative.endsWith(".png")
            ? { mtimeMs: info.mtimeMs }
            : {})
        });
      } else {
        invalidNodes.push({ path: relative, type: "nonregular" });
      }
    }
  };
  await walk(root);
  rows.sort((left, right) => left.path.localeCompare(right.path));
  directories.sort();
  invalidNodes.sort((left, right) => left.path.localeCompare(right.path));
  return { rows, directories, invalidNodes };
}

export async function collectRecoveryState(paths = REAL_RECOVERY_PATHS) {
  try {
    const attempt4 = await collectRecoveryTree(paths.attemptRoot, true);
    const lockRows = [];
    for (const lockPath of paths.lockPaths) {
      const info = await lstat(lockPath);
      if (info.isSymbolicLink() || !info.isFile()) {
        recoveryDrift(`${lockPath} is not a regular lock`);
      }
      const bytes = await readFile(lockPath);
      lockRows.push({
        path: path.relative(paths.repositoryRoot, lockPath).split(path.sep).join("/"),
        sha256: sha256(bytes),
        size: info.size,
        permissions: info.mode & 0o777,
        mode: info.mode
      });
    }
    lockRows.sort((left, right) => left.path.localeCompare(right.path));
    const screenshots = attempt4.rows.filter((row) =>
      /^(desktop|mobile)\/[^/]+\.png$/.test(row.path)
    );
    const aggregate = sha256(stableJson({
      rows: attempt4.rows,
      lockRows
    }));
    attempt4.locks = lockRows;
    attempt4.screenshots = screenshots;
    attempt4.aggregate = aggregate;

    const bundle = await collectRecoveryTree(paths.recoveryRoot, false);
    const documents = {};
    const texts = {};
    const documentErrors = [];
    for (const row of bundle.rows) {
      if (!row.path.endsWith(".json")) {
        texts[row.path] = await readFile(
          path.join(paths.recoveryRoot, row.path), "utf8"
        );
        continue;
      }
      try {
        documents[row.path] = JSON.parse(
          await readFile(path.join(paths.recoveryRoot, row.path), "utf8")
        );
      } catch (error) {
        documentErrors.push({
          path: row.path,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const provenanceBytes = await readFile(paths.provenancePath, "utf8");
    const provenanceLines = provenanceBytes.split("\n");
    if (provenanceLines.at(-1) === "") provenanceLines.pop();
    const records = provenanceLines.map((raw, index) => {
      try {
        const record = JSON.parse(raw);
        const decodedOutput = Array.isArray(record?.payload?.output)
          ? record.payload.output
            .filter((item) => item?.type === "input_text")
            .map((item) => item.text)
            .join("")
          : "";
        return {
          line: index + 1,
          raw,
          record,
          recordLineSha256: sha256(raw),
          decodedOutputSha256: sha256(decodedOutput)
        };
      } catch (error) {
        return {
          line: index + 1,
          raw,
          parseError: error instanceof Error ? error.message : String(error)
        };
      }
    });
    return {
      paths: { ...paths },
      attempt4,
      protectedSnapshot: {
        rows: attempt4.rows,
        locks: lockRows,
        screenshots,
        aggregate
      },
      bundle: { ...bundle, documents, texts, documentErrors },
      provenance: { path: paths.provenancePath, records }
    };
  } catch (error) {
    if (error instanceof G007Error) throw error;
    recoveryDrift("recovery state collection failed", error);
  }
}

export function validateRecoveryState(state, contract = REAL_RECOVERY_CONTRACT) {
  try {
    if (!state || !contract || !Array.isArray(contract?.attempt?.files)) {
      recoveryDrift("recovery state or contract is invalid");
    }
    if (
      !Array.isArray(contract.locks) ||
      !Array.isArray(contract.knownLosses) ||
      !contract.bundlePins ||
      !Array.isArray(contract?.provenance?.records)
    ) recoveryDrift("recovery contract schema is invalid");

    if (state.attempt4.invalidNodes.length) recoveryDrift("Attempt4 contains invalid nodes");
    exactRecoveryArray(
      state.attempt4.directories,
      [...contract.attempt.allowedDirectories].sort(),
      "Attempt4 directories"
    );
    const expectedAttempt = [...contract.attempt.files]
      .sort((left, right) => left.path.localeCompare(right.path));
    exactRecoveryArray(
      state.attempt4.rows.map((row) => row.path),
      expectedAttempt.map((row) => row.path),
      "Attempt4 path set"
    );
    for (const expected of expectedAttempt) {
      const actual = state.attempt4.rows.find((row) => row.path === expected.path);
      if (
        !actual ||
        actual.sha256 !== expected.sha256 ||
        actual.size !== expected.size ||
        actual.permissions !== expected.permissions
      ) recoveryDrift(`Attempt4 row drift: ${expected.path}`);
      if (
        expected.path.endsWith(".png") &&
        actual.mtimeMs !== expected.mtimeMs
      ) recoveryDrift(`Attempt4 PNG mtime drift: ${expected.path}`);
    }
    if (state.attempt4.screenshots.length !== 17) {
      recoveryDrift("Attempt4 screenshot count drift");
    }

    const expectedLocks = [...contract.locks]
      .sort((left, right) => left.path.localeCompare(right.path));
    exactRecoveryArray(
      state.attempt4.locks.map((row) => row.path),
      expectedLocks.map((row) => row.path),
      "lock path set"
    );
    for (const expected of expectedLocks) {
      const actual = state.attempt4.locks.find((row) => row.path === expected.path);
      if (
        !actual ||
        actual.sha256 !== expected.sha256 ||
        actual.size !== expected.size ||
        actual.permissions !== expected.permissions
      ) recoveryDrift(`lock drift: ${expected.path}`);
    }

    const attemptNodes = new Set([
      ...state.attempt4.rows.map((row) => row.path),
      ...state.attempt4.directories
    ]);
    for (const loss of contract.knownLosses) {
      if (
        loss.requiredPresence !== "absent" ||
        loss.replacementProhibited !== true ||
        attemptNodes.has(loss.path)
      ) recoveryDrift(`known-loss contract drift: ${loss.path}`);
    }

    if (
      state.bundle.invalidNodes.length ||
      state.bundle.directories.length ||
      state.bundle.documentErrors.length
    ) recoveryDrift("recovery bundle contains invalid nodes");
    const bundleNames = Object.keys(contract.bundlePins).sort();
    exactRecoveryArray(
      state.bundle.rows.map((row) => row.path),
      bundleNames,
      "recovery bundle path set"
    );
    for (const name of bundleNames) {
      const row = state.bundle.rows.find((candidate) => candidate.path === name);
      if (
        !row ||
        row.sha256 !== contract.bundlePins[name] ||
        row.permissions !== 0o644
      ) recoveryDrift(`recovery bundle pin drift: ${name}`);
    }

    const source = state.bundle.documents["source-provenance.json"];
    const attestation = state.bundle.documents["recovery-attestation.json"];
    const independent = state.bundle.documents["independent-verification.json"];
    const capture = state.bundle.documents["capture-terminal.excerpts.json"];
    const screenshotDocument = state.bundle.documents["screenshot-tuples.json"];
    if (
      !source || !attestation || !independent || !capture || !screenshotDocument
    ) recoveryDrift("recovery bundle document missing");
    for (const document of [source, attestation, independent]) {
      if (document.incidentId !== contract.incidentId) {
        recoveryDrift("recovery incident identity drift");
      }
    }
    if (
      source.status !== contract.status ||
      source.scope !== contract.scope ||
      attestation.status !== contract.status ||
      attestation.scope !== contract.scope
    ) recoveryDrift("recovery status or scope drift");

    const inventoryText =
      state.bundle.texts["pre-review-inventory.excerpt.txt"];
    if (
      typeof inventoryText !== "string" ||
      !inventoryText.endsWith("\n") ||
      inventoryText.split("\n").length - 1 !== 32
    ) recoveryDrift("inventory excerpt schema drift");
    const sourceRecords = source.sourceSession?.records ??
      source.canonicalAuthority?.records;
    if (!Array.isArray(sourceRecords)) recoveryDrift("source record schema drift");
    exactRecoveryArray(sourceRecords, contract.provenance.records, "source records");
    const sourceSession = source.sourceSession ?? source.canonicalAuthority;
    if (
      sourceSession?.canonicalPath !== undefined &&
      sourceSession.canonicalPath !== contract.provenance.canonicalPath
    ) recoveryDrift("source canonical path drift");
    if (
      sourceSession?.path !== undefined &&
      sourceSession.path !== contract.provenance.canonicalPath
    ) recoveryDrift("source canonical path drift");
    if (sourceSession?.sessionId !== contract.provenance.sessionId) {
      recoveryDrift("source session identity drift");
    }

    const leafMap = source.leafSha256 && !Array.isArray(source.leafSha256)
      ? source.leafSha256
      : Object.fromEntries((source.leaves ?? []).map((leaf) => [
        path.posix.basename(leaf.path), leaf.sha256
      ]));
    const expectedLeafNames = [
      "pre-review-inventory.excerpt.txt",
      "capture-terminal.excerpts.json",
      "screenshot-tuples.json"
    ];
    exactRecoveryArray(Object.keys(leafMap).sort(), expectedLeafNames.sort(), "leaf names");
    for (const name of expectedLeafNames) {
      const row = state.bundle.rows.find((candidate) => candidate.path === name);
      if (leafMap[name] !== row?.sha256) recoveryDrift(`stale leaf hash: ${name}`);
    }

    const sourceRow = state.bundle.rows.find(
      (row) => row.path === "source-provenance.json"
    );
    const attestationParent = attestation.sourceProvenanceSha256 ??
      attestation.hashDag?.parent?.sha256;
    if (attestationParent !== sourceRow?.sha256) {
      recoveryDrift("stale source-to-attestation hash");
    }
    const result = attestation.result ?? attestation;
    const counts = attestation.counts ?? attestation;
    if (
      result.fullOriginalTreeRecovered !== false ||
      result.g005TerminalVerdictReconstructed !== false ||
      result.screenshotComparisonEligible !== true
    ) recoveryDrift("attestation result claims drift");
    for (const optionalFalseClaim of [
      "refinalized", "deletedOriginalReplacement"
    ]) {
      if (
        optionalFalseClaim in result &&
        result[optionalFalseClaim] !== false
      ) recoveryDrift(`attestation ${optionalFalseClaim} claim drift`);
    }
    if (
      counts.originalObservedMinimumRegularFileCount !== 34 ||
      counts.recoveredRegularFileCount !== 22 ||
      counts.knownLossPathCount !== 12 ||
      counts.knownMinimumUnrecoveredCount !== 12
    ) recoveryDrift("attestation count drift");
    exactRecoveryArray(attestation.allowedClaims, contract.allowedClaims, "allowed claims");
    if (attestation.attempt4Contract?.allowedDirectories !== undefined) {
      exactRecoveryArray(
        attestation.attempt4Contract.allowedDirectories,
        contract.attempt.allowedDirectories,
        "attested Attempt4 directories"
      );
    }
    const recoveredPaths = attestation.recoveredPaths ??
      attestation.recoveredFiles?.map((row) => row.path);
    exactRecoveryArray(
      [...recoveredPaths].sort(),
      expectedAttempt.map((row) => row.path),
      "attested recovered paths"
    );
    exactRecoveryArray(
      attestation.knownLosses.map((loss) => ({
        path: loss.path,
        requiredPresence: loss.requiredPresence,
        replacementProhibited: loss.replacementProhibited
      })),
      contract.knownLosses,
      "attested known losses"
    );

    const producer = source.producer;
    const verifier = independent.verifier ?? independent.producer;
    const requiredPlan = contract.reviewedPlanSha ?? RECOVERY_PLAN_SHA;
    const sourcePlan = producer?.reviewedPlanSha256 ??
      producer?.reviewedPlanSha;
    if (sourcePlan !== undefined && sourcePlan !== requiredPlan) {
      recoveryDrift("producer reviewed plan drift");
    }
    if (
      !producer?.agentIdentity || !producer?.sessionIdentity ||
      !verifier?.agentIdentity || !verifier?.sessionIdentity ||
      verifier.agentIdentity === producer.agentIdentity ||
      verifier.sessionIdentity === producer.sessionIdentity ||
      independent.procedurallyIndependent !== true
    ) recoveryDrift("independent verifier identity drift");
    if (
      independent.sourceProducer?.agentIdentity !== producer.agentIdentity ||
      independent.sourceProducer?.sessionIdentity !== producer.sessionIdentity
    ) recoveryDrift("independent verifier producer binding drift");
    const reviewedPlan = independent.reviewedPlanSha ??
      independent.reviewedPlanSha256;
    if (reviewedPlan !== requiredPlan) recoveryDrift("reviewed plan drift");
    const reviewedFiles = independent.reviewedFiles;
    for (const name of bundleNames.filter(
      (candidate) => candidate !== "independent-verification.json"
    )) {
      const row = state.bundle.rows.find((candidate) => candidate.path === name);
      if (reviewedFiles?.[name] !== row?.sha256) {
        recoveryDrift(`independent verifier prior-file drift: ${name}`);
      }
    }
    const attestationRow = state.bundle.rows.find(
      (row) => row.path === "recovery-attestation.json"
    );
    const reviewedAttestation = independent.reviewedAttestationSha256 ??
      independent.reviewedAttestationSha;
    if (
      reviewedAttestation !== attestationRow?.sha256 ||
      independent.verdict !== "PASS" ||
      !Array.isArray(independent.failures) ||
      independent.failures.length
    ) recoveryDrift("independent verification verdict drift");

    if (
      capture.classification !== "HISTORICAL_OBSERVATION_ONLY" &&
      !capture.observations?.every(
        (observation) => observation.authority === "historicalObservationOnly"
      )
    ) recoveryDrift("capture excerpts authority drift");
    if (
      screenshotDocument.scope !== contract.scope ||
      screenshotDocument.count !== 17 ||
      !Array.isArray(screenshotDocument.screenshots)
    ) recoveryDrift("screenshot tuple schema drift");
    const expectedScreenshots = expectedAttempt.filter((row) => row.path.endsWith(".png"));
    for (const expected of expectedScreenshots) {
      const actual = screenshotDocument.screenshots.find(
        (row) => row.path === expected.path
      );
      if (
        !actual ||
        actual.sha256 !== expected.sha256 ||
        actual.size !== expected.size ||
        actual.mtimeMs !== expected.mtimeMs
      ) recoveryDrift(`screenshot tuple drift: ${expected.path}`);
    }

    if (
      path.resolve(state.provenance.path) !==
      path.resolve(contract.provenance.canonicalPath)
    ) recoveryDrift("provenance path drift");
    for (const expected of contract.provenance.records) {
      const matches = state.provenance.records.filter(({ record }) =>
        record?.timestamp === expected.timestamp &&
        record?.payload?.type === expected.payloadType &&
        record?.payload?.call_id === expected.callId
      );
      if (
        matches.length !== 1 ||
        matches[0].line !== expected.line ||
        matches[0].recordLineSha256 !== expected.recordLineSha256 ||
        matches[0].decodedOutputSha256 !== expected.decodedOutputSha256
      ) recoveryDrift(`provenance record drift: ${expected.callId}`);
    }
    return state;
  } catch (error) {
    if (error instanceof G007Error) throw error;
    recoveryDrift("recovery validation failed", error);
  }
}

export async function validateRecoveryContract(
  paths = REAL_RECOVERY_PATHS,
  contract = REAL_RECOVERY_CONTRACT
) {
  const state = await collectRecoveryState(paths);
  return validateRecoveryState(state, contract);
}

export async function validatePostPlaywrightRecovery(
  playwrightResult,
  recoveryBefore,
  validateRecovery = () => validateRecoveryContract()
) {
  const recoveryAfter = await validateRecovery();
  const beforeSnapshot = recoveryBefore?.protectedSnapshot ?? recoveryBefore;
  const afterSnapshot = recoveryAfter?.protectedSnapshot ?? recoveryAfter;
  if (stableJson(afterSnapshot) !== stableJson(beforeSnapshot)) {
    throw new G007Error(
      "E_PROTECTED_DRIFT",
      "recovery contract drift after Playwright"
    );
  }
  if (playwrightResult?.code !== 0) {
    throw new G007Error(
      "E_PLAYWRIGHT",
      `Playwright exited ${playwrightResult?.code}`
    );
  }
  return recoveryAfter;
}

async function hashFile(absolutePath, relativePath = path.relative(REPOSITORY_ROOT, absolutePath)) {
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new G007Error("E_IMPLICIT_INPUT_INVALID", `${relativePath} is not a regular file`);
  }
  const handle = await open(absolutePath, fsConstants.O_RDONLY);
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return {
    path: relativePath.split(path.sep).join("/"),
    sha256: hash.digest("hex"),
    size: info.size,
    mtimeMs: info.mtimeMs,
    mode: info.mode
  };
}

async function atomicJson(absolutePath, value, flag = undefined) {
  const temporary = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  if (flag === "wx") {
    try {
      await lstat(absolutePath);
      await rm(temporary);
      throw new G007Error("E_RESERVATION_EXISTS", `${absolutePath} already exists`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await rename(temporary, absolutePath);
}

async function walkRegular(root, relativeRoot, rows) {
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    const relative = path.posix.join(relativeRoot, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) {
      throw new G007Error("E_IMPLICIT_INPUT_INVALID", `symlink input: ${relative}`);
    }
    if (info.isDirectory()) await walkRegular(absolute, relative, rows);
    else if (info.isFile()) rows.push(await hashFile(absolute, relative));
  }
}

async function implicitRows(repositoryRoot = REPOSITORY_ROOT) {
  const rows = [];
  for (const relative of IMPLICIT_PATHS) {
    const absolute = path.join(repositoryRoot, relative);
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new G007Error("E_IMPLICIT_INPUT_INVALID", `${relative} has invalid type`);
      }
      const row = await hashFile(absolute, relative);
      rows.push({ ...row, presence: "present", type: "regular" });
    } catch (error) {
      if (error?.code === "ENOENT") rows.push({ path: relative, presence: "absent" });
      else throw error;
    }
  }
  return rows;
}

async function resolvePlaywrightMetadata() {
  const packageJsonPath = require.resolve("@playwright/test/package.json");
  const packageRoot = await realpath(path.dirname(packageJsonPath));
  const expectedRoot = await realpath(path.join(REPOSITORY_ROOT, "node_modules", "@playwright", "test"));
  if (packageRoot !== expectedRoot) {
    throw new G007Error("E_INPUT_DRIFT", "Playwright package is outside repository-local installation");
  }
  const cliPath = path.join(packageRoot, "cli.js");
  const cliInfo = await lstat(cliPath);
  if (cliInfo.isSymbolicLink() || !cliInfo.isFile()) {
    throw new G007Error("E_INPUT_DRIFT", "Playwright CLI is not a regular file");
  }
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const lock = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "package-lock.json"), "utf8"));
  const lockedVersion = lock.packages?.["node_modules/@playwright/test"]?.version;
  if (lockedVersion !== packageJson.version) {
    throw new G007Error("E_INPUT_DRIFT", "Playwright package-lock version mismatch");
  }
  const { chromium } = await import("playwright");
  const browserPath = await realpath(chromium.executablePath());
  const browserInfo = await hashFile(browserPath, browserPath);
  const browsersPath = path.join(
    path.dirname(require.resolve("playwright-core/package.json")),
    "browsers.json"
  );
  const browsers = JSON.parse(await readFile(browsersPath, "utf8"));
  const chromiumEntry = browsers.browsers.find((entry) => entry.name === "chromium");
  return {
    packageVersion: packageJson.version,
    chromiumRevision: chromiumEntry?.revision ?? null,
    chromiumVersion: chromiumEntry?.browserVersion ?? null,
    cli: await hashFile(cliPath, path.relative(REPOSITORY_ROOT, cliPath)),
    browser: browserInfo,
    canonicalCliPath: cliPath
  };
}

async function createToolchainInputs(evidenceDirectory) {
  const wrapperPath = path.join(evidenceDirectory, "g007-npm-script-shell");
  const userPath = path.join(evidenceDirectory, "g007-user.npmrc");
  const globalPath = path.join(evidenceDirectory, "g007-global.npmrc");
  await writeFile(wrapperPath, TOOLCHAIN_BYTES.wrapper, { flag: "wx", mode: 0o700 });
  await chmod(wrapperPath, 0o700);
  await writeFile(
    userPath,
    TOOLCHAIN_BYTES.user.replace("${G007_SCRIPT_SHELL}", wrapperPath),
    { flag: "wx", mode: 0o600 }
  );
  await writeFile(globalPath, TOOLCHAIN_BYTES.global, { flag: "wx", mode: 0o600 });
  return { wrapperPath, userPath, globalPath };
}

async function currentInputManifest(evidenceDirectory, toolchain, priorMetadata = undefined) {
  const rows = [];
  for (const directory of ["app", "worker", "public"]) {
    await walkRegular(path.join(REPOSITORY_ROOT, directory), directory, rows);
  }
  for (const relative of REQUIRED_FILES) {
    rows.push(await hashFile(path.join(REPOSITORY_ROOT, relative), relative));
  }
  for (const [name, absolute] of Object.entries({
    "g007-user.npmrc": toolchain.userPath,
    "g007-global.npmrc": toolchain.globalPath,
    "g007-npm-script-shell": toolchain.wrapperPath
  })) {
    rows.push(await hashFile(absolute, `toolchain/${name}`));
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  const implicit = await implicitRows();
  const playwright = await resolvePlaywrightMetadata();
  const metadata = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    npmVersion: process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1] ?? "unknown",
    playwright: {
      packageVersion: playwright.packageVersion,
      chromiumRevision: playwright.chromiumRevision,
      chromiumVersion: playwright.chromiumVersion,
      cli: playwright.cli,
      browser: playwright.browser
    },
    directBaseEnvironmentKeys: Object.keys(buildChildEnvironment("/dev/null", "http://127.0.0.1")).sort(),
    directDevEnvironmentKeys: Object.keys(buildChildEnvironment(
      "/dev/null", "http://127.0.0.1", {
        NPM_CONFIG_USERCONFIG: toolchain.userPath,
        NPM_CONFIG_GLOBALCONFIG: toolchain.globalPath
      }
    )).sort()
  };
  const aggregate = sha256(stableJson({ rows, implicit, metadata }));
  const result = { schemaVersion: 1, rows, implicitInputs: implicit, metadata, aggregate };
  if (priorMetadata && stableJson(result) !== stableJson(priorMetadata)) {
    throw new G007Error("E_INPUT_DRIFT", "current input manifest drifted");
  }
  return { result, canonicalLocalPlaywrightCli: playwright.canonicalCliPath };
}

async function protectedSnapshot(root = ATTEMPT4_ROOT, locks = G005_LOCKS) {
  const canonicalRoot = await realpath(root);
  const rootInfo = await lstat(canonicalRoot);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new G007Error("E_PROTECTED_DRIFT", "protected root is invalid");
  }
  const rows = [];
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new G007Error("E_PROTECTED_DRIFT", "protected symlink");
      const canonical = await realpath(absolute);
      if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) {
        throw new G007Error("E_PROTECTED_DRIFT", "protected path escaped root");
      }
      if (info.isDirectory()) await walk(absolute);
      else if (info.isFile()) rows.push(await hashFile(
        absolute, path.relative(canonicalRoot, absolute)
      ));
    }
  };
  await walk(canonicalRoot);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  const lockRows = [];
  for (const lock of locks) {
    const canonical = await realpath(lock);
    if (canonical !== lock) throw new G007Error("E_PROTECTED_DRIFT", "lock path is not canonical");
    lockRows.push(await hashFile(lock, path.relative(REPOSITORY_ROOT, lock)));
  }
  const screenshots = rows.filter((row) =>
    /^(desktop|mobile)\/[^/]+\.png$/.test(row.path)
  );
  return { rows, locks: lockRows, screenshots, aggregate: sha256(stableJson({ rows, lockRows })) };
}

async function validateRealProtectedSnapshot(snapshot) {
  const expectedRows = REAL_RECOVERY_CONTRACT.attempt.files;
  if (
    stableJson(snapshot.rows.map((row) => row.path)) !==
    stableJson(expectedRows.map((row) => row.path))
  ) throw new G007Error("E_PROTECTED_DRIFT", "Attempt4 recovered path set mismatch");
  for (const expected of expectedRows) {
    const row = snapshot.rows.find((candidate) => candidate.path === expected.path);
    if (
      !row ||
      row.sha256 !== expected.sha256 ||
      row.size !== expected.size ||
      (row.mode & 0o777) !== expected.permissions ||
      (expected.mtimeMs !== undefined && row.mtimeMs !== expected.mtimeMs)
    ) {
      throw new G007Error("E_PROTECTED_DRIFT", `${expected.path} authority mismatch`);
    }
  }
  for (const expected of REAL_RECOVERY_CONTRACT.locks) {
    const row = snapshot.locks.find((candidate) => candidate.path === expected.path);
    if (
      !row ||
      row.sha256 !== expected.sha256 ||
      row.size !== expected.size ||
      (row.mode & 0o777) !== expected.permissions
    ) throw new G007Error("E_PROTECTED_DRIFT", `${expected.path} lock mismatch`);
  }
  if (snapshot.screenshots.length !== 17) {
    throw new G007Error("E_PROTECTED_DRIFT", "Attempt4 screenshot count is not 17");
  }
}

async function baselineSnapshot() {
  const row = await hashFile(BASELINE_PATH, path.relative(REPOSITORY_ROOT, BASELINE_PATH));
  const data = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const entries = Array.isArray(data) ? data : data.files ?? data.entries ?? [];
  const untracked = entries.filter((entry) =>
    typeof entry === "string" ? entry.startsWith("?? ") : entry.status === "??"
  );
  if (entries.length !== 524 || untracked.length !== 523) {
    throw new G007Error("E_PROTECTED_DRIFT", "G001 baseline count mismatch");
  }
  return { row, entryCount: entries.length, untrackedCount: untracked.length };
}

function buildChildEnvironment(evidenceDirectory, baseURL, additions = {}) {
  const environment = {};
  for (const key of BASE_ENV_KEYS) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return {
    ...environment,
    NODE_ENV: "development",
    G007_EVIDENCE_DIR: evidenceDirectory,
    G007_BASE_URL: baseURL,
    ...additions
  };
}

function forbiddenKeys(keys) {
  return keys.filter((key) =>
    /^(ARCHITECTURE_|VISUAL_|G005_)|ATTEMPT|LOCK|PREFLIGHT|FINALIZE/i.test(key)
  );
}

async function reserveEvidence(root = EVIDENCE_ROOT, basename = undefined) {
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    throw new G007Error("E_ROOT_INVALID", "evidence root does not exist", error);
  }
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new G007Error("E_ROOT_INVALID", "evidence root is not a real directory");
  }
  const canonicalRoot = await realpath(root);
  const name = basename ?? `g007-${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}`;
  if (!/^g007-/.test(name) || name.includes("/") || name.includes("\\")) {
    throw new G007Error("E_CANDIDATE_INVALID", "invalid evidence basename");
  }
  const candidate = path.resolve(canonicalRoot, name);
  if (path.dirname(candidate) !== canonicalRoot) {
    throw new G007Error("E_CANDIDATE_INVALID", "evidence path is not an immediate child");
  }
  try {
    await lstat(candidate);
    throw new G007Error("E_RESERVATION_EXISTS", "evidence directory already exists");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(candidate, { recursive: false });
  const candidateInfo = await lstat(candidate);
  const canonicalCandidate = await realpath(candidate);
  if (
    candidateInfo.isSymbolicLink() ||
    !candidateInfo.isDirectory() ||
    path.dirname(canonicalCandidate) !== canonicalRoot
  ) {
    throw new G007Error("E_CANDIDATE_INVALID", "reserved path failed canonical checks");
  }
  return candidate;
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

function devExitCode(child) {
  return child?.exitCode === null || child?.exitCode === undefined
    ? null
    : child.exitCode;
}

function readinessDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (listening, error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ listening, error });
    };
    socket.once("connect", () => finish(true));
    socket.once("error", (error) => finish(false, error));
    socket.setTimeout(timeoutMs, () =>
      finish(false, new Error(`TCP connect timeout after ${timeoutMs}ms`))
    );
  });
}

export async function waitForReady(url, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let probes = 0;
  let target;
  let lastNetworkError = null;
  let lastHttpStatus = null;
  try {
    target = new URL(url);
  } catch (error) {
    throw new G007Error(
      "E_READINESS_TIMEOUT",
      `readiness timeout for ${url}; last network error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const port = target.port
    ? Number(target.port)
    : target.protocol === "https:" ? 443 : 80;

  let listening = false;
  while (Date.now() < deadline) {
    const exitCode = devExitCode(child);
    if (exitCode !== null) {
      throw new G007Error("E_DEV_EXIT", `dev server exited ${exitCode}`);
    }
    probes += 1;
    const remaining = deadline - Date.now();
    const tcp = await probeTcp(
      target.hostname,
      port,
      Math.max(1, Math.min(500, remaining))
    );
    if (tcp.listening) {
      listening = true;
      break;
    }
    if (tcp.error) {
      lastNetworkError = tcp.error instanceof Error
        ? tcp.error.message
        : String(tcp.error);
    }
    if (Date.now() < deadline) {
      await readinessDelay(Math.min(100, deadline - Date.now()));
    }
  }

  while (listening && Date.now() < deadline) {
    const exitCode = devExitCode(child);
    if (exitCode !== null) {
      throw new G007Error("E_DEV_EXIT", `dev server exited ${exitCode}`);
    }
    probes += 1;
    const remaining = deadline - Date.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(1, remaining))
      });
      if (response.ok) {
        await response.body?.cancel().catch(() => {});
        return probes;
      }
      lastHttpStatus = response.status;
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      const exited = devExitCode(child);
      if (exited !== null) {
        throw new G007Error("E_DEV_EXIT", `dev server exited ${exited}`);
      }
      lastNetworkError = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    }
    if (Date.now() < deadline) {
      await readinessDelay(Math.min(100, deadline - Date.now()));
    }
  }
  const exited = devExitCode(child);
  if (exited !== null) {
    throw new G007Error("E_DEV_EXIT", `dev server exited ${exited}`);
  }
  const details = [
    lastHttpStatus === null ? null : `last HTTP status: ${lastHttpStatus}`,
    lastNetworkError === null ? null : `last network error: ${lastNetworkError}`
  ].filter(Boolean).join("; ");
  throw new G007Error(
    "E_READINESS_TIMEOUT",
    `readiness timeout for ${url}${details ? `; ${details}` : ""}`
  );
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000))
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

function numericArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((entry) => !Number.isFinite(entry))) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} is not ${length} finite numbers`);
  }
  return value;
}

function within(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} out of range: ${value}`);
  }
}

function exactArray(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} mismatch`);
  }
}

function validateRenderer(world, label) {
  if (!world || world.renderer !== "approved-reference" || world.technology !== "canvas2d") {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} renderer identity`);
  }
  if (world.worldReady !== "true" || world.characterReady !== "ready" || world.moving !== "false") {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} readiness/stability`);
  }
  const telemetry = world.rendererTelemetry;
  if (
    telemetry?.technology !== "canvas2d" ||
    telemetry.canvasContext2dAvailable !== true ||
    telemetry.webglContextAvailable !== false ||
    telemetry.webgl2ContextAvailable !== false ||
    telemetry.gpuTelemetry?.status !== "NOT_APPLICABLE" ||
    telemetry.gpuTelemetry?.reason !== GPU_REASON ||
    telemetry.gpuTelemetry?.estimatedBytes !== null
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} Canvas2D/GPU telemetry`);
  }
  for (const value of [
    telemetry.cssWidth, telemetry.cssHeight, telemetry.backingStoreWidth,
    telemetry.backingStoreHeight, telemetry.devicePixelRatio,
    telemetry.backingStoreCssRatioX, telemetry.backingStoreCssRatioY
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new G007Error("E_CAPTURE_CONTRACT", `${label} invalid renderer dimension`);
    }
  }
  if (
    world.backdrop?.wrapperCount !== 1 || world.backdrop?.imageCount !== 1 ||
    world.backdrop?.source !== WORLD_ASSET || world.backdrop?.complete !== true ||
    world.backdrop?.naturalWidth !== 1817 || world.backdrop?.naturalHeight !== 866 ||
    world.foreground?.frameCount !== 1 || world.foreground?.imageCount !== 1 ||
    world.foreground?.sourceCount !== 1 || world.foreground?.source !== WORLD_ASSET ||
    world.foreground?.complete !== true || world.foreground?.naturalWidth !== 1817 ||
    world.foreground?.naturalHeight !== 866
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} approved source/readiness`);
  }
  const sourceWindow = numericArray(world.sourceWindow, 4, `${label} source window`);
  if (
    sourceWindow[0] < 0 || sourceWindow[1] < 0 ||
    sourceWindow[2] > 1817 || sourceWindow[3] > 866 ||
    sourceWindow[2] < sourceWindow[0] || sourceWindow[3] < sourceWindow[1]
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} source window bounds`);
  }
  const layers = Object.values(world.layers ?? {});
  if (layers.length !== 4) throw new G007Error("E_CAPTURE_CONTRACT", `${label} layer count`);
  const identity = layers[0]?.transformIdentity;
  const revision = layers[0]?.navigationRevision;
  for (const layer of layers) {
    if (
      !identity || layer.transformIdentity !== identity ||
      layer.navigationRevision !== revision ||
      numericArray(layer.imageFrame, 4, `${label} imageFrame`).some(
        (entry, index) => entry !== layers[0].imageFrame[index]
      ) ||
      numericArray(layer.safeFrame, 4, `${label} safeFrame`).some(
        (entry, index) => entry !== layers[0].safeFrame[index]
      )
    ) {
      throw new G007Error("E_CAPTURE_CONTRACT", `${label} transform identity`);
    }
  }
}

function validateComposite(proof, thresholds, label) {
  if (!proof || proof.visibilityRestored !== true) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} composite restoration`);
  }
  within(proof.sprite?.maximumChannelDelta, thresholds.delta, Infinity, `${label} sprite delta`);
  within(proof.sprite?.changedPixelCount, thresholds.sprite, Infinity, `${label} sprite pixels`);
  within(proof.shadow?.changedPixelCount, thresholds.shadow, Infinity, `${label} shadow pixels`);
  within(proof.shadow?.lumaDecrease, Number.EPSILON, Infinity, `${label} shadow luma`);
  within(proof.occlusionRatio, thresholds.occlusion[0], thresholds.occlusion[1], `${label} occlusion`);
  within(proof.remainingSpriteRatio, 0.65, 1, `${label} remaining sprite`);
  if (
    proof.normalizedSourceEquivalenceTolerance !== 0 ||
    proof.alphaClassificationMismatchCount !== 0 ||
    stableJson(proof.foregroundTupleBefore) !== stableJson({
      source: proof.foregroundTupleAfter?.source,
      mask: proof.foregroundTupleAfter?.mask,
      clip: proof.foregroundTupleAfter?.clip
    })
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} source equivalence`);
  }
}

function validateMap(mapState, expectedRevision, label) {
  const map = mapState?.telemetry;
  if (!map || map.viewBox !== "0 0 1817 866" || map.navigationRevision !== expectedRevision) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} map identity`);
  }
  if (
    map.terrain?.length !== 1 ||
    map.terrain[0].sourceId !== "approved-world-environment-concept" ||
    map.terrain[0].href !== WORLD_ASSET ||
    map.terrain[0].width !== 1817 || map.terrain[0].height !== 866 ||
    map.coastline?.length !== 1 ||
    map.coastline[0].sourceId !== "approved-reference-coastline" ||
    map.coastline[0].points?.length !== 24
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} terrain/coastline`);
  }
  exactArray(map.routes?.map((route) => route.id), ROUTES, `${label} routes`);
  if (
    map.routes.some((route) =>
      route.points.length < 4 ||
      route.points.flat().some((value) => !Number.isFinite(value) || value < 0 || value > 1817)
    ) ||
    map.routes.filter((route) => route.layer === "bridge").map((route) => route.id).join() !== "sakura-to-hanabi"
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} route geometry`);
  }
  if (map.zones?.length !== 5 || map.arrivals?.length !== 5 || !map.player?.transform) {
    throw new G007Error("E_CAPTURE_CONTRACT", `${label} marker cardinality`);
  }
  for (const [zone, reference] of Object.entries(REFERENCES)) {
    const node = map.zones.find((entry) => entry.id === zone);
    const arrival = map.arrivals.find((entry) => entry.id === `${zone}-arrival`);
    if (node?.anchor !== reference.join(",") || arrival?.anchor !== reference.join(",")) {
      throw new G007Error("E_CAPTURE_CONTRACT", `${label} ${zone} registration`);
    }
  }
}

function runtimePaths(character) {
  return [
    `player-${character}.webp`, `player-${character}-back.webp`,
    `player-${character}-run-front-a.webp`, `player-${character}-run-front-b.webp`,
    `player-${character}-run-back-a.webp`, `player-${character}-run-back-b.webp`,
    `player-${character}-run-right.webp`, `player-${character}-run-right-b.webp`
  ].map((name) => `/assets/characters/runtime/${name}`).sort();
}

export function validateSelectionArtwork(artwork, expectedCharacter, label) {
  if (
    artwork?.selectedCharacter !== expectedCharacter ||
    artwork?.figures?.length !== 2
  ) {
    throw new G007Error(
      "E_CAPTURE_CONTRACT",
      `${label} selection artwork identity`
    );
  }
  exactArray(
    artwork.figures.map((figure) => figure?.character),
    ["male", "female"],
    `${label} selection artwork order`
  );
  const expectedSources = {
    male: "/assets/characters/player-male.png",
    female: "/assets/characters/player-female.png"
  };
  for (const figure of artwork.figures) {
    if (
      figure.source !== expectedSources[figure.character] ||
      figure.complete !== true ||
      !Number.isFinite(figure.naturalWidth) ||
      figure.naturalWidth <= 0 ||
      !Number.isFinite(figure.naturalHeight) ||
      figure.naturalHeight <= 0 ||
      !Number.isFinite(figure.renderedWidth) ||
      figure.renderedWidth <= 0 ||
      !Number.isFinite(figure.renderedHeight) ||
      figure.renderedHeight <= 0 ||
      figure.selected !== (figure.character === expectedCharacter)
    ) {
      throw new G007Error(
        "E_CAPTURE_CONTRACT",
        `${label} ${figure.character} selection artwork readiness`
      );
    }
  }
  if (
    artwork.pixelProof?.visibilityRestored !== true ||
    artwork.pixelProof?.figures?.length !== 2
  ) {
    throw new G007Error(
      "E_CAPTURE_CONTRACT",
      `${label} selection screenshot restoration`
    );
  }
  exactArray(
    artwork.pixelProof.figures.map((figure) => figure?.character),
    ["male", "female"],
    `${label} selection screenshot order`
  );
  for (const figure of artwork.pixelProof.figures) {
    if (
      !Number.isFinite(figure.maximumChannelDelta) ||
      figure.maximumChannelDelta < 10 ||
      !Number.isFinite(figure.changedPixelCount) ||
      figure.changedPixelCount < 1_000
    ) {
      throw new G007Error(
        "E_CAPTURE_CONTRACT",
        `${label} ${figure.character} selection screenshot pixels`
      );
    }
  }
}

export function validateCapture(capture) {
  if (capture?.rendererTechnology !== "canvas2d") {
    throw new G007Error("E_CAPTURE_CONTRACT", "renderer technology must be canvas2d");
  }
  if (
    capture.gpuTelemetry?.status !== "NOT_APPLICABLE" ||
    capture.gpuTelemetry?.reason !== GPU_REASON ||
    capture.gpuTelemetry?.estimatedBytes !== null
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", "top-level GPU telemetry");
  }
  const desktop = capture.desktop?.rows;
  const mobile = capture.mobile?.rows;
  exactArray(desktop?.map((row) => row?.id), DESKTOP_ROWS, "desktop rows");
  exactArray(mobile?.map((row) => row?.id), MOBILE_ROWS, "mobile rows");
  exactArray(capture.desktop?.viewport, { width: 1440, height: 900 }, "desktop viewport");
  exactArray(capture.mobile?.viewport, { width: 390, height: 844 }, "mobile viewport");
  const rows = [...desktop, ...mobile];
  if (
    rows.length !== 17 ||
    new Set(rows.map((row) => row.screenshotPath)).size !== 17 ||
    capture.screenshots?.length !== 17 ||
    capture.errors?.length !== 0 ||
    capture.actionErrors?.length !== 0
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", "screenshot/error inventory");
  }
  exactArray(capture.ownership, OWNERSHIP, "row ownership");
  validateSelectionArtwork(
    desktop.find((row) => row.id === "selection-male")?.selectionArtwork,
    "male",
    "desktop male"
  );
  validateSelectionArtwork(
    desktop.find((row) => row.id === "selection-female")?.selectionArtwork,
    "female",
    "desktop female"
  );
  validateSelectionArtwork(
    mobile.find((row) => row.id === "selection-female")?.selectionArtwork,
    "female",
    "mobile female"
  );
  for (const row of rows.filter((candidate) => candidate.world)) {
    validateRenderer(row.world, row.id);
    if (row.character !== row.world.character) {
      throw new G007Error("E_CAPTURE_CONTRACT", `${row.id} selected character`);
    }
  }
  const zones = Object.keys(ARRIVALS);
  for (const zone of zones) {
    const row = desktop.find((candidate) => candidate.id === `zone-${zone}`);
    exactArray(row.logicalPosition, ARRIVALS[zone], `${zone} arrival`);
    if (row.currentZone !== zone) throw new G007Error("E_CAPTURE_CONTRACT", `${zone} zone`);
  }
  const spriteHeightRanges = {
    airport: [144, 144],
    tokyo: [120, 135],
    gyukatsu: [130, 145],
    sakura: [135, 150],
    hanabi: [128, 128]
  };
  for (const [zone, spriteHeightRange] of Object.entries(spriteHeightRanges)) {
    const world = desktop.find((row) => row.id === `zone-${zone}`).world;
    const imageFrame = numericArray(
      world.layers?.backdrop?.imageFrame, 4, `${zone} backdrop imageFrame`
    );
    const playerScreenFoot = numericArray(
      world.playerScreenFoot, 2, `${zone} playerScreenFoot`
    );
    const reference = REFERENCES[zone];
    const naturalWidth = world.backdrop.naturalWidth;
    const naturalHeight = world.backdrop.naturalHeight;
    const expectedFoot = [
      imageFrame[0] + reference[0] / naturalWidth * imageFrame[2],
      imageFrame[1] + reference[1] / naturalHeight * imageFrame[3]
    ];
    within(
      playerScreenFoot[0],
      expectedFoot[0] - 0.25,
      expectedFoot[0] + 0.25,
      `${zone} foot x`
    );
    within(
      playerScreenFoot[1],
      expectedFoot[1] - 0.25,
      expectedFoot[1] + 0.25,
      `${zone} foot y`
    );
    within(
      world.playerScreenHeight,
      spriteHeightRange[0],
      spriteHeightRange[1],
      `${zone} sprite height`
    );
    if (world.shadow.footOffset !== 4) throw new G007Error("E_CAPTURE_CONTRACT", `${zone} footOffset`);
  }
  const airport = desktop.find((row) => row.id === "zone-airport");
  const hanabi = desktop.find((row) => row.id === "zone-hanabi");
  exactArray(
    [airport.world.shadow.bounds[2], airport.world.shadow.bounds[3], airport.world.shadow.opacity, airport.world.shadow.blur],
    [58, 15, 0.42, 2], "airport shadow"
  );
  exactArray(
    [hanabi.world.shadow.bounds[2], hanabi.world.shadow.bounds[3], hanabi.world.shadow.opacity, hanabi.world.shadow.blur],
    [50, 14, 0.44, 2], "hanabi shadow"
  );
  validateComposite(airport.compositeProof, {
    delta: 9, sprite: 2000, shadow: 220, occlusion: [0.12, 0.30]
  }, "desktop airport");
  validateComposite(hanabi.compositeProof, {
    delta: 9, sprite: 1500, shadow: 180, occlusion: [0.18, 0.40]
  }, "desktop hanabi");
  const mobileWorld = mobile.find((row) => row.id === "world-female").world;
  exactArray(mobileWorld.safeFrame, [0, 64, 390, 780], "mobile safe frame");
  within(mobileWorld.blankHeight, 0, 1, "mobile blank height");
  within(mobileWorld.playerScreenFoot[1], 650, 735, "mobile player foot");
  if (mobileWorld.playerScreenHeight !== 122 || mobileWorld.cameraStepCssPixels > 24.01) {
    throw new G007Error("E_CAPTURE_CONTRACT", "mobile sprite/camera");
  }
  if (
    mobileWorld.shadow.bounds[2] !== 48 ||
    mobileWorld.shadow.bounds[3] !== 14 ||
    mobileWorld.shadow.opacity !== 0.46 ||
    mobileWorld.shadow.blur !== 1.5
  ) {
    throw new G007Error("E_CAPTURE_CONTRACT", "mobile shadow");
  }
  for (const bounds of mobileWorld.controlBounds) {
    if (
      bounds.x < mobileWorld.rendererBounds.x ||
      bounds.y < mobileWorld.rendererBounds.y ||
      bounds.x + bounds.width > mobileWorld.rendererBounds.x + mobileWorld.rendererBounds.width ||
      bounds.y + bounds.height > mobileWorld.rendererBounds.y + mobileWorld.rendererBounds.height
    ) throw new G007Error("E_CAPTURE_CONTRACT", "mobile control containment");
  }
  if (mobileWorld.horizontalOverflow > 0 || mobileWorld.verticalOverflow > 0) {
    throw new G007Error("E_CAPTURE_CONTRACT", "mobile overflow");
  }
  for (const row of [
    desktop.find((candidate) => candidate.id === "mini-map"),
    desktop.find((candidate) => candidate.id === "full-map"),
    mobile.find((candidate) => candidate.id === "expanded-mini-map"),
    mobile.find((candidate) => candidate.id === "full-map")
  ]) validateMap(row.mapState, row.world.navigationRevision, row.id);
  if (capture.requestLedgers?.length !== 3) {
    throw new G007Error("E_REQUEST_IDENTITY", "request ledger count");
  }
  for (const [identity, owned] of Object.entries(OWNERSHIP)) {
    const ledger = capture.requestLedgers.find((entry) => entry.identity === identity);
    if (!ledger || stableJson(ledger.ownedRows) !== stableJson(owned)) {
      throw new G007Error("E_REQUEST_IDENTITY", `${identity} ownership`);
    }
    if (
      ["consoleErrors", "pageErrors", "failedRequests", "httpErrors", "actionErrors"]
        .some((key) => ledger[key]?.length !== 0)
    ) throw new G007Error("E_REQUEST_IDENTITY", `${identity} runtime errors`);
    const paths = ledger.requests.map((request) => new URL(request.url).pathname);
    if (
      paths.some((url) => url.endsWith(".glb")) ||
      ledger.requests.some((request) =>
        request.outcome === "failed" || request.failureText || (request.status !== null && request.status >= 400)
      ) ||
      !paths.includes(WORLD_ASSET)
    ) throw new G007Error("E_REQUEST_IDENTITY", `${identity} request gate`);
    const classified = [...new Set(paths.filter((url) =>
      /^\/assets\/characters\/runtime\/[^/]+\.webp$/.test(url)
    ))].sort();
    exactArray(classified, runtimePaths(ledger.character), `${identity} runtime assets`);
  }
  if (capture.environmentAudit?.forbiddenKeyNames?.length !== 0) {
    throw new G007Error("E_CAPTURE_CONTRACT", "Playwright forbidden environment");
  }
  const proof = capture.proofs?.mobileHanabi;
  if (
    !proof || proof.proofRowId !== null || proof.screenshotPath !== null ||
    proof.afterMobileScreenshotCount !== 5 || proof.totalScreenshotCountBeforeProof !== 17 ||
    proof.traveledTo !== "hanabi" || proof.returnedTo !== "airport" ||
    proof.hanabiState?.currentZone !== "hanabi" ||
    stableJson(proof.hanabiState?.position) !== stableJson(ARRIVALS.hanabi) ||
    proof.restoredAirportState?.currentZone !== "airport" ||
    stableJson(proof.restoredAirportState?.position) !== stableJson(ARRIVALS.airport) ||
    proof.visibilityRestored !== true
  ) throw new G007Error("E_CAPTURE_CONTRACT", "mobile Hanabi lifecycle");
  validateComposite(proof.measurement, {
    delta: 9, sprite: 1300, shadow: 160, occlusion: [0.18, 0.40]
  }, "mobile Hanabi");
  return { failedPredicates: [] };
}

async function screenshotTuples(evidenceDirectory, capture) {
  const rows = [];
  for (const screenshot of capture.screenshots) {
    const relative = screenshot.relativePath;
    if (
      path.isAbsolute(relative) ||
      relative.includes("..") ||
      !/^(desktop|mobile)\/[^/]+\.png$/.test(relative)
    ) throw new G007Error("E_CAPTURE_CONTRACT", `invalid screenshot path ${relative}`);
    rows.push(await hashFile(path.join(evidenceDirectory, relative), relative));
  }
  return rows;
}

function counters() {
  return {
    captureCount: 0,
    devServerStartCount: 0,
    readinessCycleCount: 0,
    playwrightInvocationCount: 0,
    devServerStopCount: 0,
    finalizeCount: 0,
    recaptureCount: 0,
    devServerRestartCount: 0
  };
}

async function terminalizeFailure(evidenceDirectory, manifest, error) {
  if (!evidenceDirectory || !manifest) return;
  const failure = {
    ...manifest,
    phase: "failed",
    status: "FAIL",
    failureCode: error instanceof G007Error ? error.code : "E_INTERNAL",
    failureMessage: error instanceof Error ? error.message : String(error),
    failedAt: new Date().toISOString()
  };
  await atomicJson(path.join(evidenceDirectory, "g007-visual-verification.json"), failure);
}

async function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

export async function captureEvidence() {
  const rootInfo = await lstat(EVIDENCE_ROOT).catch((error) => {
    throw new G007Error("E_ROOT_INVALID", "evidence root unavailable", error);
  });
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new G007Error("E_ROOT_INVALID", "evidence root invalid");
  }
  const port = process.env.G007_PORT === undefined
    ? DEFAULT_G007_PORT
    : Number(process.env.G007_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new G007Error("E_PORT_COLLISION", "G007_PORT must be an integer port");
  }
  if (await isPortListening(port)) {
    throw new G007Error("E_PORT_COLLISION", `port ${port} is already listening`);
  }
  const recoveryBefore = await validateRecoveryContract();
  let evidenceDirectory;
  let manifest;
  let dev;
  let devLog;
  try {
    evidenceDirectory = await reserveEvidence();
    manifest = {
      schemaVersion: 1,
      phase: "reserved",
      lastCompletedPhase: "reserved",
      status: "RUNNING",
      captureIdentity: `g007-executor-${process.pid}`,
      executorIdentity: `g007-executor-${process.pid}`,
      reservedAt: new Date().toISOString(),
      evidenceDirectory,
      counters: counters(),
      inputAggregate: null,
      screenshotTuples: []
    };
    await atomicJson(
      path.join(evidenceDirectory, "g007-visual-verification.json"),
      manifest,
      "wx"
    );
    const toolchain = await createToolchainInputs(evidenceDirectory);
    const protectedBefore = await protectedSnapshot();
    await validateRealProtectedSnapshot(protectedBefore);
    const baseline = await baselineSnapshot();
    const { result: inputs, canonicalLocalPlaywrightCli } =
      await currentInputManifest(evidenceDirectory, toolchain);
    await atomicJson(path.join(evidenceDirectory, "g007-current-inputs.json"), inputs, "wx");
    await atomicJson(path.join(evidenceDirectory, "g007-protected-inputs.json"), {
      attempt4: protectedBefore,
      recovery: recoveryBefore.protectedSnapshot,
      baseline
    }, "wx");
    manifest.inputAggregate = inputs.aggregate;
    manifest.currentInputManifestSha256 = sha256(`${JSON.stringify(inputs, null, 2)}\n`);
    await atomicJson(path.join(evidenceDirectory, "g007-visual-verification.json"), manifest);

    const baseURL = `http://127.0.0.1:${port}`;
    const devEnvironment = buildChildEnvironment(evidenceDirectory, baseURL, {
      NPM_CONFIG_USERCONFIG: toolchain.userPath,
      NPM_CONFIG_GLOBALCONFIG: toolchain.globalPath
    });
    if (forbiddenKeys(Object.keys(devEnvironment)).length) {
      throw new G007Error("E_NPM_CONFIG_AUDIT", "forbidden direct dev environment");
    }
    const logHandle = await open(path.join(evidenceDirectory, "dev-server.log"), "wx");
    devLog = logHandle;
    dev = spawn(
      "npm",
      ["run", "dev", "--", "--port", String(port), "--hostname", "127.0.0.1"],
      {
        cwd: REPOSITORY_ROOT,
        env: devEnvironment,
        stdio: ["ignore", logHandle.fd, logHandle.fd]
      }
    );
    manifest.counters.devServerStartCount = 1;
    manifest.counters.readinessCycleCount = 1;
    const readinessProbeCount = await waitForReady(`${baseURL}/en`, dev);
    manifest.readinessProbeCount = readinessProbeCount;
    const playwrightEnvironment = buildChildEnvironment(evidenceDirectory, baseURL);
    if (forbiddenKeys(Object.keys(playwrightEnvironment)).length) {
      throw new G007Error("E_CAPTURE_CONTRACT", "forbidden direct Playwright environment");
    }
    manifest.counters.playwrightInvocationCount = 1;
    const playwrightResult = await runProcess(
      process.execPath,
      [
        canonicalLocalPlaywrightCli,
        "test",
        "--config=playwright.g007.config.ts",
        "--grep",
        "captures the current desktop and mobile visual contract$"
      ],
      {
        cwd: REPOSITORY_ROOT,
        env: playwrightEnvironment,
        stdio: "inherit"
      }
    );
    await validatePostPlaywrightRecovery(playwrightResult, recoveryBefore);
    manifest.counters.captureCount = 1;
  } catch (error) {
    await terminalizeFailure(evidenceDirectory, manifest, error).catch(() => {});
    throw error;
  } finally {
    if (dev) {
      await stopChild(dev).catch(() => {});
      if (manifest) manifest.counters.devServerStopCount = 1;
    }
    await devLog?.close().catch(() => {});
  }
  try {
    const capturePath = path.join(evidenceDirectory, "g007-capture.json");
    const captureBytes = await readFile(capturePath);
    const capture = JSON.parse(captureBytes);
    validateCapture(capture);
    const toolchain = {
      userPath: path.join(evidenceDirectory, "g007-user.npmrc"),
      globalPath: path.join(evidenceDirectory, "g007-global.npmrc"),
      wrapperPath: path.join(evidenceDirectory, "g007-npm-script-shell")
    };
    const originalInputs = JSON.parse(
      await readFile(path.join(evidenceDirectory, "g007-current-inputs.json"), "utf8")
    );
    await currentInputManifest(evidenceDirectory, toolchain, originalInputs);
    const npmAudit = JSON.parse(
      await readFile(path.join(evidenceDirectory, "g007-npm-env-keys.json"), "utf8")
    );
    if (npmAudit.forbidden?.length || forbiddenKeys(npmAudit.keys).length) {
      throw new G007Error("E_NPM_CONFIG_AUDIT", "effective npm environment rejected");
    }
    const protectedOriginal = JSON.parse(
      await readFile(path.join(evidenceDirectory, "g007-protected-inputs.json"), "utf8")
    );
    const protectedAfter = await protectedSnapshot();
    if (stableJson(protectedAfter) !== stableJson(protectedOriginal.attempt4)) {
      throw new G007Error("E_PROTECTED_DRIFT", "protected evidence drift after capture");
    }
    const screenshots = await screenshotTuples(evidenceDirectory, capture);
    manifest.phase = "capture_complete";
    manifest.lastCompletedPhase = "capture_complete";
    manifest.status = "AWAITING_VISUAL_REVIEW";
    manifest.captureCompletedAt = new Date().toISOString();
    manifest.captureJsonSha256 = sha256(captureBytes);
    manifest.screenshotTuples = screenshots;
    manifest.failedPredicates = [];
    const captureComplete = { ...manifest };
    await atomicJson(
      path.join(evidenceDirectory, "g007-capture-complete.json"),
      captureComplete,
      "wx"
    );
    await atomicJson(path.join(evidenceDirectory, "g007-visual-verification.json"), manifest);
    return { evidenceDirectory, status: manifest.status };
  } catch (error) {
    await terminalizeFailure(evidenceDirectory, manifest, error).catch(() => {});
    throw error;
  }
}

function validateReview(review, markdown, evidenceDirectory, manifest, attempt4) {
  if (!review) throw new G007Error("E_VISUAL_REVIEW_MISSING", "review JSON is missing");
  if (review.overallVerdict === "REJECT") {
    throw new G007Error("E_VISUAL_REJECT", "Vision review rejected capture");
  }
  const captureTime = Date.parse(manifest.captureCompletedAt);
  const reviewTime = Date.parse(review.reviewTimestamp);
  if (
    review.overallVerdict !== "APPROVE" ||
    !review.reviewerIdentity ||
    review.reviewerIdentity === manifest.captureIdentity ||
    !Number.isFinite(reviewTime) || reviewTime <= captureTime ||
    review.captureIdentity !== manifest.captureIdentity ||
    review.captureManifestSha256 !== manifest.captureJsonSha256 ||
    review.currentInputAggregateSha256 !== manifest.inputAggregate ||
    review.evidenceDirectory !== evidenceDirectory ||
    !Array.isArray(review.rows) || review.rows.length !== 17
  ) throw new G007Error("E_VISUAL_REVIEW_INVALID", "review header is invalid");
  const expectedIds = [...DESKTOP_ROWS, ...MOBILE_ROWS];
  for (let index = 0; index < expectedIds.length; index += 1) {
    const row = review.rows[index];
    const screenshot = manifest.screenshotTuples[index];
    const attemptScreenshot = attempt4.screenshots.find((entry) =>
      entry.path === screenshot.path
    );
    if (
      row?.id !== expectedIds[index] ||
      row.verdict !== "APPROVE" ||
      stableJson(row.g007Screenshot) !== stableJson(screenshot) ||
      stableJson(row.attempt4Screenshot) !== stableJson(attemptScreenshot)
    ) throw new G007Error("E_VISUAL_REVIEW_INVALID", `review row ${index} binding`);
    const judgments = row.judgments;
    for (const key of [
      "characterIdentityAndGrounding", "backgroundCameraAndZoneDifferentiation",
      "foregroundOcclusion", "mapRegistration", "mobileSafeFrame", "uiOverlapOrClipping"
    ]) {
      if (
        !["APPROVE", "NOT_APPLICABLE"].includes(judgments?.[key]?.verdict) ||
        !judgments?.[key]?.reason
      ) throw new G007Error("E_VISUAL_REVIEW_INVALID", `${row.id} ${key}`);
    }
  }
  const reviewBytes = `${JSON.stringify(review, null, 2)}\n`;
  const reviewSha = sha256(reviewBytes);
  if (!markdown.includes(reviewSha) || !markdown.includes(evidenceDirectory)) {
    throw new G007Error("E_VISUAL_REVIEW_INVALID", "Markdown does not bind review JSON");
  }
  return reviewSha;
}

export async function finalizeEvidence(directory) {
  const evidenceRoot = await realpath(EVIDENCE_ROOT);
  let canonical;
  try {
    canonical = await realpath(path.resolve(REPOSITORY_ROOT, directory));
  } catch (error) {
    throw new G007Error("E_CANDIDATE_INVALID", "finalize directory unavailable", error);
  }
  const info = await lstat(canonical);
  if (
    info.isSymbolicLink() || !info.isDirectory() ||
    path.dirname(canonical) !== evidenceRoot ||
    !/^g007-/.test(path.basename(canonical))
  ) throw new G007Error("E_CANDIDATE_INVALID", "invalid finalize directory");
  const recoveryAtFinalizeEntry = await validateRecoveryContract();
  const manifestPath = path.join(canonical, "g007-visual-verification.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const captureComplete = JSON.parse(
    await readFile(path.join(canonical, "g007-capture-complete.json"), "utf8")
  );
  if (
    manifest.status !== "AWAITING_VISUAL_REVIEW" ||
    manifest.lastCompletedPhase !== "capture_complete" ||
    stableJson(manifest) !== stableJson(captureComplete)
  ) throw new G007Error("E_FINALIZE_DRIFT", "capture_complete state required");
  try {
    const captureBytes = await readFile(path.join(canonical, "g007-capture.json"));
    if (sha256(captureBytes) !== manifest.captureJsonSha256) {
      throw new G007Error("E_FINALIZE_DRIFT", "capture JSON drift");
    }
    const capture = JSON.parse(captureBytes);
    validateCapture(capture);
    const screenshots = await screenshotTuples(canonical, capture);
    if (stableJson(screenshots) !== stableJson(manifest.screenshotTuples)) {
      throw new G007Error("E_FINALIZE_DRIFT", "screenshot tuple drift");
    }
    const inputs = JSON.parse(
      await readFile(path.join(canonical, "g007-current-inputs.json"), "utf8")
    );
    const toolchain = {
      userPath: path.join(canonical, "g007-user.npmrc"),
      globalPath: path.join(canonical, "g007-global.npmrc"),
      wrapperPath: path.join(canonical, "g007-npm-script-shell")
    };
    await currentInputManifest(canonical, toolchain, inputs);
    const protectedOriginal = JSON.parse(
      await readFile(path.join(canonical, "g007-protected-inputs.json"), "utf8")
    );
    if (
      stableJson(recoveryAtFinalizeEntry.protectedSnapshot) !==
      stableJson(protectedOriginal.recovery)
    ) throw new G007Error("E_PROTECTED_DRIFT", "recovery contract drift at finalize entry");
    const protectedAfter = await protectedSnapshot();
    if (stableJson(protectedAfter) !== stableJson(protectedOriginal.attempt4)) {
      throw new G007Error("E_PROTECTED_DRIFT", "protected evidence drift at finalize");
    }
    let review;
    let reviewMarkdown;
    try {
      review = JSON.parse(await readFile(path.join(canonical, "g007-visual-review.json"), "utf8"));
      reviewMarkdown = await readFile(
        path.join(REPOSITORY_ROOT, ".omx", "plans", "reviews", "g007-visual-review.md"),
        "utf8"
      );
    } catch (error) {
      throw new G007Error("E_VISUAL_REVIEW_MISSING", "Vision review artifacts missing", error);
    }
    const reviewJsonSha256 = validateReview(
      review, reviewMarkdown, canonical, manifest, protectedOriginal.attempt4
    );
    const reviewMarkdownSha256 = sha256(reviewMarkdown);
    const terminal = {
      ...manifest,
      phase: "finalize_complete",
      lastCompletedPhase: "finalize_complete",
      status: "PASS",
      finalizedAt: new Date().toISOString(),
      reviewJsonSha256,
      reviewMarkdownSha256,
      counters: { ...manifest.counters, finalizeCount: 1 }
    };
    const recoveryBeforePass = await validateRecoveryContract();
    if (
      stableJson(recoveryBeforePass.protectedSnapshot) !==
      stableJson(protectedOriginal.recovery)
    ) throw new G007Error("E_PROTECTED_DRIFT", "recovery contract drift before PASS");
    await atomicJson(manifestPath, terminal);
    return { evidenceDirectory: canonical, status: "PASS" };
  } catch (error) {
    await terminalizeFailure(canonical, {
      ...manifest,
      lastCompletedPhase: "capture_complete",
      counters: { ...manifest.counters, finalizeCount: 1 }
    }, error);
    throw error;
  }
}

export async function runSelfTest() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "g007-self-test-"));
  let assertions = 0;
  const assert = (condition, label) => {
    assertions += 1;
    if (!condition) throw new Error(`self-test failed: ${label}`);
  };
  const rejects = async (operation, code, label) => {
    try {
      await operation();
      assert(false, `${label} did not reject`);
    } catch (error) {
      assert(error?.code === code, `${label}: ${error?.code}`);
    }
  };
  try {
    const root = path.join(temporary, "visual-fidelity");
    await mkdir(root);
    await rejects(() => reserveEvidence(root, "../escape"), "E_CANDIDATE_INVALID", "traversal");
    await rejects(() => reserveEvidence(root, "g007-/escape"), "E_CANDIDATE_INVALID", "nested");
    const sibling = `${root}-sibling`;
    await mkdir(sibling);
    await rejects(() => reserveEvidence(root, `../${path.basename(sibling)}`), "E_CANDIDATE_INVALID", "sibling prefix");
    const rootLink = path.join(temporary, "root-link");
    await import("node:fs/promises").then(({ symlink }) => symlink(root, rootLink));
    await rejects(() => reserveEvidence(rootLink), "E_ROOT_INVALID", "root symlink");
    const rootFile = path.join(temporary, "root-file");
    await writeFile(rootFile, "x");
    await rejects(() => reserveEvidence(rootFile), "E_ROOT_INVALID", "root non-directory");
    const run = await reserveEvidence(root, "g007-valid");
    assert((await lstat(run)).isDirectory(), "reservation creates directory");
    await rejects(() => reserveEvidence(root, "g007-valid"), "E_RESERVATION_EXISTS", "duplicate");

    const base = buildChildEnvironment("/evidence", "http://127.0.0.1");
    const baseExpected = [...BASE_ENV_KEYS.filter((key) => process.env[key] !== undefined),
      "NODE_ENV", "G007_EVIDENCE_DIR", "G007_BASE_URL"].sort();
    assert(stableJson(Object.keys(base).sort()) === stableJson(baseExpected), "base env allowlist");
    const dev = buildChildEnvironment("/evidence", "http://127.0.0.1", {
      NPM_CONFIG_USERCONFIG: "/u", NPM_CONFIG_GLOBALCONFIG: "/g"
    });
    assert(Object.keys(dev).length === Object.keys(base).length + 2, "dev adds two npm keys");
    assert(forbiddenKeys(Object.keys(base)).length === 0, "base no forbidden keys");
    assert(forbiddenKeys(["ARCHITECTURE_X"]).length === 1, "architecture key rejected");
    assert(forbiddenKeys(["VISUAL_X"]).length === 1, "visual key rejected");
    assert(forbiddenKeys(["G005_X"]).length === 1, "g005 key rejected");
    assert(forbiddenKeys(["THING_ATTEMPT"]).length === 1, "attempt key rejected");
    assert(forbiddenKeys(["THING_LOCK"]).length === 1, "lock key rejected");
    assert(forbiddenKeys(["THING_PREFLIGHT"]).length === 1, "preflight key rejected");
    assert(forbiddenKeys(["THING_FINALIZE"]).length === 1, "finalize key rejected");
    assert(forbiddenKeys(["npm_lifecycle_event", "WRANGLER_LOG_PATH"]).length === 0, "lifecycle keys accepted");

    const implicitRoot = path.join(temporary, "implicit");
    await mkdir(implicitRoot);
    let rows = await implicitRows(implicitRoot);
    assert(rows.every((row) => row.presence === "absent"), "implicit absent rows");
    await writeFile(path.join(implicitRoot, ".env"), "A=1\n");
    rows = await implicitRows(implicitRoot);
    assert(rows.find((row) => row.path === ".env")?.presence === "present", "implicit present row");
    const before = stableJson(rows);
    await writeFile(path.join(implicitRoot, ".env"), "A=2\n");
    assert(stableJson(await implicitRows(implicitRoot)) !== before, "implicit byte drift");
    await rm(path.join(implicitRoot, ".env"));
    await mkdir(path.join(implicitRoot, ".env"));
    await rejects(() => implicitRows(implicitRoot), "E_IMPLICIT_INPUT_INVALID", "implicit non-file");
    await rm(path.join(implicitRoot, ".env"), { recursive: true });
    await import("node:fs/promises").then(({ symlink }) =>
      symlink(path.join(temporary, "trap"), path.join(implicitRoot, ".env"))
    );
    await rejects(() => implicitRows(implicitRoot), "E_IMPLICIT_INPUT_INVALID", "implicit symlink");

    const fixture = path.join(temporary, "file");
    await writeFile(fixture, "one");
    const first = await hashFile(fixture, "file");
    assert(first.sha256 === sha256("one"), "hash row bytes");
    await writeFile(fixture, "two");
    const second = await hashFile(fixture, "file");
    assert(first.sha256 !== second.sha256, "byte drift visible");
    assert(first.size === second.size, "same-size drift visible");
    await chmod(fixture, 0o600);
    const mode = await hashFile(fixture, "file");
    assert(mode.mode !== second.mode, "mode drift visible");
    const time = new Date(Date.now() + 2_000);
    await utimes(fixture, time, time);
    const mtime = await hashFile(fixture, "file");
    assert(mtime.mtimeMs !== mode.mtimeMs, "mtime drift visible");

    const toolDir = path.join(temporary, "toolchain");
    await mkdir(toolDir);
    const tools = await createToolchainInputs(toolDir);
    const user = await readFile(tools.userPath, "utf8");
    assert(user.includes(`script-shell=${tools.wrapperPath}`), "script-shell pin");
    assert((await lstat(tools.wrapperPath)).mode & 0o100, "wrapper executable");
    assert((await readFile(tools.globalPath, "utf8")) === TOOLCHAIN_BYTES.global, "global npmrc fixed");
    assert(!(await readFile(tools.wrapperPath, "utf8")).includes("process.env["), "wrapper logs no values");

    const minimalWorld = {
      renderer: "approved-reference", technology: "canvas2d", worldReady: "true",
      characterReady: "ready", moving: "false", character: "female",
      rendererTelemetry: {
        technology: "canvas2d", canvasContext2dAvailable: true,
        webglContextAvailable: false, webgl2ContextAvailable: false,
        cssWidth: 1, cssHeight: 1, backingStoreWidth: 1, backingStoreHeight: 1,
        devicePixelRatio: 1, backingStoreCssRatioX: 1, backingStoreCssRatioY: 1,
        gpuTelemetry: { status: "NOT_APPLICABLE", reason: GPU_REASON, estimatedBytes: null }
      },
      backdrop: { wrapperCount: 1, imageCount: 1, source: WORLD_ASSET, complete: true, naturalWidth: 1817, naturalHeight: 866 },
      foreground: { frameCount: 1, imageCount: 1, sourceCount: 1, source: WORLD_ASSET, complete: true, naturalWidth: 1817, naturalHeight: 866 },
      sourceWindow: [0, 0, 1817, 866],
      layers: Object.fromEntries(["backdrop", "canvas", "shadow", "foreground"].map(
        (key) => [key, { transformIdentity: "1:1", navigationRevision: "1", imageFrame: [0, 0, 1, 1], safeFrame: [0, 0, 1, 1] }]
      ))
    };
    validateRenderer(minimalWorld, "fixture");
    assert(true, "valid renderer accepted");
    await rejects(
      async () => validateRenderer({ ...minimalWorld, technology: "canvas-2d" }, "fixture"),
      "E_CAPTURE_CONTRACT", "renderer alias"
    );
    await rejects(
      async () => validateRenderer({ ...minimalWorld, sourceWindow: [0, 0, Infinity, 1] }, "fixture"),
      "E_CAPTURE_CONTRACT", "non-finite raw"
    );
    await rejects(
      async () => validateRenderer({ ...minimalWorld, moving: "true" }, "fixture"),
      "E_CAPTURE_CONTRACT", "unstable raw"
    );
    await rejects(
      async () => validateRenderer({ ...minimalWorld, rendererTelemetry: {
        ...minimalWorld.rendererTelemetry, gpuTelemetry: { status: "PASS", reason: "", estimatedBytes: 0 }
      } }, "fixture"),
      "E_CAPTURE_CONTRACT", "fabricated gpu pass"
    );
    assert(stableJson({ b: 1, a: 2 }) === stableJson({ a: 2, b: 1 }), "canonical JSON ordering");
    assert(sha256(stableJson([1, 2])) === sha256(stableJson([1, 2])), "aggregate stable");
    assert(sha256(stableJson([1, 2])) !== sha256(stableJson([2, 1])), "aggregate order sensitive");

    return { status: "PASS", rendererTechnology: "canvas2d", assertions };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const modes = ["--capture", "--finalize", "--self-test"].filter((mode) => argv.includes(mode));
  if (modes.length !== 1) throw new G007Error("E_INTERNAL", "choose exactly one mode");
  const evidenceIndex = argv.indexOf("--evidence-dir");
  return {
    mode: modes[0],
    evidenceDirectory: evidenceIndex === -1 ? null : argv[evidenceIndex + 1]
  };
}

async function main() {
  const { mode, evidenceDirectory } = parseArguments(process.argv.slice(2));
  if (mode === "--self-test") {
    const result = await runSelfTest();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (mode === "--capture") {
    const result = await captureEvidence();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (!evidenceDirectory) {
    throw new G007Error("E_CANDIDATE_INVALID", "--evidence-dir is required");
  }
  const result = await finalizeEvidence(evidenceDirectory);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  main().catch((error) => {
    const code = error instanceof G007Error ? error.code : "E_INTERNAL";
    process.stderr.write(`${code}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
