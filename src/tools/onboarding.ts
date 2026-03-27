import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DEFAULT_ONBOARDING_TASKS = [
  { name: "Complete I-9 Form", description: "Employment eligibility verification" },
  { name: "Set up direct deposit", description: "Provide banking info for payroll" },
  { name: "Enroll in benefits", description: "Health, dental, vision, 401k enrollment" },
  { name: "Complete compliance training", description: "Required annual compliance modules" },
  { name: "Review employee handbook", description: "Read and acknowledge company policies" },
  { name: "Set up workstation & accounts", description: "Laptop, email, Slack, Jira access" },
  { name: "Meet with manager", description: "1:1 intro meeting with direct manager" },
  { name: "Meet the team", description: "Team intro and office/virtual tour" },
  { name: "Review PTO policy", description: "Understand time-off policies and procedures" },
  { name: "Emergency contact form", description: "Provide emergency contact information" },
];

export function registerOnboardingTools(server: McpServer, db: D1Database) {
  // Start onboarding for an employee
  server.registerTool(
    "hr_start_onboarding",
    {
      title: "Start Onboarding",
      description:
        "Create an onboarding checklist for a new employee. Call this when someone says 'start onboarding', 'set up a new hire', 'onboard this person', or when a new employee has been added. Requires the employee email.",
      inputSchema: {
        email: z.string().describe("Employee email to onboard"),
      },
    },
    async ({ email }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const ts = new Date().toISOString();

      // Check employee exists
      const employee = await db
        .prepare("SELECT * FROM employees WHERE email = ?")
        .bind(normalizedEmail)
        .first();

      if (!employee) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Employee ${normalizedEmail} not found. Use hr_add_employee first to register them.`,
            },
          ],
        };
      }

      // Create onboarding tasks
      const stmts = DEFAULT_ONBOARDING_TASKS.map((task) =>
        db
          .prepare(
            "INSERT INTO onboarding_tasks (employee_email, task_name, description, status, created_at) VALUES (?,?,?,?,?)"
          )
          .bind(normalizedEmail, task.name, task.description, "pending", ts)
      );

      // Update employee status
      stmts.push(
        db
          .prepare("UPDATE employees SET onboarding_status = 'in_progress', updated_at = ? WHERE email = ?")
          .bind(ts, normalizedEmail)
      );

      await db.batch(stmts);

      return {
        content: [
          {
            type: "text" as const,
            text: `Onboarding started for ${(employee as any).name || normalizedEmail} with ${DEFAULT_ONBOARDING_TASKS.length} tasks. Suggested next step: use hr_get_employee to see their full checklist, or hr_complete_task to mark items done.`,
          },
        ],
      };
    }
  );

  // Complete an onboarding task
  server.registerTool(
    "hr_complete_task",
    {
      title: "Complete Onboarding Task",
      description:
        "Mark an onboarding task as complete for an employee. Use when someone reports finishing an onboarding step.",
      inputSchema: {
        email: z.string().describe("Employee email"),
        task_name: z.string().describe("Name or partial name of the task to complete"),
      },
    },
    async ({ email, task_name }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const ts = new Date().toISOString();

      const result = await db
        .prepare(
          "UPDATE onboarding_tasks SET status = 'completed', completed_at = ? WHERE employee_email = ? AND task_name LIKE ? AND status = 'pending'"
        )
        .bind(ts, normalizedEmail, `%${task_name}%`)
        .run();

      if (!result.meta.changes || result.meta.changes === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pending task matching "${task_name}" found for ${normalizedEmail}.`,
            },
          ],
        };
      }

      // Check if all tasks are done
      const remaining = await db
        .prepare(
          "SELECT COUNT(*) as c FROM onboarding_tasks WHERE employee_email = ? AND status = 'pending'"
        )
        .bind(normalizedEmail)
        .first();

      const pendingCount = (remaining as any)?.c ?? 0;

      if (pendingCount === 0) {
        await db
          .prepare("UPDATE employees SET onboarding_status = 'completed', updated_at = ? WHERE email = ?")
          .bind(ts, normalizedEmail)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Task completed! All onboarding tasks are now done for ${normalizedEmail}. Onboarding marked as complete.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Task completed! ${pendingCount} onboarding tasks remaining for ${normalizedEmail}.`,
          },
        ],
      };
    }
  );
}
