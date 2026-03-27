import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerDashboardTool } from "./tools/dashboard";
import { registerPolicyTools } from "./tools/policies";
import { registerEmployeeTools } from "./tools/employees";
import { registerOnboardingTools } from "./tools/onboarding";
import { registerJiraTools } from "./tools/jira";
import { registerConfluenceTools } from "./tools/confluence";
import { registerSalesforceTools } from "./tools/salesforce";
import { registerGitHubTools } from "./tools/github";

export interface Env {
  DB: D1Database;
  JIRA_BASE_URL: string;
  JIRA_EMAIL: string;
  JIRA_API_TOKEN: string;
  CONFLUENCE_API_TOKEN: string;
  SF_INSTANCE_URL: string;
  SF_CLIENT_ID: string;
  SF_CLIENT_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
}

// ---------------------------------------------------------------------------
// Dynamic instructions — builds context from D1 at request time
// ---------------------------------------------------------------------------

async function buildInstructions(db: D1Database): Promise<string> {
  let context = "";

  try {
    // Get employee stats
    const [employeeCount, pendingOnboarding, recentEntries] = await db.batch([
      db.prepare("SELECT COUNT(*) as c FROM employees"),
      db.prepare(
        "SELECT e.name, e.email FROM employees e WHERE e.onboarding_status = 'in_progress'"
      ),
      db.prepare(
        "SELECT title, category FROM entries ORDER BY created_at DESC LIMIT 5"
      ),
    ]);

    const totalEmployees = (employeeCount.results[0] as any)?.c ?? 0;
    const onboarding = pendingOnboarding.results.map(
      (r: any) => `${r.name || r.email}`
    );
    const recent = recentEntries.results.map(
      (r: any) => `${r.title} (${r.category})`
    );

    if (totalEmployees > 0) {
      context += `\n\nCurrent state: ${totalEmployees} employees tracked.`;
    }
    if (onboarding.length > 0) {
      context += ` Currently onboarding: ${onboarding.join(", ")}.`;
    }
    if (recent.length > 0) {
      context += `\nRecent HR entries: ${recent.join("; ")}.`;
    }
  } catch {
    // Tables might not exist yet — that's fine
  }

  return `You are connected to the HR Brain — an HR-focused MCP server for managing company policies, employee onboarding, benefits information, and HR operations.

This is separate from team-level tools (like sprint tracking or code repos). The HR Brain handles:
- Company policies and procedures
- Employee onboarding checklists and progress
- Benefits and compliance documentation
- HR FAQs and announcements

When someone connects for the first time, use hr_dashboard to orient them. If they mention being new or needing onboarding, use hr_add_employee followed by hr_start_onboarding.

Available tools are prefixed with hr_ to distinguish from other MCP servers.${context}`;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

async function createServer(env: Env): Promise<McpServer> {
  // Build dynamic instructions from current DB state
  const instructions = await buildInstructions(env.DB);

  const server = new McpServer({
    name: "hr-brain-mcp-server",
    version: "1.0.0",
    instructions,
  });

  // HR-specific tools
  registerDashboardTool(server, env.DB);
  registerPolicyTools(server, env.DB);
  registerEmployeeTools(server, env.DB);
  registerOnboardingTools(server, env.DB);

  // Jira integration (same instance, HR context via tool descriptions)
  if (env.JIRA_API_TOKEN) {
    registerJiraTools(server, {
      baseUrl: env.JIRA_BASE_URL || "https://discoveryacdc.atlassian.net",
      email: env.JIRA_EMAIL || "venkivenki8697@gmail.com",
      apiToken: env.JIRA_API_TOKEN,
    });
  }

  // Confluence integration (same instance, HR context)
  if (env.CONFLUENCE_API_TOKEN) {
    registerConfluenceTools(server, {
      baseUrl: env.JIRA_BASE_URL || "https://discoveryacdc.atlassian.net",
      email: env.JIRA_EMAIL || "venkivenki8697@gmail.com",
      apiToken: env.CONFLUENCE_API_TOKEN,
    });
  }

  // GitHub integration
  if (env.GITHUB_TOKEN) {
    registerGitHubTools(server, {
      token: env.GITHUB_TOKEN,
      defaultRepo: env.GITHUB_REPO || "gmarkay/team-brain-sfdc",
    });
  }

  // Salesforce integration
  if (env.SF_CLIENT_ID) {
    registerSalesforceTools(server, {
      instanceUrl: env.SF_INSTANCE_URL || "orgfarm-9f4a8cd667-dev-ed.develop.my.salesforce.com",
      clientId: env.SF_CLIENT_ID,
      clientSecret: env.SF_CLIENT_SECRET,
    });
  }

  return server;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-session-id, mcp-protocol-version",
};

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify({ status: "ok", service: "hr-brain-mcp" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // MCP endpoint
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    // Create MCP server & handle request (stateless)
    const server = await createServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        ...CORS_HEADERS,
      },
    });
  },
};
