# ZAPPER MFT - AI Agents Module
## Professional Video Demo Script

---

## OPENING SEQUENCE (0:00 - 0:20)

[TONE: Forward-thinking, efficiency-focused, automation-oriented]

**NARRATOR:**

"File management at scale requires automation. Processing thousands of files, extracting data, converting formats, generating insights—manual work is impossible.

Zapper MFT's AI Agents module turns intelligent automation into reality. Agents can analyze, process, transform, and respond to files with minimal human intervention.

Let's explore how AI transforms your file operations."

---

## SECTION 1: UNDERSTANDING AI AGENTS (0:20 - 2:15)

[VISUAL: Show the AI Agents conceptual architecture]

**NARRATOR:**

"An AI Agent is a configuration that automatically processes files. When files are uploaded or when you trigger processing, the agent:

1. **Reads the file** — Downloads it from Zapper storage
2. **Analyzes the content** — Uses AI or custom logic to understand what's in it
3. **Performs actions** — Extracts data, generates insights, transforms format, classifies content
4. **Produces output** — Creates new files, updates metadata, generates reports
5. **Logs results** — Records what was done and results achieved

Agents are not AI in the science fiction sense. They're not autonomous entities making independent decisions. They're configured workflows: 'When a PDF is uploaded, extract text. When an image is uploaded, read text from it. When a document is uploaded, extract invoice data.'

Agents can use:

- **LLMs (Large Language Models)** — GPT-4, Claude, or other models for understanding and generating text
- **Specialized AI models** — For image recognition, OCR, document parsing
- **Traditional processing** — File conversion, metadata extraction, formatting
- **Custom code** — Your own business logic

The beauty of agents is that all this complexity is hidden behind a simple interface: upload a file, agent processes it, results appear."

[PAUSE - 2 seconds]

---

## SECTION 2: THE AI AGENTS DASHBOARD (2:15 - 4:00)

[VISUAL: Show the AI Agents page with list of configured agents]

**NARRATOR:**

"When you open AI Agents, you see a dashboard listing all your configured agents.

For each agent, you see:

- **Agent name** — What you call it: 'Invoice Extractor,' 'Resume Parser,' 'Image Categorizer'
- **Description** — What it does and why
- **Status** — Active or disabled
- **Input type** — What kind of files it processes: PDFs, images, documents, any type
- **Processing time** — Average time it takes to process a file
- **Success rate** — What percentage of files process successfully
- **Last used** — When was it last triggered
- **Run count** — How many files has it processed
- **Output format** — What kind of results it produces

At the top of the page, you see summary metrics:

- **Total agents** — How many agents are configured
- **Active agents** — How many are currently enabled
- **Files processed today** — How many files have been processed by any agent
- **Average processing time** — How long on average agents take to process
- **Error rate** — What percentage of processing attempts failed

This gives you visibility into your automation infrastructure."

[PAUSE - 2 seconds]

---

## SECTION 3: CREATING AN AI AGENT (4:00 - 6:15)

[VISUAL: Show the agent creation wizard]

**NARRATOR:**

"Creating an agent is a three-step process.

**Step 1: Define the agent.**

You enter:

- **Agent name** — Something descriptive
- **Description** — What it does and why
- **Input type** — What files it processes (PDF, image, document, all types)
- **Output type** — What it produces (text, JSON, CSV, new files, metadata)

**Step 2: Configure the processing logic.**

Here's where you tell the agent what to do. You have several options:

**Option A: Use a template.**

Zapper provides templates for common tasks:

'Invoice Extractor' — Extract invoice data from PDFs: vendor name, invoice number, amount, date, line items.

'Resume Parser' — Extract resume data: name, contact, skills, experience, education.

'Image Categorizer' — Analyze images and assign categories: product type, condition, defects.

'Document Classifier' — Read documents and classify by type: contract, invoice, purchase order, etc.

'Text Extractor' — Read scans and extract text (OCR).

'Language Detector' — Identify what language a document is in.

'Sentiment Analyzer' — Read documents and determine sentiment: positive, negative, neutral.

'Entity Extractor' — Identify key entities in documents: people, places, organizations, dates, amounts.

Select a template, and most configuration is done.

**Option B: Use an LLM.**

If you have an OpenAI API key, you can use GPT. Write a prompt describing what you want:

'Read this PDF. Extract the following: vendor name, invoice number, amount due, payment terms, date. Return as JSON.'

Or more complex:

'Read this resume. Identify: name, contact info, top 5 skills, years of experience. Assess: is this candidate a good match for a Senior Software Engineer role? Return assessment as JSON.'

The LLM handles the understanding and extraction. No custom code needed.

**Option C: Write custom code.**

For specialized logic, write your own processor. JavaScript or Python. Zapper provides the file contents. Your code processes and returns results.

Example:

```javascript
function processFile(fileContents) {
  const lines = fileContents.split('\\n');
  const data = {
    lineCount: lines.length,
    wordCount: fileContents.split(' ').length,
    averageLineLength: fileContents.length / lines.length
  };
  return data;
}
```

Your code has full control. Process however you need.

**Step 3: Test and deploy.**

Before enabling the agent, test it. Upload a sample file, run the agent, see the results. Does it work correctly? If yes, deploy. If no, refine the logic and test again.

Once deployed, the agent is ready to process files."

[PAUSE - 2 seconds]

---

## SECTION 4: TRIGGERING AGENTS (6:15 - 8:00)

[VISUAL: Show different ways to trigger agent processing]

**NARRATOR:**

"Agents can be triggered in several ways:

**Trigger 1: Manual trigger.**

Upload a file to Zapper. Right-click the file, select 'Process with Agent,' pick the agent. Processing starts immediately. Results appear when complete.

This is useful for one-off processing. You have a resume you want to parse. Run the Resume Parser agent. Get results.

**Trigger 2: Automatic on upload.**

Configure agents to run automatically whenever a file is uploaded. When any PDF is added, Invoice Extractor runs. When any image is added, Image Categorizer runs.

This is useful for high-volume processing. Every invoice that comes in is automatically processed. No manual trigger needed.

**Trigger 3: Scheduled trigger.**

Schedule agents to run on a schedule. Every night at 10 PM, process all files uploaded that day. Every Monday morning, generate a weekly report.

This is useful for batch processing and report generation.

**Trigger 4: API trigger.**

Call an API endpoint to trigger an agent. Your external system detects a new file, calls Zapper's API, agent runs.

This is useful for integrations with external systems.

**Trigger 5: Workflow trigger.**

Create a workflow: 'When a file with 'invoice' in the name is uploaded, run Invoice Extractor.'

This combines automatic and conditional logic. Smart routing based on file names, types, or metadata."

[PAUSE - 2 seconds]

---

## SECTION 5: MONITORING AGENT EXECUTION (8:00 - 9:30)

[VISUAL: Show agent processing status and results]

**NARRATOR:**

"When an agent processes a file, you monitor the execution:

**During processing:**

You see a progress indicator showing the agent is working. Depending on complexity, processing might take seconds to minutes.

The dashboard shows:

- File being processed
- Agent running
- Estimated time remaining
- Current step (if multi-step processing)

**After completion:**

Results appear in several places:

1. **In the file details** — If the agent extracted data, that data appears in the file's metadata section
2. **As a new file** — If the agent generated output (converted format, created a report), a new file appears
3. **In the activity log** — The agent's processing is logged with details of what was extracted or generated
4. **Via API** — The results are returned to any external system that triggered the agent

**Error handling:**

If processing fails, you see:

- Error message explaining what went wrong
- Suggestion for fixing the issue
- Option to retry processing

This might be 'File is corrupted, cannot extract data' or 'Image too small for OCR, minimum resolution is 300 DPI' or 'Invoice format not recognized.'

**Retries and fallbacks:**

You can configure:

- **Retry logic** — If processing fails, automatically retry up to 3 times
- **Fallback agents** — If the primary agent fails, try a different agent

This ensures processing is robust and resilient."

[PAUSE - 2 seconds]

---

## SECTION 6: AI AGENT TEMPLATES IN DEPTH (9:30 - 11:30)

[VISUAL: Walk through template examples and their outputs]

**NARRATOR:**

"Let me walk through three common agent templates to show what's possible:

**Template 1: Invoice Extractor.**

Input: A PDF or image of an invoice.

Processing:
- Reads the invoice document
- Identifies key fields
- Extracts values

Output: JSON data:
```json
{
  \"vendor\": \"Acme Corp\",
  \"invoiceNumber\": \"INV-2025-001234\",
  \"date\": \"2025-11-23\",
  \"dueDate\": \"2025-12-23\",
  \"amount\": 5000.00,
  \"currency\": \"USD\",
  \"lineItems\": [
    {\"description\": \"Software license\", \"quantity\": 1, \"unitPrice\": 3000, \"total\": 3000},
    {\"description\": \"Support\", \"quantity\": 1, \"unitPrice\": 2000, \"total\": 2000}
  ],
  \"tax\": 400.00,
  \"total\": 5400.00
}
```

This extracted data is then:
- Stored in the file's metadata
- Synced to your accounting system
- Used to auto-populate fields in expense tracking
- Validated against expected vendors and amounts

Result: Invoices are processed automatically instead of manually data-entry. 1000 invoices per month become zero manual work.

**Template 2: Resume Parser.**

Input: A resume document (PDF, Word, or text).

Processing:
- Parses resume structure
- Extracts sections
- Identifies skills, experience, education

Output: JSON data:
```json
{
  \"name\": \"Sarah Johnson\",
  \"email\": \"sarah@example.com\",
  \"phone\": \"+1-555-1234\",
  \"location\": \"San Francisco, CA\",
  \"summary\": \"Experienced software engineer...\",
  \"skills\": [\"Python\", \"JavaScript\", \"AWS\", \"Docker\"],
  \"yearsOfExperience\": 8,
  \"workHistory\": [
    {\"title\": \"Senior Engineer\", \"company\": \"TechCo\", \"duration\": \"2020-present\"},
    {\"title\": \"Engineer\", \"company\": \"StartupXYZ\", \"duration\": \"2018-2020\"}
  ],
  \"education\": [
    {\"degree\": \"BS Computer Science\", \"school\": \"State University\", \"year\": 2017}
  ]
}
```

This enables:
- Automated candidate screening
- Matching candidates to job requirements
- Building a searchable candidate database
- Matching to internal job openings

Result: Recruiting pipeline becomes automated. 500 resumes per month are parsed in minutes.

**Template 3: Document Classifier.**

Input: A document of any type (contract, invoice, report, memo).

Processing:
- Analyzes document content
- Identifies document type
- Extracts classification metadata

Output: JSON data:
```json
{
  \"documentType\": \"Employment Contract\",
  \"confidence\": 0.98,
  \"keyMetadata\": {
    \"parties\": [\"Acme Corp\", \"John Smith\"],
    \"effectiveDate\": \"2025-01-01\",
    \"term\": \"3 years\"
  },
  \"suggestedFolders\": [\"Legal\", \"HR\", \"Contracts\"],
  \"relatedDocuments\": [\"offer_letter_2025.pdf\"],
  \"riskFlags\": [\"Non-compete clause\", \"IP assignment\"]
}
```

This enables:
- Automatic file organization
- Risk identification in contracts
- Finding related documents
- Compliance checks

Result: Documents are automatically organized and flagged for review. Legal and HR teams spend less time searching."

[PAUSE - 2 seconds]

---

## SECTION 7: CUSTOM AI LOGIC (11:30 - 13:15)

[VISUAL: Show LLM prompt configuration and custom code examples]

**NARRATOR:**

"Beyond templates, you can configure custom AI logic.

**Using LLMs (like GPT-4):**

If you have an OpenAI API key integrated with Zapper, you can write custom prompts:

**Example 1: Sentiment analysis of customer feedback.**

Prompt:
'Read this customer feedback message. Determine the sentiment: positive, negative, or neutral. Extract the main complaint or compliment. Rate satisfaction on a scale of 1-10. Return as JSON.'

Input: 'The product quality is excellent, but the shipping took forever. Still overall happy though.'

Output:
```json
{
  \"sentiment\": \"positive\",
  \"mainFeedback\": \"Slow shipping\",
  \"satisfaction\": 7,
  \"topics\": [\"product quality\", \"delivery time\"]
}
```

**Example 2: Contract analysis.**

Prompt:
'Analyze this contract. Identify: parties involved, key obligations, payment terms, termination clauses, any unusual provisions. Flag anything that deviates from standard contract language. Return as JSON.'

Input: [Contract text]

Output:
```json
{
  \"parties\": [\"Company A\", \"Company B\"],
  \"obligations\": [...],
  \"paymentTerms\": \"Net 30\",
  \"terminationClause\": \"Either party with 90 days notice\",
  \"unusualProvisionsFlags\": [\"Non-compete clause extends 3 years beyond termination\", \"Liability cap is 10x payment\"]
}
```

**Using custom code:**

For specialized logic, write your own processor:

**Example: Extract tables from PDFs and convert to CSV.**

```javascript
function processFile(fileContents, fileMetadata) {
  // Parse PDF
  const pdf = parsePDF(fileContents);
  
  // Extract first table
  const table = pdf.extractTable(0);
  
  // Convert to CSV
  const csv = table.toCSV();
  
  return {
    success: true,
    outputFormat: 'csv',
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    csvData: csv
  };
}
```

Custom code has full access to file contents and can do anything you can code. Complex transformations, integrations, business logic—all possible."

[PAUSE - 2 seconds]

---

## SECTION 8: INTEGRATION WITH OTHER MODULES (13:15 - 14:45)

[VISUAL: Show how agents integrate with file management, organizations, and audit logs]

**NARRATOR:**

"AI Agents integrate with the rest of Zapper:

**Integration with File Management:**

When an agent processes a file, results appear in the file's details. You see:
- Extracted data
- Generated files
- Agent name and processing time
- Processing status and logs

From the file details, you can trigger agent processing directly.

**Integration with Organizations:**

Agents can be organization-scoped. Organization A's Invoice Extractor only processes invoices for Organization A. Organization B has its own configured Invoice Extractor with different templates.

This ensures agent configurations don't leak across organizational boundaries.

**Integration with Data Protection:**

When agents process files, Data Protection is enforced:
- Agents cannot process files the requesting user doesn't have permission to access
- Extracted data inherits the classification of the source file
- Audit logs record that an agent processed the file

This ensures agents respect security controls.

**Integration with Audit Logs:**

All agent processing is logged:
- File processed by which agent
- Processing time
- Success or failure
- Results generated

You have a complete audit trail of what was processed and what was produced.

**Integration with Lifecycle Management:**

Agents can be part of lifecycle policies. 'When a file reaches 30 days old, run Archiver Agent to compress it.' 'When a document is 5 years old, run Deletion Agent to prepare for archival.'

This combines automated processing with data lifecycle."

[PAUSE - 2 seconds]

---

## SECTION 9: REAL-WORLD AI AGENT SCENARIOS (14:45 - 16:30)

[VISUAL: Walk through scenario implementations]

**NARRATOR:**

"Let me walk through three real-world agent scenarios:

**Scenario 1: Financial services (Invoice processing).**

Challenge: Your company processes 2,000 invoices per month. Manual data entry is slow, expensive, and error-prone.

Solution: Deploy Invoice Extractor agent.

Setup:
- Configure Invoice Extractor with custom templates for your top 5 vendors
- Enable automatic trigger: when any PDF is uploaded to Finance folder, run agent
- Configure API integration: accounting system calls Zapper when new invoices arrive

Workflow:
1. Invoice arrives (email, uploaded, or API trigger)
2. Agent automatically processes it
3. Data extracted: vendor, amount, date, line items
4. Extracted data sent to accounting system
5. Expense entry auto-created
6. Finance team reviews and approves (spot-checking instead of manual entry)

Result:
- 100x faster processing
- 99% accuracy (vs. 95% with manual entry)
- 20 hours per month of staff time freed up
- 2,000 invoices/month becomes zero manual work

**Scenario 2: Recruiting (Resume screening).**

Challenge: You receive 500 resumes per month for open roles. Screening them manually takes 100+ hours.

Solution: Deploy Resume Parser + custom screening agent.

Setup:
- Resume Parser extracts candidate data
- Custom agent assesses fit for specific role: 'Does this candidate have required skills? Years of experience matching? Red flags?'
- Configure automatic trigger: when resume uploaded to Recruiting folder, run agents

Workflow:
1. Resume uploaded
2. Resume Parser extracts data
3. Custom agent assesses fit
4. Results stored in candidate profile
5. Candidates ranked by fit
6. Recruiters see top 20 candidates to interview

Result:
- 100 hours/month of screening work eliminated
- Better candidate ranking (no human bias)
- Faster time-to-hire
- 500 resumes processed automatically

**Scenario 3: Compliance (Document classification & risk detection).**

Challenge: Legal team receives hundreds of documents per month. Risk review is time-consuming and inconsistent.

Solution: Deploy Document Classifier agent with risk detection.

Setup:
- Classifier identifies document type and extracts key metadata
- Custom agent analyzes contracts for risk flags: non-compete, liability caps, unusual provisions
- Configure automatic trigger: when document uploaded to Legal folder, run agents

Workflow:
1. Document uploaded
2. Classifier identifies type and organizes to correct folder
3. Risk agent analyzes for issues
4. Results flagged for legal review
5. Legal team gets prioritized list of risky documents

Result:
- 80% of documents automatically organized (no filing time)
- Risk flags catch issues before execution (reduced legal exposure)
- Legal team focuses on truly complex contracts
- 200+ hours/month of work eliminated"

[PAUSE - 2 seconds]

---

## SECTION 10: BEST PRACTICES FOR AI AGENTS (16:30 - 18:00)

[VISUAL: Show a well-configured agent setup]

**NARRATOR:**

"Based on successful deployments, here are best practices for AI agents:

**Best Practice 1: Start with templates.**

Don't immediately write custom logic. Use templates first. They're battle-tested and cover 80% of common use cases. Custom logic is for exceptions.

**Best Practice 2: Test thoroughly before deploying.**

Process sample files with the agent before enabling automation. Verify accuracy and output format. One broken agent processing thousands of files is a disaster.

**Best Practice 3: Monitor success rates.**

Track: how many files process successfully? If success rate drops below 95%, investigate. Something has changed or broken.

**Best Practice 4: Implement error handling.**

Agents will fail. Some files are corrupted. Some are edge cases. Configure retry logic and fallbacks. When an agent can't process a file, fail gracefully with clear error messages.

**Best Practice 5: Use organization scoping.**

Even if agent logic is identical, scope agents to organizations. Prevents accidental cross-organization processing.

**Best Practice 6: Audit agent results.**

Randomly audit results. Does the invoice extraction match the actual invoice? Did the classifier correctly identify the document type? Catch errors before they propagate.

**Best Practice 7: Version agent configurations.**

When you update an agent's logic, save the old version. If the new version has worse results, you can roll back.

**Best Practice 8: Monitor costs.**

LLM-based agents incur API costs. Monitor usage. If an agent is processing more than expected, investigate. Budget for scaling.

**Best Practice 9: Use appropriate triggers.**

Not all files need agent processing. If you auto-process everything, you'll process files that don't need processing. Use conditional triggers: only process PDFs, only process files over 100 KB, only process if file name contains 'invoice.'

**Best Practice 10: Document agent purpose.**

In the agent description, clearly state what it does, what files it processes, and what output to expect. This helps users and future administrators understand the automation landscape."

[PAUSE - 2 seconds]

---

## SECTION 11: ADVANCED AGENT FEATURES (18:00 - 19:30)

[VISUAL: Show advanced agent capabilities]

**NARRATOR:**

"For sophisticated automation scenarios, Zapper supports advanced features:

**Chained agents:**

Run multiple agents in sequence. Upload a scanned invoice → OCR agent extracts text → Invoice Extractor extracts data → Validator agent checks accuracy. Each agent passes output to the next.

**Conditional processing:**

Route files to different agents based on conditions. If file is PDF, use one agent. If file is image, use different agent. If file size > 50MB, use high-performance agent.

**Parallel processing:**

Run multiple agents simultaneously on the same file. One extracts text, one extracts images, one analyzes sentiment. All run in parallel.

**Scheduled aggregation:**

Schedule agents to run on a schedule and aggregate results. Every Monday, process all invoices from the week. Generate a summary report.

**Real-time streaming:**

For large files, agents can process incrementally and stream results as they're generated. You don't wait for entire file processing to complete.

**Custom metrics:**

Track custom metrics on agent performance. 'How many invoices per hour?' 'What's the average invoice amount?' 'Which vendors appear most frequently?' Build dashboards.

**Agent performance tuning:**

Optimize agents based on metrics. If an agent is slow, use a faster model. If accuracy is low, adjust parameters. Continuous improvement.

**Audit trail for agents:**

Complete audit of what agents processed, when, and results. Reproducible runs for legal/compliance scenarios."

[PAUSE - 2 seconds]

---

## SECTION 12: SCALING AGENTS (19:30 - 20:45)

[VISUAL: Show agent scaling and performance metrics]

**NARRATOR:**

"AI Agents scale to handle massive workloads:

**Processing volume:**

Agents can process thousands of files per day. Even high-complexity agents that take 30 seconds per file can process 2,880 files per day.

**Concurrent processing:**

Multiple agents can run simultaneously. While one agent processes file A, another processes file B. Efficient resource utilization.

**Auto-scaling:**

As demand increases, Zapper automatically scales agent capacity. If you suddenly need to process 10,000 files, the system allocates more resources.

**Result caching:**

If the same file is processed by the same agent twice, Zapper caches the result. Second processing returns instantly.

**Cost optimization:**

For LLM-based agents, batch processing reduces cost. Instead of calling the API once per file, batch 10 files into one API call. Same results, lower cost.

**Performance monitoring:**

Dashboard shows agent performance metrics:
- Files processed per agent
- Average processing time
- Success rate
- Cost per file processed

Monitor these metrics. Optimize based on data."

[PAUSE - 2 seconds]

---

## SECTION 13: SECURITY & GOVERNANCE OF AGENTS (20:45 - 21:45)

[VISUAL: Show security controls for agents]

**NARRATOR:**

"AI Agents must be secure and governed:

**Permission controls:**

Only users with Agent Manager role can create or modify agents. Prevents rogue agents from being deployed.

**Audit logging:**

Every agent creation, modification, execution, and result is logged. Complete audit trail.

**Data isolation:**

Agents process files within the organization they're scoped to. Organization A's agent cannot process Organization B's files.

**Result validation:**

Agent results are treated as generated data, not user data. They inherit the classification and permissions of the source file.

**Cost controls:**

Set spending limits on LLM-based agents. If an agent exceeds the limit, it stops processing. Prevents runaway costs.

**Approval workflows:**

For sensitive operations, require approval before agent runs. 'Legal team must approve contract analysis before results are used.'

**Graceful failures:**

If an agent encounters an error, it logs the error and skips the file. It doesn't corrupt data or propagate errors.

**Compliance alignment:**

Agent configurations are aligned with compliance requirements. 'This agent processes HIPAA-protected data, so it must run in a HIPAA-compliant environment.'"

[PAUSE - 2 seconds]

---

## SECTION 14: LIMITS & CONSIDERATIONS (21:45 - 22:15)

[VISUAL: Show agent capability and limitation boundaries]

**NARRATOR:**

"Practical limits to understand:

**File size:**

Agents can process files up to 100 MB. Larger files require specialized processing.

**Processing time:**

Individual file processing timeout is 10 minutes. Longer processing times require splitting the file or using asynchronous processing.

**LLM costs:**

API costs vary by model and usage. Budget accordingly. GPT-4 is more capable but costs 10x more than GPT-3.5.

**Model capability:**

Models have blind spots. OCR fails on heavily scanned documents. LLMs hallucinate occasionally. Design with expected accuracy in mind.

**Concurrent limits:**

You can run dozens of agents in parallel, but not hundreds. System resources are finite.

**Real-time guarantees:**

Agent processing is best-effort. For mission-critical operations requiring guaranteed processing, use batch jobs instead.

In practice, agents work beautifully for most use cases. These limits are only encountered in edge cases."

[PAUSE - 2 seconds]

---

## CLOSING SEQUENCE (22:15 - 23:15)

[TONE: Visionary, efficiency-focused, forward-looking]

**NARRATOR:**

"Zapper's AI Agents module transforms manual work into automated intelligence.

Key takeaways:

- **Templates** cover common use cases without custom code
- **LLM integration** unlocks AI capabilities without building your own models
- **Custom code** handles specialized logic
- **Flexible triggering** enables manual, automatic, scheduled, or API-driven processing
- **Complete audit trail** tracks all agent activity
- **Security controls** ensure agents respect organizational boundaries
- **Scales to thousands of files daily** with consistent performance
- **Cost-optimized** with caching and batch processing

Whether you're automating invoice processing, resume screening, document classification, or custom business logic, AI Agents provide the infrastructure.

**The future of work is human intelligence + AI automation.** Humans focus on decisions and strategy. AI handles repetitive processing. Zapper makes that partnership efficient and auditable.

We've now explored all nine modules of Zapper MFT:

1. File Management — Core file operations
2. User Management — Access and identity
3. Partner Organizations — Multi-tenant structure
4. Storage Accounts — Cloud infrastructure
5. Data Lifecycle Management — Data retention and disposal
6. Data Protection — Security and compliance
7. Roles & Permissions — Access control
8. Audit Logs — Accountability and investigations
9. AI Agents — Intelligent automation

Together, these modules form a complete enterprise file management platform. Secure, scalable, auditable, and intelligent.

Zapper MFT: Enterprise file management evolved."

[END SCENE]

---

## PRODUCTION NOTES FOR VIDEO CREATORS

### Pacing & Timing
- Total runtime: approximately **23 minutes 15 seconds**
- This module is future-focused and technical—balance innovation with clarity
- Show actual agent processing in action, not just configuration screens
- Demonstrate both template-based and custom agents
- Use real examples of extracted data and outputs

### Visual Cues
- **Agent dashboard** with list of configured agents
- **Creation wizard** showing three steps
- **Processing visualization** showing file → agent → results pipeline
- **Template examples** with sample input/output
- **LLM prompt** configuration
- **Custom code** editor
- **Results display** showing extracted data and generated files
- **Real-world scenario walkthroughs** with before/after metrics
- **Scaling metrics** showing processing volume and performance

### Tone Guidance
- Visionary and efficiency-focused—agents represent the future
- Emphasize "automation," "intelligence," and "scale"
- Use phrases like "eliminates manual work," "intelligent processing," "automated workflow"
- Position agents as augmenting human work, not replacing it
- Make it tangible—show real examples and outputs

### Key Talking Points to Emphasize
1. **Templates make it easy** — No coding required for common use cases
2. **LLM integration** — Leverage AI without building models
3. **Custom logic** — Code your own for specialized needs
4. **Flexible triggering** — Manual, automatic, scheduled, or API-driven
5. **Complete audit trail** — All processing is logged and auditable
6. **Scales massively** — Thousands of files per day
7. **Security integrated** — Respects organizational boundaries and permissions

### Demonstration Sequence (Recommended Order)
1. Show the AI Agents dashboard with configured agents
2. Demonstrate the agent creation wizard
3. Show selecting a template and configuring it
4. Show writing an LLM prompt
5. Show uploading a file and manually triggering agent
6. Show agent processing in real-time
7. Show results appearing in file metadata
8. Show configuring automatic triggering
9. Show a real-world scenario end-to-end (invoice upload → processing → data extraction → accounting system integration)
10. Show monitoring agent performance and success rates
11. Show audit logs recording agent activity
12. Show advanced features like chained agents

### Visual Metaphors Suggested
- **Assembly line** for chained agents
- **Robot or automation icon** for agents
- **Input/output pipeline** showing data flow
- **Lightning bolt** for intelligence and speed
- **Brain waves** for AI/LLM processing
- **Factory floor** for scaling and concurrent processing
- **Checkmark** for successful processing, X for failures
- **Clock** for scheduled processing

### Call-to-Action (Optional Ending)
Consider ending with: "AI Agents is where Zapper goes beyond storage and access control into intelligent automation. Transform your manual file operations into automated workflows that scale. Zapper MFT: Enterprise file management powered by intelligence and automation."

---

**END OF AI AGENTS DEMO SCRIPT**
