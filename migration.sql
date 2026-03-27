-- HR Brain — D1 Database Schema
-- Run: npx wrangler d1 execute hr-brain-db --remote --file=migration.sql

-- HR knowledge entries (policies, procedures, FAQs, onboarding steps)
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'policy',
  author TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Employees tracked by HR
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'employee',
  department TEXT,
  start_date TEXT,
  onboarding_status TEXT DEFAULT 'not_started',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Onboarding checklist items
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_email TEXT NOT NULL,
  task_name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
