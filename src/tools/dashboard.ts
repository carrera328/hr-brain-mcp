import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDashboardTool(server: McpServer, db: D1Database) {
  server.registerTool(
    "hr_dashboard",
    {
      title: "HR Dashboard",
      description:
        "Get an overview of HR status: total policies, onboarding progress, recent activity. Call this when someone asks about HR status, what's in the HR brain, or wants an overview of HR operations.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const [totalEntries, categoryCounts, recentEntries, employeeStats, pendingOnboarding] =
        await db.batch([
          db.prepare("SELECT COUNT(*) as c FROM entries"),
          db.prepare(
            "SELECT category, COUNT(*) as c FROM entries GROUP BY category ORDER BY c DESC"
          ),
          db.prepare(
            "SELECT title, category, author, created_at FROM entries ORDER BY created_at DESC LIMIT 10"
          ),
          db.prepare(
            "SELECT onboarding_status, COUNT(*) as c FROM employees GROUP BY onboarding_status"
          ),
          db.prepare(
            "SELECT e.name, e.email, COUNT(t.id) as pending_tasks FROM employees e LEFT JOIN onboarding_tasks t ON e.email = t.employee_email AND t.status = 'pending' WHERE e.onboarding_status != 'completed' GROUP BY e.email"
          ),
        ]);

      const dashboard = {
        total_entries: (totalEntries.results[0] as any)?.c ?? 0,
        entries_by_category: Object.fromEntries(
          categoryCounts.results.map((r: any) => [r.category, r.c])
        ),
        recent_entries: recentEntries.results.map((r: any) => ({
          title: r.title,
          category: r.category,
          author: r.author,
          created: r.created_at,
        })),
        employee_onboarding: Object.fromEntries(
          employeeStats.results.map((r: any) => [r.onboarding_status, r.c])
        ),
        pending_onboarding: pendingOnboarding.results.map((r: any) => ({
          name: r.name,
          email: r.email,
          pending_tasks: r.pending_tasks,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(dashboard, null, 2),
          },
        ],
      };
    }
  );
}
