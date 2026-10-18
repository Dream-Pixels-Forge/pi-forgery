# forgery_exec Programming Patterns

Common patterns and recipes for writing effective forgery_exec programs.

## Basic Patterns

### Sequential Execution
```typescript
// Read a file, then process its contents
const content = await pi.read("config.json");
const parsed = JSON.parse(content);
// ... do something with parsed
```

### Parallel Execution
```typescript
// Load multiple configuration files in parallel
const [config, schema, docs] = await Promise.all([
  pi.read("config.json"),
  pi.read("schema.json"),
  pi.read("README.md")
]);
```

### Agent Spawning
```typescript
// Spawn an agent to research a topic
const research = await agents.run({
  task: "Research the latest React 19 features and best practices",
  model: "gpt-researcher",
  timeoutMs: 120000
});

// Use the research results
console.log(research.text);
```

### Error Handling
```typescript
try {
  const data = await pi.read("missing-file.txt");
  // Process data
} catch (error) {
  // Handle missing file gracefully
  console.warn("Using default configuration");
  const data = await pi.read("default-config.txt");
}
```

### Conditional Execution
```typescript
// Check if a file exists before operating on it
let configExists = false;
try {
  await pi.read("config.json");
  configExists = true;
} catch {
  // File doesn't exist
}

if (configExists) {
  const config = await pi.read("config.json");
  // Use existing config
} else {
  // Create default config
  await pi.write("config.json", JSON.stringify({ version: "1.0" }));
}
```

## Advanced Patterns

### Pipeline Processing
```typescript
// Process data through multiple stages
let data = await pi.read("input.csv");

// Stage 1: Parse CSV
data = await pi.exec({
  command: "python",
  args: ["-c", "import sys, csv; print(csv.DictReader(sys.stdin))"]
});

// Stage 2: Filter and transform
const filtered = await agents.run({
  task: "Filter records where status is 'active' and add computed fields"
});

// Stage 3: Output results
await pi.write("output.json", JSON.stringify(filtered.value));
```

### Batch Processing
```typescript
// Process multiple files with the same operation
const files = ["file1.txt", "file2.txt", "file3.txt"];
const results = [];

for (const file of files) {
  try {
    const content = await pi.read(file);
    const processed = await agents.run({
      task: `Summarize the content of ${file} in 2 sentences`
    });
    results.push({ file, summary: processed.value.text });
  } catch (error) {
    results.push({ file, error: error.message });
  }
}

// Save batch results
await pi.write("batch-results.json", JSON.stringify(results));
```

### Retry Logic
```typescript
async function retryOperation(operation, maxAttempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError;
}

// Usage
const result = await retryOperation(() => 
  pi.read("unstable-api-endpoint.txt")
);
```

### Progress Reporting
```typescript
// Long-running operation with progress updates
for (let i = 0; i < 100; i++) {
  // Update progress in activity store
  // (This would be done through the activity store API in a real implementation)
  
  // Do work
  await pi.bash(`echo "Processing item ${i}"`);
  
  // Report progress every 10%
  if (i % 10 === 0) {
    await agents.run({
      task: `Log progress: ${i}% complete`
    });
  }
}
```

## Common Recipes

### File Processing Pipeline
1. Read source file
2. Validate format with schema
3. Transform data
4. Write output file
5. Notify completion

### Research and Summary
1. Spawn research agent to gather information
2. Wait for research completion
3. Spawn summary agent to condense findings
4. Present results to user

### Code Analysis
1. Read source files
2. Run linting/formatting tools
3. Run tests
4. Generate report
5. Suggest improvements

## Best Practices

### 1. Keep Programs Focused
- Each forgery_exec program should have a single clear purpose
- Break complex workflows into multiple programs when needed

### 2. Handle Errors Gracefully
- Always wrap file operations in try/catch
- Provide meaningful fallback values
- Log errors for debugging

### 3. Use Parallelism Wisely
- Use Promise.all for independent operations
- Be mindful of rate limits and resource constraints
- Consider batching for large numbers of similar operations

### 4. Validate Inputs
- Check that required files exist before processing
- Validate configuration and parameters
- Use schema validation where available

### 5. Clean Up Resources
- Close file handles when done
- Terminate agents that are no longer needed
- Remove temporary files

## Anti-Patterns to Avoid

### Don't Block the Event Loop
```typescript
// AVOID: Synchronous loops that block
for (let i = 0; i < 1000000; i++) {
  // This will block the entire extension
}

// INSTEAD: Break up work or use async operations
for (let i = 0; i < 100; i++) {
  await pi.bash(`echo "Processing batch ${i}"`);
  // Yield control back to the event loop
}
```

### Don't Ignore Errors
```typescript
// AVOID: Silent failure
const data = await pi.read("maybe-missing.txt");
// What if the file doesn't exist?

// INSTEAD: Handle the error case
let data;
try {
  data = await pi.read("maybe-missing.txt");
} catch {
  data = await pi.read("default.txt");
}
```

### Don't Hardcode Values
```typescript
// AVOID: Magic numbers and hardcoded paths
const result = await pi.read("/home/user/project/config.json");

// INSTEAD: Use relative paths and configurable values
const configPath = "config.json"; // Relative to cwd
const result = await pi.read(configPath);
```

## Debugging Tips

### Enable Verbose Logging
Check the activity widget and dashboard for detailed execution information.

### Test in Isolation
Break complex programs into smaller, testable pieces.

### Use the Status Commands
- `/forgery status` - See current state
- `/forgery agents` - Check agent activity
- `/forgery log <id>` - Examine specific agent output

## Examples

See the test files in `tests/` for working examples of:
- Basic tool usage
- Parallel execution patterns
- Error handling
- Agent spawning and monitoring
- Configuration loading