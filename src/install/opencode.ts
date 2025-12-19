import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { getSkillVersionShort, loadSkill } from "./skill.js";

const TOOL_PATH = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "tool",
  "mgrep.ts",
);
const MCP_PATH = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "opencode.json",
);

const MAX_QUERY_SIZE = 10 * 1024; // 10KB max query size

function escapeForTemplate(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function generateToolDefinition(): string {
  const skill = loadSkill();
  const escapedSkill = escapeForTemplate(skill);

  return `import { tool } from "@opencode-ai/plugin"

const SKILL = \`${escapedSkill}\`;

export default tool({
  description: SKILL,
  args: {
    q: tool.schema.string().describe("The semantic search query. Must be a natural language description of what you're looking for."),
    m: tool.schema.number().default(10).describe("Maximum number of results to return (1-50)."),
    a: tool.schema.boolean().default(false).describe("Generate an AI answer based on the search results. Useful for questions."),
    w: tool.schema.boolean().default(false).describe("Include web search results from Tavily."),
    c: tool.schema.boolean().default(false).describe("Include the actual content of matching chunks."),
    noRerank: tool.schema.boolean().default(false).describe("Disable reranking for faster but less accurate results."),
    path: tool.schema.string().optional().describe("Optional path to scope the search to a specific directory."),
  },
  async execute(args) {
    // Input validation
    if (!args.q || typeof args.q !== "string") {
      return "[ERROR] Query parameter 'q' is required and must be a non-empty string.";
    }

    const query = args.q.trim();
    if (query.length === 0) {
      return "[ERROR] Query cannot be empty or whitespace only.";
    }

    if (query.length > ${MAX_QUERY_SIZE}) {
      return "[ERROR] Query exceeds maximum size of ${MAX_QUERY_SIZE / 1024}KB.";
    }

    // Sanitize: remove control characters except newlines and tabs
    const sanitizedQuery = query.replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g, "");

    // Build command arguments explicitly to avoid shell injection
    const cmdArgs: string[] = ["search"];

    // Add flags
    if (args.m && typeof args.m === "number" && args.m > 0 && args.m <= 50) {
      cmdArgs.push("-m", String(Math.floor(args.m)));
    }
    if (args.a) cmdArgs.push("-a");
    if (args.w) cmdArgs.push("--web");
    if (args.c) cmdArgs.push("--content");
    if (args.noRerank) cmdArgs.push("--no-rerank");

    // Use "--" to prevent query from being interpreted as flags
    cmdArgs.push("--", sanitizedQuery);

    // Add path scope if provided
    if (args.path && typeof args.path === "string") {
      const sanitizedPath = args.path.trim().replace(/[\\x00-\\x1F\\x7F]/g, "");
      if (sanitizedPath.length > 0) {
        cmdArgs.push(sanitizedPath);
      }
    }

    try {
      const proc = Bun.spawn(["mgrep", ...cmdArgs], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const errorOutput = stderr.trim() || stdout.trim() || "Unknown error";
        return \`[ERROR] mgrep exited with code \${exitCode}: \${errorOutput}\`;
      }

      return stdout.trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return \`[ERROR] Failed to execute mgrep: \${message}\`;
    }
  },
})`;
}

async function installPlugin() {
  try {
    fs.mkdirSync(path.dirname(TOOL_PATH), { recursive: true });

    const toolDefinition = generateToolDefinition();
    const skillVersion = getSkillVersionShort();

    // Always write the tool to ensure it's up-to-date
    fs.writeFileSync(TOOL_PATH, toolDefinition);
    console.log(
      `Successfully installed mgrep tool (skill version: ${skillVersion})`,
    );

    fs.mkdirSync(path.dirname(MCP_PATH), { recursive: true });

    if (!fs.existsSync(MCP_PATH)) {
      fs.writeFileSync(MCP_PATH, JSON.stringify({}, null, 2));
    }
    const mcpContent = fs.readFileSync(MCP_PATH, "utf-8");
    const mcpJson = JSON.parse(mcpContent);
    if (!mcpJson.$schema) {
      mcpJson.$schema = "https://opencode.ai/config.json";
    }
    if (!mcpJson.mcp) {
      mcpJson.mcp = {};
    }
    mcpJson.mcp.mgrep = {
      type: "local",
      command: ["mgrep", "mcp"],
      enabled: true,
    };
    fs.writeFileSync(MCP_PATH, JSON.stringify(mcpJson, null, 2));
    console.log("Successfully configured mgrep MCP server in OpenCode");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error installing tool: ${errorMessage}`);
    console.error((error as Error)?.stack);
    process.exit(1);
  }
}

async function uninstallPlugin() {
  try {
    if (fs.existsSync(TOOL_PATH)) {
      fs.unlinkSync(TOOL_PATH);
      console.log(
        "Successfully removed the mgrep tool from the OpenCode agent",
      );
    } else {
      console.log("The mgrep tool is not installed in the OpenCode agent");
    }

    if (fs.existsSync(MCP_PATH)) {
      const mcpContent = fs.readFileSync(MCP_PATH, "utf-8");
      const mcpJson = JSON.parse(mcpContent);
      delete mcpJson.mcp.mgrep;
      fs.writeFileSync(MCP_PATH, JSON.stringify(mcpJson, null, 2));
      console.log("Successfully removed the mgrep from the OpenCode agent");
    } else {
      console.log("The mgrep is not installed in the OpenCode agent");
    }
  } catch (error) {
    console.error(`Error uninstalling plugin: ${error}`);
    process.exit(1);
  }
}

export const installOpencode = new Command("install-opencode")
  .description("Install the mgrep tool in the OpenCode agent")
  .action(async () => {
    await installPlugin();
  });

export const uninstallOpencode = new Command("uninstall-opencode")
  .description("Uninstall the mgrep tool from the OpenCode agent")
  .action(async () => {
    await uninstallPlugin();
  });
