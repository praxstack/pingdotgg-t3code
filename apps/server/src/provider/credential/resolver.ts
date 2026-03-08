import * as fs from "node:fs";
import * as path from "node:path";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

export type Credentials = {
  readonly method: "env" | "profile" | "chain" | "config";
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly sessionToken?: string | undefined;
};

/** Resolve AWS credentials using a 4-step chain. Returns null if none found. */
export async function resolve(stateDir: string): Promise<Credentials | null> {
  // Step 1: Explicit env vars
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (key && secret) {
    return {
      method: "env",
      accessKeyId: key,
      secretAccessKey: secret,
      region: process.env.AWS_REGION || "us-east-1",
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    };
  }

  // Step 2: AWS profile
  const profile = process.env.AWS_PROFILE;
  if (profile) {
    try {
      const chain = fromNodeProviderChain({ profile });
      const creds = await chain();
      if (creds.accessKeyId) {
        return {
          method: "profile",
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          region: process.env.AWS_REGION || "us-east-1",
          sessionToken: creds.sessionToken,
        };
      }
    } catch {
      // Profile not found or invalid, continue
    }
  }

  // Step 3: SDK default credential chain (IAM roles, EC2, ECS, web identity)
  try {
    const chain = fromNodeProviderChain();
    const creds = await chain();
    if (creds.accessKeyId) {
      return {
        method: "chain",
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        region: process.env.AWS_REGION || "us-east-1",
        sessionToken: creds.sessionToken,
      };
    }
  } catch {
    // Chain failed, continue
  }

  // Step 4: Config file
  const file = path.join(stateDir, "provider-config.json");
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    const bedrock = cfg.bedrock as Record<string, string> | undefined;
    if (bedrock?.accessKeyId && bedrock?.secretAccessKey) {
      return {
        method: "config",
        accessKeyId: bedrock.accessKeyId,
        secretAccessKey: bedrock.secretAccessKey,
        region: bedrock.region || "us-east-1",
        sessionToken: bedrock.sessionToken,
      };
    }
  } catch {
    // File missing or invalid JSON, continue
  }

  return null;
}
