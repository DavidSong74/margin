1. Project Initialization & Context Anchoring
Before running any prompts, establish the project environment so Claude Code has persistent context across CLI sessions.

Initialize the Repository:

Bash
mkdir journal-digitizer && cd journal-digitizer
git init
Create CLAUDE.md in the Root Directory:
Claude Code automatically reads CLAUDE.md at startup for codebase guidelines, stack rules, and architecture bounds. Create this file and add core constraints:

Markdown
# Project Constraints & Rules
- Tech Stack: React Native (Mobile), Supabase (BaaS/PostgreSQL), Python (Phase 0 validation), Deno (Edge Functions).
- Rule 1: Never expose Gemini API keys in mobile client code. All LLM calls must pass through backend Edge Functions.
- Rule 2: Strict PostgreSQL Row Level Security (RLS) using `auth.uid() = user_id`. No `USING (true)` policies.
- Rule 3: Do not build UI shells (Phases 3+) until Phase 0 validation and Phase 2 core loops are functional.
Save the Blueprint:
Save the entire Google Doc text as ARCHITECTURE.md in your root directory.

2. The Execution Loop: One Meta-Prompt at a Time
Do not feed the entire document to Claude Code at once. Instead, direct Claude Code to read specific sections of ARCHITECTURE.md using a branch-and-commit workflow.

Phase 0: Run the Local Validation Script
Execute Phase 0 in a isolated local folder to establish proof of concept before adding application overhead.

Prompt Claude Code:

"Read Phase 0 from ARCHITECTURE.md. Execute System Prompt Phase 0 to create transcribe.py and requirements.txt in a ./validation directory. Install the dependencies and wait for my instruction."

Human Validation (The Gate):
Run the script against your actual handwritten journal pages:

Bash
export GEMINI_API_KEY="your-key-here"
python3 validation/transcribe.py path/to/journal_page.jpg
Evaluate: Inspect the JSON output, review error rates, and decide if accuracy is acceptable.

Checkpoint:

Bash
git add . && git commit -m "feat(phase-0): validated core Gemini OCR capabilities"
Phase 1: Database & Security Architecture
Once Phase 0 passes, initialize Supabase and generate your schema.

Initialize Supabase:

Bash
supabase init
Prompt Claude Code:

"Read Phase 1 from ARCHITECTURE.md. Execute System Prompt Phase 1 to generate a Supabase SQL migration file in supabase/migrations/001_init_schema.sql. Ensure strict RLS policies, cascading deletes, and indexed foreign keys are implemented as specified."

Verify & Apply:
Ask Claude Code to inspect the output:

"Review 001_init_schema.sql for any permissive USING (true) RLS patterns. If clean, run supabase db reset or apply the migration via local CLI."

Checkpoint:

Bash
git add . && git commit -m "feat(phase-1): configured database schema and security policies"
Phase 2: Asynchronous Core Capture Loop
This is the heart of the MVP. Break Phase 2 into two sub-prompts.

Backend Pipeline (System Prompt 2B):

"Read Phase 2B from ARCHITECTURE.md. Write the PostgreSQL migration for pgmq, pg_cron, and pg_net, then create the Supabase Edge Function process-transcription using Deno. Ensure it dynamically pulls user glossary mappings and injects them into system instructions."

Frontend Camera UI (System Prompt 2A):

"Initialize a React Native app in ./mobile using Expo or React Native CLI. Read Phase 2A from ARCHITECTURE.md and implement the Vision Camera component and Supabase Storage upload handler."

End-to-End Test: Take a photo via the mobile client, confirm a job enters pgmq, verify the Edge Function triggers, and check that structured segments populate the segments table.

Checkpoint:

Bash
git add . && git commit -m "feat(phase-2): completed asynchronous capture-and-correct loop"
Phases 3 through 6: Shell, Polish, and Refinement
Iterate through the remaining meta-prompts sequentially using the same pattern:

Phase 3: Feed System Prompt Phase 3 for Navigation, Library, and Reader UI.

Phase 4: Feed System Prompt Phase 4 for PostgreSQL Full-Text Search RPC (search_journals).

Phase 5: Feed System Prompt Phase 5 to update the Edge Function with the Two-Pass diffing logic.

3. Best Practices for Working with Claude Code
Key Rule for Terminal Agents: Keep sessions focused. If a prompt generates errors, type /compact or restart the CLI session so Claude Code doesn't carry stale execution context into the next task.

Use Git Branches per Phase: Run git checkout -b phase-1-db before handing off a major prompt. If Claude Code makes structural mistakes, you can easily discard the branch.

Let Claude Code Run Tests: Whenever Claude writes code, add: "After writing the code, run the unit tests/type-checker to confirm there are no syntax or build errors."

Would you like to start by writing the CLAUDE.md and ARCHITECTURE.md setup files, or do you already have your Gemini API key ready to execute Phase 0 locally?