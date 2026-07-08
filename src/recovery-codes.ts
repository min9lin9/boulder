export const RELEASE_RECOVERY_CODES = {
  malformedInput: "release.malformed_input",
  packageJsonVersionMismatch: "release.package_json_version_mismatch",
  versionMismatch: "release.version_mismatch",
  tagMismatch: "release.tag_mismatch",
  packVersionMismatch: "release.pack_version_mismatch"
} as const;

export type ReleaseRecoveryCode = typeof RELEASE_RECOVERY_CODES[keyof typeof RELEASE_RECOVERY_CODES];
