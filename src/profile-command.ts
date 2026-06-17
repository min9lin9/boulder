import {
  ProfileNotFoundError,
  formatProfileResolve,
  listWorkflowProfiles,
  resolveWorkflowProfile,
  saveWorkflowProfile,
  useWorkflowProfile
} from "./workflow-profiles";
import { InvalidProfileNameError, InvalidProfileStatePathError } from "./profile-store";

export type ProfileCommandOptions = {
  readonly cwd: string;
  readonly json: boolean;
};

export async function runProfileCommand(args: readonly string[], options: ProfileCommandOptions): Promise<void> {
  const subcommand = subcommandAfter(args, "profile") ?? "show";
  if (subcommand === "resolve" || subcommand === "show") {
    await resolveCommand(args, options, subcommand);
    return;
  }
  if (subcommand === "use") {
    await useCommand(args, options);
    return;
  }
  if (subcommand === "list") {
    await listCommand(options);
    return;
  }
  if (subcommand === "save") {
    await saveCommand(args, options);
    return;
  }
  console.error(`Unknown profile command: ${subcommand}`);
  process.exitCode = 1;
}

async function resolveCommand(args: readonly string[], options: ProfileCommandOptions, subcommand: "resolve" | "show"): Promise<void> {
  try {
    const shownProfile = subcommand === "show" ? subcommandAfter(args, "show") : null;
    const resolution = await resolveWorkflowProfile(options.cwd, {
      profile: shownProfile ?? optionValue(args, "--profile") ?? undefined,
      task: optionValue(args, "--task") ?? undefined
    });
    if (options.json) {
      console.log(JSON.stringify(resolution.profile, null, 2));
      return;
    }
    console.log(formatProfileResolve(resolution.profile));
  } catch (error) {
    if (error instanceof InvalidProfileNameError || isNamedError(error, "InvalidProfileNameError")) {
      const message = error instanceof Error ? error.message : "Invalid profile name.";
      console.error(`ERROR profile.invalid_name: ${message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof ProfileNotFoundError) {
      console.error(`ERROR profile.not_found: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof InvalidProfileStatePathError || isNamedError(error, "InvalidProfileStatePathError")) {
      const message = error instanceof Error ? error.message : "Invalid profile state path.";
      console.error(`ERROR profile.path_invalid: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function listCommand(options: ProfileCommandOptions): Promise<void> {
  const profiles = await listWorkflowProfiles(options.cwd);
  if (options.json) {
    console.log(JSON.stringify(profiles, null, 2));
    return;
  }
  console.log([
    "Boulder workflow profiles",
    ...profiles.map((profile) => `- ${profile.id}: ${profile.purpose}`)
  ].join("\n"));
}

async function saveCommand(args: readonly string[], options: ProfileCommandOptions): Promise<void> {
  const name = subcommandAfter(args, "save");
  if (!name) {
    console.error("ERROR profile.required: Saved profile name is required.");
    process.exitCode = 1;
    return;
  }
  const sourceProfile = optionValue(args, "--profile");
  try {
    const path = await saveWorkflowProfile(options.cwd, name, sourceProfile);
    if (options.json) {
      console.log(JSON.stringify({ profile: sourceProfile ?? "active", savedAs: name, path }, null, 2));
      return;
    }
    console.log(`Boulder workflow profile saved: .boulder/profiles/${name}.json`);
  } catch (error) {
    if (error instanceof InvalidProfileNameError || isNamedError(error, "InvalidProfileNameError")) {
      const message = error instanceof Error ? error.message : "Invalid profile name.";
      console.error(`ERROR profile.invalid_name: ${message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof ProfileNotFoundError) {
      console.error(`ERROR profile.not_found: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof InvalidProfileStatePathError || isNamedError(error, "InvalidProfileStatePathError")) {
      const message = error instanceof Error ? error.message : "Invalid profile state path.";
      console.error(`ERROR profile.path_invalid: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function useCommand(args: readonly string[], options: ProfileCommandOptions): Promise<void> {
  const profileId = subcommandAfter(args, "use");
  if (!profileId) {
    console.error("ERROR profile.required: Profile id is required.");
    process.exitCode = 1;
    return;
  }
  try {
    const profile = await useWorkflowProfile(options.cwd, profileId);
    if (options.json) {
      console.log(JSON.stringify(profile, null, 2));
      return;
    }
    console.log(`Boulder active workflow profile: ${profile.id}`);
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      console.error(`ERROR profile.not_found: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    if (error instanceof InvalidProfileStatePathError || isNamedError(error, "InvalidProfileStatePathError")) {
      const message = error instanceof Error ? error.message : "Invalid profile state path.";
      console.error(`ERROR profile.path_invalid: ${message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function subcommandAfter(args: readonly string[], command: string): string | null {
  const index = args.findIndex((item) => item === command);
  const value = index >= 0 ? args[index + 1] : null;
  return value && !value.startsWith("-") ? value : null;
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
