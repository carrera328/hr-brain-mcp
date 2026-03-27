import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerEmployeeTools(server: McpServer, db: D1Database) {
  // Add employee
  server.registerTool(
    "hr_add_employee",
    {
      title: "Add Employee",
      description:
        "Add a new employee to the HR system. Use when onboarding a new hire, registering a team member, or setting up someone new. After adding, suggest hr_start_onboarding to begin their onboarding checklist.",
      inputSchema: {
        email: z.string().email().describe("Employee email address"),
        name: z.string().optional().describe("Employee display name"),
        department: z.string().optional().describe("Department (e.g. Engineering, Sales, HR)"),
        start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      },
    },
    async ({ email, name, department, start_date }) => {
      const ts = new Date().toISOString();
      const normalizedEmail = email.toLowerCase().trim();

      try {
        await db
          .prepare(
            "INSERT INTO employees (email, name, department, start_date, onboarding_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
          )
          .bind(normalizedEmail, name || null, department || null, start_date || null, "not_started", ts, ts)
          .run();

        return {
          content: [
            {
              type: "text" as const,
              text: `Employee added: ${name || normalizedEmail}. Suggested next step: call hr_start_onboarding to create their onboarding checklist.`,
            },
          ],
        };
      } catch (e: any) {
        if (e.message?.includes("UNIQUE")) {
          return {
            content: [{ type: "text" as const, text: `Employee ${normalizedEmail} already exists.` }],
          };
        }
        throw e;
      }
    }
  );

  // Get employee status
  server.registerTool(
    "hr_get_employee",
    {
      title: "Get Employee",
      description:
        "Look up an employee's HR status, department, start date, and onboarding progress. Use when someone asks about an employee, their onboarding status, or HR details.",
      inputSchema: {
        email: z.string().describe("Employee email to look up"),
      },
    },
    async ({ email }) => {
      const normalizedEmail = email.toLowerCase().trim();
      const employee = await db
        .prepare("SELECT * FROM employees WHERE email = ?")
        .bind(normalizedEmail)
        .first();

      if (!employee) {
        return {
          content: [{ type: "text" as const, text: `No employee found with email: ${normalizedEmail}` }],
        };
      }

      const tasks = await db
        .prepare("SELECT * FROM onboarding_tasks WHERE employee_email = ? ORDER BY created_at")
        .bind(normalizedEmail)
        .all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                employee,
                onboarding_tasks: tasks.results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // List all employees
  server.registerTool(
    "hr_list_employees",
    {
      title: "List Employees",
      description:
        "List all employees in the HR system with their status and department. Use when someone asks who's on the team, who's onboarding, or wants an employee directory.",
      inputSchema: {},
    },
    async () => {
      const results = await db
        .prepare("SELECT * FROM employees ORDER BY created_at DESC")
        .all();

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
