# project-xray

A tool to keep a human- and LLM-friendly summary of your node/nest project's structure on hand and auto-generated every time you save a file in Webstorm.

LLMs require detailed context to make good coding assistants, but large codebases flood LLMs with extraneous-- sometimes confusing-- details, and costs loads more tokens as it does. 

This script extracts several essential project details from the codebase-- file structures, modules, entry points, API calls, git history, etc-- into a compact `.bones.json` summary.

*🔒Security note: this tool does not make any external calls, and is not LLM-based. The details are extracted entirely through local file parsing and local git commands.*

## What it does

Consider your average codebase:

```
📁 project/
  📁 src/
    📁 modules/
    📁 services/
    📄 main.ts
  📁 test/
  📄 package.json
  ... (hundreds more files and folders)
```

This script will generate a concise summary:

```json
{
  "project": { "name": "my-app", "version": "1.0.0" },
  "structure": {
    "mainDirectories": "src/\n  modules/\n  services/\n",
    "entryPoints": [{ "type": "main", "path": "src/main.ts" }]
  },
  "architecture": {
    "modules": [{"name": "app.module.ts", "path": "src/modules/app.module.ts"}],
    "services": [{"name": "user.service.ts", "path": "src/services/user.service.ts"}]
  }
}
```
### Complete example
See a complete example from the project [FreeMoCap/Skellybot](https://github.com/freemocap/skellybot) in the included [skellybot.project.bones.json](./examples/skellybot.project.bones.json) (out of date, but comparing these two should help illustrate).

## Installation checklist:
> - [ ] drag and drop the file into your project
> - [ ] run it in the terminal to test it and inspect the output
> - [ ] set up the webstorm file watcher to auto-trigger the script on file saves
> - [ ] try including the generated file (`/.project.bones.json`) in llm assistant calls

## Installation

1. Copy the `project-xray.ts` file into your project (any location works)
2. Run it from your project root:

```bash
node path/to/project-xray.ts
```

3. Check the generated `.project.bones.json` in your project root

## WebStorm Auto-Update Setup

Set up WebStorm to automatically update the project bones whenever you save files:

1. Open Settings/Preferences

![WebStorm Settings Menu](./docs/img.png)

2. Go to Tools → File Watchers Click "+" and select "Custom"

![File Watcher Configuration](./docs/img_1.png)

3. Configure the watcher:
    - Name: "Project X-Ray"
    - File type: All Files
    - Program: `node`
    - Arguments: `$ProjectFileDir$/path/to/your/project-xray.ts`
    - Working directory: `$ProjectFileDir$`

![File Watcher List](./docs/img_2.png)


4. Click OK to save

**Tip:** Keep `.project.bones.json` open in your IDE to more easily include it when using AI assistant tools.

## Optimal Project Structure for Best Results

Project-Xray works best with:

1. **Git Repository**
    - Standard `.gitignore` setup

2. **Node.js Project Structure**
    - `package.json` with dependencies
    - Standard directory structure (preferably with a `src` directory)

3. **File Organization**
    - Conventional naming patterns:
        - `*.module.ts` for modules
        - `*.service.ts` for services
        - `*.controller.ts` for controllers
        - `*.command.ts` for commands
        - `*.dto.ts` for DTOs
        - `*.schema.ts` for schemas

4. **Environment Variables**
    - `.env` files (variables detected but values not exposed)

5. **Code Patterns**
    - HTTP requests (`axios`, `fetch`)
    - Database operations (especially MongoDB/Mongoose)
    - External API integrations (OpenAI, Discord, etc.)
    - Event handlers

Works particularly well with NestJS projects but should be compatible with any Node.js project.

## Details extracted
- **Project Structure**: Helps LLMs understand the organization of your codebase.
- **Entry Points**: Identifies the main files to focus on.
- **Modules/Services**: Provides a high-level overview of the codebase.
- **Git History**: Offers context on recent changes and contributions.
- **API Calls**: Highlights external dependencies and integrations.
- **Environment Variables**: Ensures sensitive information is not exposed.
- **File Patterns**: Helps LLMs recognize common coding patterns and structures.
- *Consider this a growing list! While the goal is to give a concise summary, these extracted crucial operational details are very small and worth far more than their weight in tokens.*


Basically, this helps keeps the ins-and-outs of the project "in mind" without having to jam stacks of files in. 
This is exceptionally useful for helping the model keep track of things it DOES NOT have in its context window presently. 

