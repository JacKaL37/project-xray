const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * AI Project Overview Generator
 * Creates a structured overview of project information that helps AI assistants
 * understand your project without needing to see all files.
 */

// Get package information
function getPackageInfo() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      main: packageJson.main,
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
    };
  } catch (error) {
    console.error('Error reading package.json:', error);
    return null;
  }
}

// Get Git information
function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim();
    const remotes = execSync('git remote', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    const lastCommit = execSync(
      'git log -1 --pretty=format:"%h - %s (%an, %ar)"',
      { encoding: 'utf8' },
    ).trim();
    const lastCommits = execSync('git log -5 --pretty=format:"%h - %s (%ar)"', {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');

    return { branch, remotes, lastCommit, lastCommits };
  } catch (error) {
    console.error('Error getting git information:', error);
    return null;
  }
}

// Count files by extension
function countFilesByExtension(dir = '.', ignoredPatterns) {
  const extensions = {};

  function traverseDir(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative('.', fullPath).replace(/\\/g, '/');

      // Skip ignored paths
      if (isPathIgnored(relativePath, ignoredPatterns)) continue;

      if (entry.isDirectory()) {
        traverseDir(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) {
          extensions[ext] = (extensions[ext] || 0) + 1;
        }
      }
    }
  }

  traverseDir(dir);
  return extensions;
}

// Find main modules and services
function findModulesAndServices() {
  const modules = [];
  const services = [];

  // Common paths for NestJS applications
  const servicePaths = ['src', 'src/core', 'src/interfaces'];

  for (const basePath of servicePaths) {
    if (!fs.existsSync(basePath)) continue;

    function traverseForServices(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          traverseForServices(fullPath);
        } else if (entry.name.endsWith('.module.ts')) {
          modules.push({
            name: entry.name,
            path: path.relative('.', fullPath).replace(/\\/g, '/'),
          });
        } else if (entry.name.endsWith('.service.ts')) {
          services.push({
            name: entry.name,
            path: path.relative('.', fullPath).replace(/\\/g, '/'),
          });
        }
      }
    }

    traverseForServices(basePath);
  }

  return { modules, services };
}

// Get main entry points
// Find more comprehensive entry points
function findEntryPoints() {
  const entryPoints = [];

  // Check for conventional main entry files
  const possibleEntries = ['src/main.ts', 'index.ts', 'app.ts'];
  for (const entry of possibleEntries) {
    if (fs.existsSync(entry)) {
      entryPoints.push({
        type: 'main',
        path: entry,
      });
    }
  }

  // Find command entry points
  const commands = findCommands();
  if (commands.length > 0) {
    entryPoints.push({
      type: 'commands',
      paths: commands.map((cmd) => cmd.path),
    });
  }

  // Find controller entry points
  const controllers = findControllers();
  if (controllers.length > 0) {
    entryPoints.push({
      type: 'controllers',
      paths: controllers.map((ctrl) => ctrl.path),
    });
  }

  // Look for event handlers
  function findEventHandlers() {
    const handlers = [];

    function traverseForHandlers(dir = 'src') {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          traverseForHandlers(fullPath);
        } else if (
          entry.name.includes('.event.ts') ||
          entry.name.includes('.handler.ts') ||
          entry.name.includes('.listener.ts')
        ) {
          handlers.push({
            name: entry.name,
            path: path.relative('.', fullPath).replace(/\\/g, '/'),
          });
        } else if (entry.name.endsWith('.ts')) {
          // For files that might contain event handlers but don't follow naming conventions
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Look for decorators that indicate event handlers
            if (
              content.includes('@On(') ||
              content.includes('@Once(') ||
              content.includes('@OnEvent(') ||
              // Check for methods with "on" prefix that might be event handlers
              content.match(/\s+on[A-Z][a-zA-Z]+\s*\(/) ||
              // Check for Necord event handlers (from your Discord bot)
              content.includes('@ButtonComponent(') ||
              content.includes('@SlashCommand(') ||
              content.includes('@MessageCommand(')
            ) {
              handlers.push({
                name: entry.name,
                path: path.relative('.', fullPath).replace(/\\/g, '/'),
                type: 'decorator-based',
              });
            }
          } catch (err) {
            console.error(`Error reading file ${fullPath}:`, err);
          }
        }
      }
    }

    traverseForHandlers();
    return handlers;
  }

  const eventHandlers = findEventHandlers();
  if (eventHandlers.length > 0) {
    entryPoints.push({
      type: 'eventHandlers',
      paths: eventHandlers.map((h) => h.path),
    });
  }

  return entryPoints;
}

// Find exit points like API calls and external service integrations
function findExitPoints() {
  const exitPoints = {
    apiCalls: [],
    databaseOperations: [],
    externalServices: [],
    fileOperations: [],
  };

  function traverseForExitPoints(dir = 'src') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        traverseForExitPoints(fullPath);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const relativePath = path.relative('.', fullPath).replace(/\\/g, '/');

          // Check for HTTP/API calls
          if (
            content.includes('axios.') ||
            content.includes('fetch(') ||
            content.includes('http.request') ||
            content.match(/\.post\s*\(/) ||
            content.match(/\.get\s*\(/) ||
            content.match(/\.put\s*\(/) ||
            content.match(/\.delete\s*\(/)
          ) {
            exitPoints.apiCalls.push({
              file: entry.name,
              path: relativePath,
              type: 'HTTP client',
            });
          }

          // Check for OpenAI API calls
          if (content.includes('openai.') || content.includes('OpenAIApi')) {
            exitPoints.externalServices.push({
              file: entry.name,
              path: relativePath,
              service: 'OpenAI',
            });
          }

          // Check for Discord API calls
          if (
            content.includes('discord.js') ||
            content.includes('interaction.reply') ||
            content.includes('message.channel.send')
          ) {
            exitPoints.externalServices.push({
              file: entry.name,
              path: relativePath,
              service: 'Discord',
            });
          }

          // Check for database operations
          if (
            content.includes('mongoose') ||
            content.match(/\.find\s*\(/) ||
            content.match(/\.findOne\s*\(/) ||
            content.match(/\.save\s*\(/) ||
            content.match(/\.update\s*\(/) ||
            content.match(/\.delete\s*\(/)
          ) {
            exitPoints.databaseOperations.push({
              file: entry.name,
              path: relativePath,
              type: 'MongoDB',
            });
          }

          // Check for file system operations
          if (
            content.includes('fs.') ||
            content.includes('readFile') ||
            content.includes('writeFile')
          ) {
            exitPoints.fileOperations.push({
              file: entry.name,
              path: relativePath,
            });
          }
        } catch (err) {
          console.error(`Error reading file ${fullPath}:`, err);
        }
      }
    }
  }

  traverseForExitPoints();
  return exitPoints;
}

// Extract controller routes
function findControllers() {
  const controllers = [];

  function traverseForControllers(dir = 'src') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        traverseForControllers(fullPath);
      } else if (entry.name.endsWith('.controller.ts')) {
        controllers.push({
          name: entry.name,
          path: path.relative('.', fullPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  traverseForControllers();
  return controllers;
}

// Get project directory structure (simplified)
function getDirectoryStructure(maxDepth = 2) {
  function traverseDirectory(dir = '.', depth = 0) {
    if (depth > maxDepth) return '';

    let output = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const directories = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !['node_modules', 'dist', 'coverage', '.git'].includes(entry.name),
    );

    for (const directory of directories) {
      const fullPath = path.join(dir, directory.name);
      output += `${'  '.repeat(depth)}${directory.name}/\n`;
      output += traverseDirectory(fullPath, depth + 1);
    }

    return output;
  }

  return traverseDirectory();
}

// Extract environment variable names (not values)
function getEnvironmentVariables() {
  // Find all .env* files (except .env.local which might contain secrets)
  const envFiles = fs
    .readdirSync('.')
    .filter((file) => file.startsWith('.env') || file === '.env')
    .filter((file) => fs.statSync(file).isFile());

  const envVars = new Set();

  for (const file of envFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([A-Za-z0-9_]+)=/);
          if (match) {
            envVars.add(match[1]);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }

  return Array.from(envVars);
}

// Check if path matches any ignore pattern (reused from your file tree script)
function isPathIgnored(filePath, ignoredPatterns) {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of ignoredPatterns) {
    if (!pattern) continue;

    if (pattern.endsWith('/')) {
      if (
        normalizedPath === pattern.slice(0, -1) ||
        normalizedPath.startsWith(`${pattern}`)
      ) {
        return true;
      }
    } else if (pattern.startsWith('*')) {
      if (normalizedPath.endsWith(pattern.slice(1))) {
        return true;
      }
    } else if (pattern.endsWith('*')) {
      if (normalizedPath.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    } else if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      if (new RegExp(`^${regexPattern}$`).test(normalizedPath)) {
        return true;
      }
    } else {
      if (
        normalizedPath === pattern ||
        normalizedPath.startsWith(`${pattern}/`)
      ) {
        return true;
      }
    }
  }

  return false;
}

// Get git ignored patterns
function getGitIgnoredPatterns() {
  try {
    if (!fs.existsSync('.gitignore')) {
      return [];
    }
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    return gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    console.error('Error reading .gitignore:', error);
    return [];
  }
}

// Enhance the architecture section to include commands
function findCommands() {
  const commands = [];

  function traverseForCommands(dir = 'src') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        traverseForCommands(fullPath);
      } else if (entry.name.endsWith('.command.ts')) {
        commands.push({
          name: entry.name,
          path: path.relative('.', fullPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  traverseForCommands();
  return commands;
}

// Find DTOs
function findDtos() {
  const dtos = [];

  function traverseForDtos(dir = 'src') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        traverseForDtos(fullPath);
      } else if (entry.name.includes('.dto.ts')) {
        dtos.push({
          name: entry.name,
          path: path.relative('.', fullPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  traverseForDtos();
  return dtos;
}

// Find schemas
function findSchemas() {
  const schemas = [];

  function traverseForSchemas(dir = 'src') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        traverseForSchemas(fullPath);
      } else if (entry.name.includes('.schema.ts')) {
        schemas.push({
          name: entry.name,
          path: path.relative('.', fullPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  traverseForSchemas();
  return schemas;
}

// Add file to .gitignore
function addToGitIgnore(filename) {
  const gitignorePath = '.gitignore';

  try {
    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `${filename}\n`);
      console.log(`Created .gitignore and added ${filename}`);
      return;
    }

    // Read current .gitignore
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n');

    // Check if filename is already in .gitignore
    if (!lines.includes(filename)) {
      // Add to end of file with newline
      fs.appendFileSync(gitignorePath, `\n${filename}\n`);
      console.log(`Added ${filename} to .gitignore`);
    }
  } catch (error) {
    console.error(`Error updating .gitignore:`, error);
  }
}

// Main function to generate project overview
function generateProjectOverview() {
  const ignoredPatterns = getGitIgnoredPatterns();
  const packageInfo = getPackageInfo();
  const gitInfo = getGitInfo();
  const fileTypes = countFilesByExtension('.', ignoredPatterns);
  const { modules, services } = findModulesAndServices();
  const entryPoints = findEntryPoints();
  const controllers = findControllers();
  const directoryStructure = getDirectoryStructure(2);
  const envVars = getEnvironmentVariables();
  const commands = findCommands();
  const dtos = findDtos();
  const schemas = findSchemas();
  const exitPoints = findExitPoints();

  // Format file counts to show most common file types first
  const sortedFileTypes = Object.entries(fileTypes)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});

  // Build the project bones
  const bones = {
    project: {
      name: packageInfo?.name || path.basename(process.cwd()),
      version: packageInfo?.version || 'unknown',
      description: packageInfo?.description || 'No description available',
    },
    repository: gitInfo,
    structure: {
      mainDirectories: directoryStructure,
      entryPoints: findEntryPoints(),
      exitPoints: exitPoints,
      fileTypes: sortedFileTypes,
    },
    architecture: {
      modules: [...new Set(modules.map((m) => JSON.stringify(m)))]
        .map((m) => JSON.parse(m))
        .slice(0, 20),
      services: [...new Set(services.map((s) => JSON.stringify(s)))]
        .map((s) => JSON.parse(s))
        .slice(0, 20),
      controllers,
      commands,
      dtos,
      schemas,
    },
    dependencies: packageInfo?.dependencies || {},
    devDependencies: packageInfo?.devDependencies || {},
    configuration: {
      environmentVariables: envVars,
    },
  };

  return bones;
}

// Write overview to file and stdout
function main() {
  console.log('Generating AI Project Overview...');
  const overview = generateProjectOverview();

  // Write to file
  const outputPath = path.join('.project.bones.json');
  fs.writeFileSync(outputPath, JSON.stringify(overview, null, 2));
  addToGitIgnore(outputPath);

  console.log(`Project overview generated and saved to ${outputPath}`);
  console.log('\nSummary:');
  console.log('=======================================');
  console.log(`Project Name: ${overview.project.name}`);
  console.log(`Version: ${overview.project.version}`);
  console.log(`Description: ${overview.project.description}`);
  console.log(`Branch: ${overview.repository?.branch}`);
  console.log(
    `File Types: ${
      Object.keys(overview.structure.fileTypes).length
    } different extensions`,
  );
  console.log(`Modules: ${overview.architecture.modules.length} found`);
  console.log(`Services: ${overview.architecture.services.length} found`);
  console.log(`Controllers: ${overview.architecture.controllers.length} found`);
  console.log(`Dependencies: ${Object.keys(overview.dependencies).length}`);
  console.log(
    `Dev Dependencies: ${Object.keys(overview.devDependencies).length}`,
  );
  console.log(`Commands: ${overview.architecture.commands.length} found`);
  console.log(`DTOs: ${overview.architecture.dtos.length} found`);
  console.log(`Schemas: ${overview.architecture.schemas.length} found`);
  console.log(
    `API Calls: ${overview.structure.exitPoints.apiCalls.length} found`,
  );
  console.log(
    `Database Operations: ${overview.structure.exitPoints.databaseOperations.length} found`,
  );
  console.log(
    `External Services: ${overview.structure.exitPoints.externalServices.length} found`,
  );
  console.log(
    `File Operations: ${overview.structure.exitPoints.fileOperations.length} found`,
  );
}

main();
