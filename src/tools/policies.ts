import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPolicyTools(server: McpServer, db: D1Database) {
  // Save a policy/procedure/FAQ
  server.registerTool(
    "hr_save_entry",
    {
      title: "Save HR Entry",
      description:
        "Save an HR policy, procedure, FAQ, benefit detail, compliance note, or any HR knowledge to the HR brain. Use when someone wants to document HR information, add a policy, or record an HR decision.",
      inputSchema: {
        title: z.string().min(1).max(300).describe("A clear, concise title"),
        content: z.string().min(1).describe("The full content to save"),
        category: z
          .enum(["policy", "procedure", "faq", "benefit", "compliance", "announcement", "note"])
          .default("policy")
          .describe("Category for organization"),
        author: z.string().optional().describe("Who contributed this"),
        tags: z.array(z.string()).default([]).describe("Tags for easier searching"),
      },
    },
    async ({ title, content, category, author, tags }) => {
      const ts = new Date().toISOString();
      await db
        .prepare(
          "INSERT INTO entries (title, content, category, author, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
        )
        .bind(title, content, category, author || null, JSON.stringify(tags), ts, ts)
        .run();

      return {
        content: [
          {
            type: "text" as const,
            text: `Saved HR entry: "${title}" (${category}). Suggested next step: use hr_dashboard to see all HR entries, or hr_search_entries to find related policies.`,
          },
        ],
      };
    }
  );

  // Search HR entries
  server.registerTool(
    "hr_search_entries",
    {
      title: "Search HR Entries",
      description:
        "Search the HR brain for policies, procedures, FAQs, benefits info, or compliance notes. Use when someone asks about HR policies, company rules, benefits, or any HR-related question.",
      inputSchema: {
        query: z.string().optional().describe("Search title or content"),
        category: z
          .enum(["policy", "procedure", "faq", "benefit", "compliance", "announcement", "note"])
          .optional()
          .describe("Filter by category"),
      },
    },
    async ({ query, category }) => {
      let sql = "SELECT * FROM entries WHERE 1=1";
      const params: string[] = [];

      if (query) {
        sql += " AND (title LIKE ? OR content LIKE ?)";
        params.push(`%${query}%`, `%${query}%`);
      }
      if (category) {
        sql += " AND category = ?";
        params.push(category);
      }
      sql += " ORDER BY created_at DESC LIMIT 20";

      const stmt = db.prepare(sql);
      const results = params.length ? await stmt.bind(...params).all() : await stmt.all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results.results, null, 2),
          },
        ],
      };
    }
  );
}
