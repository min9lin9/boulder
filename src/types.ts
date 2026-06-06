export type VerificationCommand = {
  name: string;
  command: string;
  required?: boolean;
};

export type WorkflowStackComponent = {
  name: string;
  role: string;
  required: boolean;
  description: string;
};

export type BoulderManifest = {
  name: string;
  description: string;
  maintainers: string[];
  workflowStack: WorkflowStackComponent[];
  workflows: string[];
  protectedPaths: string[];
  verification: VerificationCommand[];
  providers: {
    default: string;
    externalAllowed: boolean;
    approvalRequired: boolean;
  };
  export: {
    markdown: boolean;
    codexNotes: boolean;
  };
};

export type RepoInspection = {
  root: string;
  name: string;
  detected: {
    readme: boolean;
    packageJson: boolean;
    pyproject: boolean;
    tests: string[];
    docs: string[];
    ci: string[];
  };
  likelyVerification: VerificationCommand[];
  protectedPaths: string[];
  recommendedWorkflows: string[];
  risks: string[];
};

export type VerifyResult = {
  name: string;
  command: string;
  required: boolean;
  status: "planned" | "passed" | "failed" | "skipped";
  output?: string;
};
