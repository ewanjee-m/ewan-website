import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  readFile(path.join(root, relativePath), "utf8");

const expectedScripts = {
  test: "npm run test:unit",
  "test:unit": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test --config=playwright.config.ts",
  "test:visual": "node tests/visual/g007-verification.mjs --capture",
  "test:visual:finalize":
    "node tests/visual/g007-verification.mjs --finalize",
  "test:visual:check":
    "node tests/visual/g007-verification.mjs --self-test",
  "test:architecture-gate": "node tests/visual/architecture-attempt.mjs"
};
const retiredSuites = [
  "tests/rpg-npc-glb-renderer.test.ts",
  "tests/rpg-town-scene-instancing.test.ts",
  "tests/rpg-town-details.test.ts",
  "tests/rpg-town-architecture.test.ts",
  "tests/rpg-town-draw-budget.test.ts",
  "tests/npc-patrol-motion.test.ts",
  "tests/rpg-bus-motion.test.ts",
  "tests/rpg-camera-collision.test.ts",
  "tests/rpg-town-scene-layout.test.ts",
  "tests/rpg-town-street-life.test.ts"
];

const incidentId = "g007-playwright-evidence-deletion-20260723";
const recoveryStatus = "RECOVERED_SUBSET_WITH_KNOWN_LOSS";
const recoveryScope = "G007_PIXEL_REFERENCE_ONLY";
const reviewedPlanSha =
  "7c854c80281a61b96de53ae95b53e750bb0db09fb9a6a29278be884b7d7ead4a";
const bundleNames = [
  "source-provenance.json",
  "pre-review-inventory.excerpt.txt",
  "capture-terminal.excerpts.json",
  "screenshot-tuples.json",
  "recovery-attestation.json",
  "independent-verification.json"
] as const;
const recoveredJsonPaths = [
  "attempt-slot-consumed.json",
  "attempt-source-test-hashes.json",
  "modification-diff-manifest.json",
  "vision-review.json",
  "verifier-review.json"
];
const screenshotPaths = [
  "desktop/start.png",
  "desktop/selection-male.png",
  "desktop/selection-female.png",
  "desktop/world-male.png",
  "desktop/world-female.png",
  "desktop/zone-airport.png",
  "desktop/zone-tokyo.png",
  "desktop/zone-gyukatsu.png",
  "desktop/zone-sakura.png",
  "desktop/zone-hanabi.png",
  "desktop/mini-map.png",
  "desktop/full-map.png",
  "mobile/start.png",
  "mobile/selection-female.png",
  "mobile/world-female.png",
  "mobile/expanded-mini-map.png",
  "mobile/full-map.png"
];
const knownLossPaths = [
  "architecture-attempt.json",
  "approved-reference.json",
  "CAM-01.log",
  "CAM-02.log",
  "COMP-01.log",
  "WORLD-01.log",
  "WORLD-03.log",
  "WORLD-06.log",
  "WORLD-07.log",
  "dev-server.log",
  "playwright-results/.last-run.json",
  "playwright.log"
];
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const jsonBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// Fixture documents intentionally model heterogeneous nested JSON for mutation tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;
type RecoveryPaths = {
  repositoryRoot: string;
  attemptRoot: string;
  recoveryRoot: string;
  lockPaths: string[];
  provenancePath: string;
};
type RecoveryContract = {
  incidentId: string;
  status: string;
  scope: string;
  allowedClaims: string[];
  attempt: {
    allowedDirectories: string[];
    files: Array<{
      path: string;
      sha256: string;
      size: number;
      permissions: number;
      mtimeMs?: number;
    }>;
  };
  locks: Array<{
    role: string;
    path: string;
    sha256: string;
    size: number;
    permissions: number;
  }>;
  knownLosses: Array<{
    path: string;
    requiredPresence: "absent";
    replacementProhibited: true;
  }>;
  bundlePins: Record<string, string>;
  provenance: {
    canonicalPath: string;
    sessionId: string;
    records: Array<{
      line: number;
      timestamp: string;
      callId: string;
      payloadType: "custom_tool_call_output";
      recordLineSha256: string;
      decodedOutputSha256: string;
    }>;
  };
};
type RecoveryFixture = {
  paths: RecoveryPaths;
  contract: RecoveryContract;
  documents: Record<string, JsonObject>;
  cleanup: () => Promise<void>;
  flushAll: (refreshLinks?: boolean) => Promise<void>;
  repinBundle: () => Promise<void>;
};

async function rowFor(absolutePath: string, relativePath: string) {
  const bytes = await readFile(absolutePath);
  const info = await lstat(absolutePath);
  return {
    path: relativePath,
    sha256: sha256(bytes),
    size: info.size,
    permissions: info.mode & 0o777,
    mtimeMs: info.mtimeMs
  };
}

async function buildRecoveryFixture(): Promise<RecoveryFixture> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "g007-recovery-contract-"));
  const repositoryRoot = path.join(temporary, "repository");
  const attemptRoot = path.join(
    repositoryRoot,
    "test-results",
    "visual-fidelity",
    "20260723T091950Z-attempt-4"
  );
  const recoveryRoot = path.join(repositoryRoot, ".omx", "recovery", "g005-attempt4");
  const stateRoot = path.join(repositoryRoot, ".omx", "state");
  const provenancePath = path.join(temporary, "source-session.jsonl");
  await mkdir(path.join(attemptRoot, "desktop"), { recursive: true });
  await mkdir(path.join(attemptRoot, "mobile"), { recursive: true });
  await mkdir(recoveryRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });

  for (const [index, relativePath] of recoveredJsonPaths.entries()) {
    const absolutePath = path.join(attemptRoot, relativePath);
    await writeFile(absolutePath, jsonBytes({ fixture: relativePath, index }));
    await chmod(absolutePath, 0o644);
  }
  for (const [index, relativePath] of screenshotPaths.entries()) {
    const absolutePath = path.join(attemptRoot, relativePath);
    await writeFile(absolutePath, Buffer.from(`fixture-png-${relativePath}`));
    await chmod(absolutePath, 0o644);
    const historicalTime = new Date(1_784_798_417_000 + index * 1_000);
    await utimes(absolutePath, historicalTime, historicalTime);
  }

  const lockPaths: string[] = [];
  const locks: RecoveryContract["locks"] = [];
  for (const attempt of [2, 3, 4]) {
    const absolutePath = path.join(stateRoot, `g005-architecture-attempt-${attempt}-lock.json`);
    await writeFile(absolutePath, jsonBytes({ attempt, fixture: true }));
    await chmod(absolutePath, 0o644);
    lockPaths.push(absolutePath);
    const row = await rowFor(
      absolutePath,
      path.posix.join(".omx/state", path.basename(absolutePath))
    );
    locks.push({
      role: attempt === 4 ? "comparison-authority" : "predecessor",
      path: row.path,
      sha256: row.sha256,
      size: row.size,
      permissions: row.permissions
    });
  }

  const provenanceRecords = Array.from({ length: 4 }, (_, index) => {
    const timestamp = `2026-07-23T09:${20 + index}:00.000Z`;
    const callId = `call_fixture_${index + 1}`;
    return {
      timestamp,
      payload: {
        type: "custom_tool_call_output",
        call_id: callId,
        output: [
          { type: "input_text", text: `fixture-output-${index + 1}-a` },
          { type: "input_text", text: `fixture-output-${index + 1}-b` }
        ]
      }
    };
  });
  const provenanceLines = provenanceRecords.map((record) => JSON.stringify(record));
  await writeFile(provenancePath, `${provenanceLines.join("\n")}\n`);
  const provenanceContract = provenanceRecords.map((record, index) => ({
    line: index + 1,
    timestamp: record.timestamp,
    callId: record.payload.call_id,
    payloadType: "custom_tool_call_output" as const,
    recordLineSha256: sha256(provenanceLines[index]),
    decodedOutputSha256: sha256(
      record.payload.output.map((item) => item.text).join("")
    )
  }));

  const inventoryExcerpt = Array.from(
    { length: 32 },
    (_, index) => `test-results/visual-fidelity/fixture/file-${index + 1}`
  ).join("\n") + "\n";
  const documents: Record<string, JsonObject> = {
    "capture-terminal.excerpts.json": {
      schemaVersion: 1,
      incidentId,
      classification: "HISTORICAL_OBSERVATION_ONLY",
      excerpts: provenanceContract.map(({ callId, decodedOutputSha256 }) => ({
        callId,
        decodedOutputSha256
      }))
    },
    "screenshot-tuples.json": {
      schemaVersion: 1,
      incidentId,
      scope: recoveryScope,
      count: 17,
      screenshots: []
    },
    "source-provenance.json": {
      schemaVersion: 1,
      incidentId,
      status: recoveryStatus,
      scope: recoveryScope,
      producer: {
        agentIdentity: "g007-recovery-producer",
        sessionIdentity: "producer-session",
        generatedAt: "2026-07-23T10:00:00.000Z"
      },
      sourceSession: {
        canonicalPath: provenancePath,
        sessionId: "fixture-source-session",
        records: provenanceContract
      },
      leafSha256: {},
      extractionAlgorithm: {
        recordLine: "UTF-8 JSONL bytes excluding terminating LF",
        decodedOutput: "input_text text concatenated in array order without separator"
      },
      supplemental: []
    },
    "recovery-attestation.json": {
      schemaVersion: 1,
      incidentId,
      status: recoveryStatus,
      scope: recoveryScope,
      fullOriginalTreeRecovered: false,
      g005TerminalVerdictReconstructed: false,
      screenshotComparisonEligible: true,
      originalObservedMinimumRegularFileCount: 34,
      recoveredRegularFileCount: 22,
      knownLossPathCount: 12,
      knownMinimumUnrecoveredCount: 12,
      allowedClaims: [recoveryScope],
      sourceProvenanceSha256: "",
      recoveredPaths: [...recoveredJsonPaths, ...screenshotPaths].sort(),
      knownLosses: knownLossPaths.map((lossPath) => ({
        path: lossPath,
        requiredPresence: "absent",
        replacementProhibited: true
      }))
    },
    "independent-verification.json": {
      schemaVersion: 1,
      incidentId,
      producer: {
        agentIdentity: "g007-recovery-verifier",
        sessionIdentity: "verifier-session",
        generatedAt: "2026-07-23T10:30:00.000Z"
      },
      sourceProducer: {
        agentIdentity: "g007-recovery-producer",
        sessionIdentity: "producer-session"
      },
      reviewedPlanSha,
      procedurallyIndependent: true,
      reviewedFiles: {},
      reviewedAttestationSha256: "",
      verdict: "PASS",
      failures: []
    }
  };

  const paths: RecoveryPaths = {
    repositoryRoot,
    attemptRoot,
    recoveryRoot,
    lockPaths,
    provenancePath
  };
  const attemptFiles = [];
  for (const relativePath of [...recoveredJsonPaths, ...screenshotPaths].sort()) {
    const row = await rowFor(path.join(attemptRoot, relativePath), relativePath);
    attemptFiles.push({
      path: row.path,
      sha256: row.sha256,
      size: row.size,
      permissions: row.permissions,
      ...(relativePath.endsWith(".png") ? { mtimeMs: row.mtimeMs } : {})
    });
  }
  const contract: RecoveryContract = {
    incidentId,
    status: recoveryStatus,
    scope: recoveryScope,
    allowedClaims: [recoveryScope],
    attempt: {
      allowedDirectories: ["desktop", "mobile"],
      files: attemptFiles
    },
    locks,
    knownLosses: knownLossPaths.map((lossPath) => ({
      path: lossPath,
      requiredPresence: "absent",
      replacementProhibited: true
    })),
    bundlePins: {},
    provenance: {
      canonicalPath: provenancePath,
      sessionId: "fixture-source-session",
      records: provenanceContract
    }
  };
  const fixture: RecoveryFixture = {
    paths,
    contract,
    documents,
    cleanup: () => rm(temporary, { recursive: true, force: false }),
    flushAll: async () => {},
    repinBundle: async () => {}
  };

  fixture.repinBundle = async () => {
    for (const name of bundleNames) {
      fixture.contract.bundlePins[name] = sha256(
        await readFile(path.join(recoveryRoot, name))
      );
    }
  };
  fixture.flushAll = async (refreshLinks = true) => {
    const excerptPath = path.join(recoveryRoot, "pre-review-inventory.excerpt.txt");
    await writeFile(excerptPath, inventoryExcerpt);
    await chmod(excerptPath, 0o644);
    for (const name of [
      "capture-terminal.excerpts.json",
      "screenshot-tuples.json"
    ]) {
      await writeFile(path.join(recoveryRoot, name), jsonBytes(documents[name]));
      await chmod(path.join(recoveryRoot, name), 0o644);
    }
    if (refreshLinks) {
      documents["source-provenance.json"].leafSha256 = {
        "pre-review-inventory.excerpt.txt": sha256(
          await readFile(excerptPath)
        ),
        "capture-terminal.excerpts.json": sha256(
          await readFile(path.join(recoveryRoot, "capture-terminal.excerpts.json"))
        ),
        "screenshot-tuples.json": sha256(
          await readFile(path.join(recoveryRoot, "screenshot-tuples.json"))
        )
      };
    }
    await writeFile(
      path.join(recoveryRoot, "source-provenance.json"),
      jsonBytes(documents["source-provenance.json"])
    );
    await chmod(path.join(recoveryRoot, "source-provenance.json"), 0o644);
    if (refreshLinks) {
      documents["recovery-attestation.json"].sourceProvenanceSha256 = sha256(
        await readFile(path.join(recoveryRoot, "source-provenance.json"))
      );
    }
    await writeFile(
      path.join(recoveryRoot, "recovery-attestation.json"),
      jsonBytes(documents["recovery-attestation.json"])
    );
    await chmod(path.join(recoveryRoot, "recovery-attestation.json"), 0o644);
    if (refreshLinks) {
      const reviewedFiles: Record<string, string> = {};
      for (const name of bundleNames.slice(0, 5)) {
        reviewedFiles[name] = sha256(await readFile(path.join(recoveryRoot, name)));
      }
      documents["independent-verification.json"].reviewedFiles = reviewedFiles;
      documents["independent-verification.json"].reviewedAttestationSha256 =
        reviewedFiles["recovery-attestation.json"];
    }
    await writeFile(
      path.join(recoveryRoot, "independent-verification.json"),
      jsonBytes(documents["independent-verification.json"])
    );
    await chmod(path.join(recoveryRoot, "independent-verification.json"), 0o644);
    await fixture.repinBundle();
  };
  await fixture.flushAll();
  documents["screenshot-tuples.json"].screenshots = attemptFiles.filter(
    (row) => row.path.endsWith(".png")
  );
  await fixture.flushAll();
  return fixture;
}

describe("G007 visual verification boundary", () => {
  it("exposes the exact package commands", async () => {
    const packageJson = JSON.parse(await read("package.json"));
    expect(packageJson.scripts).toMatchObject(expectedScripts);
  });

  it("locks Vitest to current tests and ten exact retired suites", async () => {
    const config = await import("../../vitest.config");
    expect(config.CURRENT_UNIT_INCLUDE).toEqual(["tests/**/*.test.{ts,tsx}"]);
    expect(config.RETIRED_UNIT_SUITES).toEqual(retiredSuites);
    const source = await read("vitest.config.ts");
    expect(source).not.toMatch(/exclude:\s*\[[^\]]*["']tests\/\*\*["']/s);
    expect(source).not.toMatch(/exclude:[^\n]*(three|camera)/i);
  });

  it("uses an isolated Playwright configuration", async () => {
    const source = await read("playwright.g007.config.ts");
    expect(source).toContain('testMatch: "g007-verification.spec.ts"');
    expect(source).toContain("retries: 0");
    expect(source).not.toContain("webServer");
  });

  it("keeps G007 isolated from consumed G005 executables", async () => {
    const sources = await Promise.all(
      [
        "playwright.g007.config.ts",
        "tests/visual/g007-verification.spec.ts",
        "tests/visual/g007-verification.mjs"
      ].map(read)
    );
    const combined = sources.join("\n");
    for (const forbidden of [
      "approved-reference.spec.ts",
      "architecture-attempt.mjs",
      "playwright.visual.config.ts"
    ]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(combined).not.toMatch(
      /process\.env\[['"]ARCHITECTURE_|process\.env\.ARCHITECTURE_\w+\s*=/
    );
  });

  it("pins the exact renderer and evidence inventory", async () => {
    const source = await read("tests/visual/g007-verification.spec.ts");
    expect(source).toContain('"canvas2d"');
    expect(source).not.toContain('"canvas-2d"');
    expect(source).toContain("desktop-male");
    expect(source).toContain("desktop-female");
    expect(source).toContain("mobile-female");
    expect(source).toContain("proofs");
    expect(source).toContain("mobileHanabi");
  });

  it("waits for selection artwork and rejects blank saved screenshot pixels", async () => {
    const source = await read("tests/visual/g007-verification.spec.ts");
    expect(source).toContain("waitForSelectionArtwork");
    expect(source).toContain("selectionArtwork");

    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");
    const artwork = {
      selectedCharacter: "female",
      figures: [
        {
          character: "male",
          source: "/assets/characters/player-male.png",
          complete: true,
          naturalWidth: 1024,
          naturalHeight: 1536,
          renderedWidth: 286.67,
          renderedHeight: 430,
          selected: false
        },
        {
          character: "female",
          source: "/assets/characters/player-female.png",
          complete: true,
          naturalWidth: 1024,
          naturalHeight: 1536,
          renderedWidth: 286.67,
          renderedHeight: 430,
          selected: true
        }
      ],
      pixelProof: {
        visibilityRestored: true,
        figures: [
          {
            character: "male",
            maximumChannelDelta: 224,
            changedPixelCount: 32_000
          },
          {
            character: "female",
            maximumChannelDelta: 231,
            changedPixelCount: 38_000
          }
        ]
      }
    };

    expect(() => runner.validateSelectionArtwork(artwork, "female", "fixture"))
      .not.toThrow();
    expect(() =>
      runner.validateSelectionArtwork({
        ...artwork,
        figures: [
          artwork.figures[0],
          {
            ...artwork.figures[1],
            naturalWidth: 0,
            naturalHeight: 0,
            renderedWidth: 0,
            renderedHeight: 0
          }
        ]
      }, "female", "fixture")
    ).toThrow(/female selection artwork readiness/);
    expect(() =>
      runner.validateSelectionArtwork({
        ...artwork,
        pixelProof: {
          ...artwork.pixelProof,
          figures: [
            artwork.pixelProof.figures[0],
            {
              ...artwork.pixelProof.figures[1],
              maximumChannelDelta: 0,
              changedPixelCount: 0
            }
          ]
        }
      }, "female", "fixture")
    ).toThrow(/female selection screenshot pixels/);
  });

  it("starts vinext dev with the supported hostname argument", async () => {
    const source = await read("tests/visual/g007-verification.mjs");
    const devSpawn = source.match(
      /dev\s*=\s*spawn\(\s*["']npm["']\s*,\s*\[([\s\S]*?)\]\s*,\s*\{/
    );
    expect(devSpawn).not.toBeNull();
    if (!devSpawn) throw new Error("vinext dev spawn arguments are missing");
    const literalArguments = [...devSpawn[1].matchAll(/["']([^"']+)["']/g)]
      .map((match) => match[1]);

    expect({
      hasHostname: literalArguments.includes("--hostname"),
      hasHost: literalArguments.includes("--host")
    }).toEqual({ hasHostname: true, hasHost: false });
  });

  it("uses the fetch-safe exported default G007 port", async () => {
    const source = await read("tests/visual/g007-verification.mjs");
    const defaultPortSelection = source.match(
      /const\s+port\s*=\s*process\.env\.G007_PORT\s*===\s*undefined\s*\?\s*([A-Z_][A-Z0-9_]*|\d+)\s*:\s*Number\(process\.env\.G007_PORT\)/
    );
    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");

    expect({
      exportedDefault: runner.DEFAULT_G007_PORT,
      selectedDefaultToken: defaultPortSelection?.[1] ?? null,
      selectsUnsafePort4190: defaultPortSelection?.[1] === "4190"
    }).toEqual({
      exportedDefault: 4191,
      selectedDefaultToken: "DEFAULT_G007_PORT",
      selectsUnsafePort4190: false
    });
  });

  it("lets the isolated Playwright config select the visual spec", async () => {
    const source = await read("tests/visual/g007-verification.mjs");
    const playwrightRun = source.match(
      /const\s+playwrightResult\s*=\s*await\s+runProcess\(\s*process\.execPath\s*,\s*\[([\s\S]*?)\]\s*,\s*\{/
    );
    expect(playwrightRun).not.toBeNull();
    if (!playwrightRun) throw new Error("Playwright invocation arguments are missing");
    const literalArguments = [...playwrightRun[1].matchAll(/["']([^"']+)["']/g)]
      .map((match) => match[1]);
    const grepIndex = literalArguments.indexOf("--grep");
    const grepPattern = grepIndex === -1 ? null : literalArguments[grepIndex + 1];

    expect({
      hasPositionalSpec: literalArguments.includes(
        "tests/visual/g007-verification.spec.ts"
      ),
      configCount: literalArguments.filter(
        (argument) => argument === "--config=playwright.g007.config.ts"
      ).length,
      grepCount: literalArguments.filter((argument) => argument === "--grep").length,
      grepPattern,
      grepHasLeadingCaret: grepPattern?.startsWith("^") ?? false
    }).toEqual({
      hasPositionalSpec: false,
      configCount: 1,
      grepCount: 1,
      grepPattern: "captures the current desktop and mobile visual contract$",
      grepHasLeadingCaret: false
    });
  });

  it("provides a temporary-fixture-only self-test", async () => {
    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");
    const result = await runner.runSelfTest();
    expect(result.status).toBe("PASS");
    expect(result.rendererTechnology).toBe("canvas2d");
    expect(result.assertions).toBe(40);
  });
});

type NegativeCase = {
  name: string;
  mutate: (fixture: RecoveryFixture) => Promise<void>;
};

const negativeCases: NegativeCase[] = [
  {
    name: "rejects a missing recovery bundle file",
    mutate: async ({ paths }) =>
      rm(path.join(paths.recoveryRoot, "source-provenance.json"))
  },
  {
    name: "rejects a pinned recovery bundle hash mismatch",
    mutate: async ({ paths }) =>
      writeFile(path.join(paths.recoveryRoot, "pre-review-inventory.excerpt.txt"), "tampered\n")
  },
  {
    name: "rejects an extra recovery bundle file",
    mutate: async ({ paths }) =>
      writeFile(path.join(paths.recoveryRoot, "extra.json"), "{}\n")
  },
  {
    name: "rejects an extra recovery bundle directory",
    mutate: async ({ paths }) =>
      mkdir(path.join(paths.recoveryRoot, "extra-directory"))
  },
  {
    name: "rejects a closed-schema type mismatch",
    mutate: async (fixture) => {
      fixture.documents["source-provenance.json"].sourceSession.records = "invalid";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a stale leaf-to-source hash",
    mutate: async (fixture) => {
      await writeFile(
        path.join(fixture.paths.recoveryRoot, "pre-review-inventory.excerpt.txt"),
        "changed-leaf\n"
      );
      await fixture.repinBundle();
    }
  },
  {
    name: "rejects a stale source-to-attestation hash",
    mutate: async (fixture) => {
      fixture.documents["source-provenance.json"].producer.generatedAt =
        "2026-07-23T10:01:00.000Z";
      await writeFile(
        path.join(fixture.paths.recoveryRoot, "source-provenance.json"),
        jsonBytes(fixture.documents["source-provenance.json"])
      );
      await fixture.repinBundle();
    }
  },
  {
    name: "rejects a stale prior-five verifier hash",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].screenshotComparisonEligible = false;
      await writeFile(
        path.join(fixture.paths.recoveryRoot, "recovery-attestation.json"),
        jsonBytes(fixture.documents["recovery-attestation.json"])
      );
      await fixture.repinBundle();
    }
  },
  {
    name: "rejects incident identity drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].incidentId = "other-incident";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects recovery status drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].status = "RECOVERED";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects recovery scope drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].scope = "G005_FULL_EVIDENCE";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a full-original-tree recovery claim",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].fullOriginalTreeRecovered = true;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects original observed count drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].originalObservedMinimumRegularFileCount = 33;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects recovered file count drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].recoveredRegularFileCount = 21;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects known loss path count drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].knownLossPathCount = 11;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects minimum unrecovered count drift",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].knownMinimumUnrecoveredCount = 11;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a missing recovered path",
    mutate: async ({ paths }) =>
      rm(path.join(paths.attemptRoot, recoveredJsonPaths[0]))
  },
  {
    name: "rejects an extra recovered file",
    mutate: async ({ paths }) =>
      writeFile(path.join(paths.attemptRoot, "extra.json"), "{}\n")
  },
  {
    name: "rejects an extra empty Attempt4 directory",
    mutate: async ({ paths }) =>
      mkdir(path.join(paths.attemptRoot, "empty-extra"))
  },
  {
    name: "rejects an Attempt4 symlink",
    mutate: async ({ paths }) =>
      symlink(
        path.join(paths.attemptRoot, recoveredJsonPaths[0]),
        path.join(paths.attemptRoot, "linked.json")
      )
  },
  {
    name: "rejects an expected file replaced by a directory",
    mutate: async ({ paths }) => {
      const target = path.join(paths.attemptRoot, recoveredJsonPaths[0]);
      await rm(target);
      await mkdir(target);
    }
  },
  {
    name: "rejects current recovered-file permission drift",
    mutate: async ({ paths }) =>
      chmod(path.join(paths.attemptRoot, recoveredJsonPaths[0]), 0o600)
  },
  {
    name: "rejects historical PNG mtime drift",
    mutate: async ({ paths }) => {
      const target = path.join(paths.attemptRoot, screenshotPaths[0]);
      const changed = new Date(1_800_000_000_000);
      await utimes(target, changed, changed);
    }
  },
  ...[0, 1, 2].map((index): NegativeCase => ({
    name: `rejects lock ${index + 2} drift`,
    mutate: async ({ paths }) =>
      writeFile(paths.lockPaths[index], jsonBytes({ tampered: index }))
  })),
  {
    name: "rejects creation of a known-loss path",
    mutate: async ({ paths }) =>
      writeFile(path.join(paths.attemptRoot, knownLossPaths[0]), "{}\n")
  },
  {
    name: "rejects provenance record hash drift",
    mutate: async ({ contract }) => {
      contract.provenance.records[0].recordLineSha256 = "0".repeat(64);
    }
  },
  {
    name: "rejects provenance decoded-output hash drift",
    mutate: async ({ contract }) => {
      contract.provenance.records[0].decodedOutputSha256 = "0".repeat(64);
    }
  },
  {
    name: "rejects a wrong provenance record type",
    mutate: async (fixture) => {
      const lines = (await readFile(fixture.paths.provenancePath, "utf8"))
        .trimEnd()
        .split("\n");
      const record = JSON.parse(lines[0]);
      record.payload.type = "function_call_output";
      lines[0] = JSON.stringify(record);
      await writeFile(fixture.paths.provenancePath, `${lines.join("\n")}\n`);
      fixture.contract.provenance.records[0].recordLineSha256 = sha256(lines[0]);
    }
  },
  {
    name: "rejects a duplicate provenance match",
    mutate: async ({ paths }) => {
      const source = await readFile(paths.provenancePath, "utf8");
      const first = source.split("\n")[0];
      await writeFile(paths.provenancePath, `${source}${first}\n`);
    }
  },
  {
    name: "rejects a provenance line-anchor mismatch",
    mutate: async ({ contract }) => {
      contract.provenance.records[0].line = 2;
    }
  },
  {
    name: "rejects a provenance timestamp mismatch",
    mutate: async ({ contract }) => {
      contract.provenance.records[0].timestamp = "2026-07-23T00:00:00.000Z";
    }
  },
  {
    name: "rejects equal producer and verifier agent identities",
    mutate: async (fixture) => {
      fixture.documents["independent-verification.json"].producer.agentIdentity =
        "g007-recovery-producer";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects equal producer and verifier session identities",
    mutate: async (fixture) => {
      fixture.documents["independent-verification.json"].producer.sessionIdentity =
        "producer-session";
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a non-independent verifier",
    mutate: async (fixture) => {
      fixture.documents["independent-verification.json"].procedurallyIndependent = false;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a verifier bound to another attestation",
    mutate: async (fixture) => {
      await fixture.flushAll();
      fixture.documents["independent-verification.json"].reviewedAttestationSha256 =
        "0".repeat(64);
      await writeFile(
        path.join(fixture.paths.recoveryRoot, "independent-verification.json"),
        jsonBytes(fixture.documents["independent-verification.json"])
      );
      await fixture.repinBundle();
    }
  },
  {
    name: "rejects an allowed claim outside pixel-only scope",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].allowedClaims.push(
        "G005_FULL_EVIDENCE"
      );
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a loss path that permits replacement",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].knownLosses[0]
        .replacementProhibited = false;
      await fixture.flushAll();
    }
  },
  {
    name: "rejects a reconstructed G005 terminal verdict claim",
    mutate: async (fixture) => {
      fixture.documents["recovery-attestation.json"].g005TerminalVerdictReconstructed = true;
      await fixture.flushAll();
    }
  }
];

describe("G007 recovered Attempt4 contract", () => {
  it("accepts the exact recovered subset and recovery bundle", async () => {
    const fixture = await buildRecoveryFixture();
    try {
      // @ts-expect-error The executable runner intentionally stays plain ESM.
      const runner = await import("./g007-verification.mjs");
      await expect(
        runner.validateRecoveryContract(fixture.paths, fixture.contract)
      ).resolves.toBeDefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("ignores JSON mtime because only PNG mtime is historical", async () => {
    const fixture = await buildRecoveryFixture();
    try {
      const target = path.join(fixture.paths.attemptRoot, recoveredJsonPaths[0]);
      const changed = new Date(1_800_000_000_000);
      await utimes(target, changed, changed);
      // @ts-expect-error The executable runner intentionally stays plain ESM.
      const runner = await import("./g007-verification.mjs");
      await expect(
        runner.validateRecoveryContract(fixture.paths, fixture.contract)
      ).resolves.toBeDefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps Attempt4 screenshots as 17 path-sorted compatibility rows", async () => {
    const fixture = await buildRecoveryFixture();
    try {
      // @ts-expect-error The executable runner intentionally stays plain ESM.
      const runner = await import("./g007-verification.mjs");
      const state = await runner.collectRecoveryState(fixture.paths);
      expect(state.attempt4.screenshots.map((row: { path: string }) => row.path))
        .toEqual([...screenshotPaths].sort());
    } finally {
      await fixture.cleanup();
    }
  });

  it.each(negativeCases)("$name", async ({ mutate }) => {
    const fixture = await buildRecoveryFixture();
    try {
      await mutate(fixture);
      // @ts-expect-error The executable runner intentionally stays plain ESM.
      const runner = await import("./g007-verification.mjs");
      let failure: unknown;
      try {
        const state = await runner.collectRecoveryState(fixture.paths);
        runner.validateRecoveryState(state, fixture.contract);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "E_PROTECTED_DRIFT" });
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("G007 post-Playwright recovery precedence", () => {
  it("propagates protected recovery drift before a nonzero Playwright exit", async () => {
    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");
    const protectedDrift = Object.assign(
      new Error("protected evidence drift after Playwright"),
      { code: "E_PROTECTED_DRIFT" }
    );

    await expect(
      runner.validatePostPlaywrightRecovery(
        { code: 1, signal: null },
        { aggregate: "recovery-before" },
        async () => {
          throw protectedDrift;
        }
      )
    ).rejects.toMatchObject({ code: "E_PROTECTED_DRIFT" });
  });

  it("reports Playwright failure when protected recovery remains stable", async () => {
    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");

    await expect(
      runner.validatePostPlaywrightRecovery(
        { code: 1, signal: null },
        { aggregate: "recovery-before" },
        async () => ({ aggregate: "recovery-before" })
      )
    ).rejects.toMatchObject({ code: "E_PLAYWRIGHT" });
  });
});

describe("G007 cold-start readiness", () => {
  it("allows one readiness connection to survive a 1.7 second cold compile", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((request, response) => {
      let completed = false;
      const timer = setTimeout(() => {
        completed = true;
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ready");
      }, 1_700);
      const cancelPendingCompile = () => {
        if (!completed) clearTimeout(timer);
      };
      request.once("aborted", cancelPendingCompile);
      response.once("close", cancelPendingCompile);
    });
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", onError);
        resolve();
      });
    });

    try {
      const address = server.address() as AddressInfo;
      // @ts-expect-error The executable runner intentionally stays plain ESM.
      const runner = await import("./g007-verification.mjs");
      const probeCount = await runner.waitForReady(
        `http://127.0.0.1:${address.port}`,
        { exitCode: null },
        2_500
      );
      expect(probeCount).toBeGreaterThanOrEqual(1);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 6_000);

  it("stops readiness immediately when the dev process has exited", async () => {
    // @ts-expect-error The executable runner intentionally stays plain ESM.
    const runner = await import("./g007-verification.mjs");

    await expect(
      runner.waitForReady("http://127.0.0.1:1", { exitCode: 7 }, 2_500)
    ).rejects.toMatchObject({ code: "E_DEV_EXIT" });
  });
});
