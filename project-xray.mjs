import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Interface for project analysis results
 */
// class ProjectAnalysis {
//   project: {
//     name: string;
//     version: string;
//     description: string;
//   };
//   repository: {
//     branch: string;
//     remotes: string[];
//     lastCommit: string;
//     lastCommits: string[];
//     devDependencies: {};
//     dependencies: {};
//     configuration: {
//       environmentVariables: string[];
//     };
//   };
//   meta: {
//     schemaVersion: string;
//     generatedAt: string;
//     generationTimeMs: number;
//     overviewSizeChars: number;
//     approximateTokenUsage: number;
//   };
//   files: string[];
//   fileTree: string;
//   entryPoints: {
//     controllers: string[];
//     commands: string[];
//     eventHandlers: string[];
//     apis: string[];
//   };
//   exitPoints: {
//     apiCalls: string[];
//     databaseOperations: string[];
//     externalServices: string[];
//     fileOperations: string[];
//   };
//   types: {
//     interfaces: string[];
//     typeDefinitions: string[];
//     dtos: string[];
//   };
//   stats: {
//     totalLines: number;
//     linesPerFileType: Record<string, number>;
//     largestFiles: Array<{ path: string; lines: number }>;
//   };
//   moduleImports?: Record<string, string[]>;
//   serviceUsage?: Record<string, any[]>;
//   mermaidServiceDiagram?: string;
// }

/**
 * Parse .gitignore file and get patterns to exclude
 * @returns Array of gitignore patterns
 */
function getGitignorePatterns() {
  try {
    if (fs.existsSync('.gitignore')) {
      const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
      return gitignoreContent
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.trim());
    }
  } catch (error) {
    console.error(
      'Error reading .gitignore:',
      error instanceof Error ? error.message : String(error),
    );
  }
  return [];
}

/**
 * Parse .xray-ignore file and get additional patterns to exclude
 * @returns Array of xray-ignore patterns
 */
function getXrayIgnorePatterns() {
  const patterns = [];

  try {
    // Check root directory
    if (fs.existsSync('.xray-ignore')) {
      const xrayIgnoreContent = fs.readFileSync('.xray-ignore', 'utf8');
      patterns.push(...parseIgnoreContent(xrayIgnoreContent));
    }

    // Also check script directory
    const scriptDir = path.dirname(__filename);
    const scriptDirIgnorePath = path.join(scriptDir, '.xray-ignore');
    if (fs.existsSync(scriptDirIgnorePath)) {
      const xrayIgnoreContent = fs.readFileSync(scriptDirIgnorePath, 'utf8');
      patterns.push(...parseIgnoreContent(xrayIgnoreContent));
    }
  } catch (error) {
    console.error(
      'Error reading .xray-ignore:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return patterns;
}

function parseIgnoreContent(content) {
  return content
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.trim());
}

/**
 * Check if a file or directory should be ignored based on gitignore patterns
 * @param filePath - Path to check
 * @param ignorePatterns - Patterns from .gitignore
 * @returns True if the path should be ignored
 */
function shouldIgnore(filePath, ignorePatterns) {
  // Always ignore dot folders (like .git, .idea)
  try {
    if (
      path.basename(filePath).startsWith('.') &&
      fs.statSync(filePath).isDirectory()
    ) {
      return true;
    }

    // Check against gitignore patterns
    for (const pattern of ignorePatterns) {
      if (pattern.endsWith('/')) {
        // Directory pattern
        const dirPattern = pattern.slice(0, -1);
        if (filePath === dirPattern || filePath.startsWith(`${dirPattern}/`)) {
          return true;
        }
      } else {
        // File pattern or glob
        if (pattern.includes('*')) {
          const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
          const regex = new RegExp(`^${regexPattern}$`);
          if (regex.test(path.basename(filePath))) {
            return true;
          }
        } else if (
          filePath === pattern ||
          path.basename(filePath) === pattern
        ) {
          return true;
        }
      }
    }
  } catch (error) {
    // If there's an error checking the file (e.g., permission issues), skip it
    return true;
  }

  return false;
}

/**
 * Recursively traverse directory and collect file paths
 * @param dir - Directory to traverse
 * @param ignorePatterns - Patterns to ignore
 * @param files - Accumulated file paths
 * @param basePath - Base path for relative paths
 * @returns Array of file paths
 */
function traverseDirectory(dirPath, ignorePatterns) {
  const files = [];

  // Add debug logging
  console.log(`Scanning directory: ${dirPath}`);

  function scan(currentPath) {
    // Skip if this path should be ignored
    const relativePath = path.relative(process.cwd(), currentPath);
    if (shouldIgnore(relativePath, ignorePatterns)) {
      console.log(`Ignoring: ${relativePath}`);
      return;
    }

    try {
      const stat = fs.statSync(currentPath);

      if (stat.isDirectory()) {
        const entries = fs.readdirSync(currentPath);

        for (const entry of entries) {
          scan(path.join(currentPath, entry));
        }
      } else {
        files.push(relativePath);
      }
    } catch (error) {
      console.error(
        `Error accessing ${currentPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  scan(dirPath);
  return files;
}

/**
 * Generate a pretty filetree representation
 * @param files - Array of file paths
 * @returns Pretty filetree string
 */
function generatePrettyFileTree(files) {
  const tree = {};

  // Build tree structure
  for (const file of files) {
    const parts = file.split(path.sep);
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // It's a file
        current[part] = null;
      } else {
        // It's a directory
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  // Generate pretty string
  function printTree(node, prefix = '', isLast = true) {
    const entries = Object.keys(node || {});
    let result = '';

    entries.forEach((entry, index) => {
      const isLastEntry = index === entries.length - 1;
      // The issue is here - using isLastEntry instead of isLast for the connector
      const connector = isLastEntry ? '└── ' : '├── ';
      const childPrefix = isLastEntry ? '    ' : '│   ';

      result += `${prefix}${connector}${entry}\n`;

      if (node && node[entry] !== null) {
        result += printTree(node[entry], prefix + childPrefix, isLastEntry);
      }
    });

    return result;
  }

  return printTree(tree);
}

/**
 * Main file gathering function
 */
function gatherProjectFiles() {
  console.log('Starting project file gathering...');

  // Get ignore patterns from both .gitignore and .xray-ignore
  const gitignorePatterns = getGitignorePatterns();
  const xrayIgnorePatterns = getXrayIgnorePatterns();
  const ignorePatterns = [...gitignorePatterns, ...xrayIgnorePatterns];

  console.log(`Found ${gitignorePatterns.length} gitignore patterns`);
  console.log(`Found ${xrayIgnorePatterns.length} xray-ignore patterns`);
  console.log(`Total ${ignorePatterns.length} ignore patterns`);

  // Traverse directory and get all files
  const projectFiles = traverseDirectory(process.cwd(), ignorePatterns);
  console.log(`Found ${projectFiles.length} files in project`);
  console.log(projectFiles);

  // Generate pretty filetree
  const prettyTree = generatePrettyFileTree(projectFiles);
  console.log('\nProject File Structure:');
  console.log(prettyTree);

  return projectFiles;
}
/**
 * Count lines in a file
 * @param filePath Path to the file
 * @returns Number of lines in the file
 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    console.error(`Error counting lines in ${filePath}: ${error}`);
    return 0;
  }
}

/**
 * Analyze file content for entry points, exit points, and types
 * @param filePath Path to the file
 * @param analysis Analysis object to update
 */
function analyzeFileContent(filePath, analysis) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) {
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);

    // Update statistics
    const lineCount = lines.length;
    analysis.stats.totalLines += lineCount;

    // Update lines per file type
    if (!analysis.stats.linesPerFileType[ext]) {
      analysis.stats.linesPerFileType[ext] = 0;
    }
    analysis.stats.linesPerFileType[ext] += lineCount;

    // Track large files
    analysis.stats.largestFiles.push({ path: filePath, lines: lineCount });
    // Sort and keep only top files
    analysis.stats.largestFiles.sort((a, b) => b.lines - a.lines);
    analysis.stats.largestFiles = analysis.stats.largestFiles.slice(0, 20);

    // Entry Points
    // Controllers
    if (
      fileName.includes('controller') ||
      content.includes('Controller') ||
      content.includes('@Controller')
    ) {
      analysis.entryPoints.controllers.push(filePath);
    }

    // Commands
    if (
      fileName.includes('command') ||
      content.includes('Command') ||
      content.includes('@Command')
    ) {
      analysis.entryPoints.commands.push(filePath);
    }

    // Event Handlers
    if (
      content.includes('EventHandler') ||
      content.includes('@EventHandler') ||
      content.includes('addEventListener') ||
      content.includes('.on(')
    ) {
      analysis.entryPoints.eventHandlers.push(filePath);
    }

    // APIs
    if (
      content.includes('app.get(') ||
      content.includes('app.post(') ||
      content.includes('app.put(') ||
      content.includes('router.') ||
      content.includes('@Get(') ||
      content.includes('@Post(')
    ) {
      analysis.entryPoints.apis.push(filePath);
    }

    // Exit Points
    // API Calls
    if (
      content.includes('fetch(') ||
      content.includes('axios.') ||
      content.includes('http.request') ||
      content.includes('.request(')
    ) {
      analysis.exitPoints.apiCalls.push(filePath);
    }

    // Database Operations
    if (
      content.includes('mongoose') ||
      content.includes('sequelize') ||
      content.includes('knex') ||
      content.includes('mongo.') ||
      content.includes('mysql') ||
      content.includes('postgres') ||
      content.includes('typeorm') ||
      content.includes('.query(') ||
      content.includes('.findOne') ||
      content.includes('.findById')
    ) {
      analysis.exitPoints.databaseOperations.push(filePath);
    }

    // External Services
    if (
      content.includes('AWS.') ||
      content.includes('firebase.') ||
      content.includes('stripe.') ||
      content.includes('twilio') ||
      content.includes('sendgrid')
    ) {
      analysis.exitPoints.externalServices.push(filePath);
    }

    // File Operations
    if (
      content.includes('fs.') ||
      content.includes('FileSystem') ||
      content.includes('readFile') ||
      content.includes('writeFile')
    ) {
      analysis.exitPoints.fileOperations.push(filePath);
    }

    // Types
    const interfaceMatches = content.match(/interface\s+(\w+)/g) || [];
    const typeMatches = content.match(/type\s+(\w+)/g) || [];
    const dtoMatches = content.match(/DTO\s+(\w+)/g) || [];

    interfaceMatches.forEach((match) => {
      const interfaceName = match.split(/\s+/)[1];
      analysis.types.interfaces.push(`${interfaceName} (${filePath})`);
    });

    typeMatches.forEach((match) => {
      const typeName = match.split(/\s+/)[1];
      analysis.types.typeDefinitions.push(`${typeName} (${filePath})`);
    });

    // Also look for class declarations with Dto suffix
    const dtoClassMatches = content.match(/class\s+(\w+Dto)\b/g) || [];
    dtoClassMatches.forEach((match) => {
      const dtoName = match.split(/\s+/)[1];
      analysis.types.dtos.push(`${dtoName} (${filePath})`);
    });

    // Look for interface declarations with Dto suffix
    const dtoInterfaceMatches = content.match(/interface\s+(\w+Dto)\b/g) || [];
    dtoInterfaceMatches.forEach((match) => {
      const dtoName = match.split(/\s+/)[1];
      analysis.types.dtos.push(`${dtoName} (${filePath})`);
    });
  } catch (error) {
    console.error(`Error analyzing ${filePath}: ${error}`);
  }
}

/**
 * Adds project.bones.json and project.bones.md to .gitignore if not already present
 */
function updateGitignore() {
  const gitignorePath = '.gitignore';
  const filesToIgnore = ['.project.bones.json', '.project.bones.md'];

  try {
    // Check if .gitignore exists, create if not
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }

    // Split content into lines for easier processing
    const lines = content.split('\n').map((line) => line.trim());

    // Track which files need to be added
    const filesToAdd = [];

    // Check which files are not in .gitignore
    for (const file of filesToIgnore) {
      if (!lines.includes(file)) {
        filesToAdd.push(file);
      }
    }

    // Add the missing files if any
    if (filesToAdd.length > 0) {
      // Add a newline at the end if needed
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }

      // Add a comment and the files
      content += '\n# Project-xray generated files\n';
      content += filesToAdd.join('\n') + '\n';

      // Write the updated content
      fs.writeFileSync(gitignorePath, content);
      console.log(`Added ${filesToAdd.join(', ')} to ${gitignorePath}`);
    } else {
      console.log('Project bones files already in .gitignore');
    }
  } catch (error) {
    console.error('Error updating .gitignore:', error);
  }
}

/**
 * Gets project information from package.json
 * @returns Project info object
 */
function getProjectInfo() {
  try {
    if (fs.existsSync('package.json')) {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '0.0.0',
        description: packageJson.description || 'No description available',
      };
    }
  } catch (error) {
    console.error('Error reading package.json:', error);
  }
  return {
    name: 'unknown',
    version: '0.0.0',
    description: 'No description available',
  };
}

/**
 * Scan .env files for environment variable names
 * @returns Array of environment variable names
 */
function scanEnvFiles() {
  const envVars = new Set();

  try {
    // Get all files that match .env pattern
    const files = fs
      .readdirSync(process.cwd())
      .filter((file) => file === '.env' || file.startsWith('.env.'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
          // Skip comments and empty lines
          if (line.trim() && !line.startsWith('#')) {
            // Updated regex to match both uppercase and lowercase variable names
            const match = line.match(/^([A-Za-z0-9_]+)\s*=/);
            if (match && match[1]) {
              envVars.add(match[1]);
            }
          }
        }
      } catch (error) {
        console.error(`Error reading ${file}: ${error}`);
      }
    }
  } catch (error) {
    console.error('Error scanning .env files:', error);
  }

  return [...envVars].sort();
}

/**
 * Extract environment variables used in the project
 * @param analysis Project analysis object with files
 * @returns Array of environment variable names
 */
function extractEnvironmentVariables(analysis) {
  const envVars = new Set();

  // Look for common patterns in code files
  for (const file of analysis.files) {
    if (
      file.endsWith('.ts') ||
      file.endsWith('.js') ||
      file.endsWith('.jsx') ||
      file.endsWith('.tsx')
    ) {
      try {
        const content = fs.readFileSync(file, 'utf8');

        // Find process.env.VARIABLE_NAME patterns
        const matches = content.match(/process\.env\.([A-Z0-9_]+)/g) || [];
        for (const match of matches) {
          const varName = match.replace('process.env.', '');
          envVars.add(varName);
        }

        // Check for ConfigService.get('VARIABLE_NAME') pattern (common in NestJS)
        const configMatches =
          content.match(/configService\.get\(['"]([A-Z0-9_]+)['"]\)/gi) || [];
        for (const match of configMatches) {
          const varNameMatch = match.match(/['"]([A-Z0-9_]+)['"]/);
          if (varNameMatch && varNameMatch[1]) {
            envVars.add(varNameMatch[1]);
          }
        }
      } catch (error) {
        console.error(`Error reading ${file}: ${error}`);
      }
    }
  }

  // Add variables from .env files
  const envFileVars = scanEnvFiles();
  for (const varName of envFileVars) {
    envVars.add(varName);
  }

  return [...envVars].sort();
}

/**
 * Gets repository information using git commands
 * @returns Repository info object
 */
function getRepositoryInfo() {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
    }).trim();

    // Get remotes
    const remotesOutput = execSync('git remote', { encoding: 'utf-8' }).trim();
    const remotes = remotesOutput ? remotesOutput.split('\n') : [];

    // Get last commit
    const lastCommit = execSync(
      'git log -1 --pretty=format:"%h - %s (%an, %ar)"',
      { encoding: 'utf-8' },
    ).trim();

    // Get last 5 commits
    const lastCommitsOutput = execSync(
      'git log -5 --pretty=format:"%h - %s (%ar)"',
      { encoding: 'utf-8' },
    );
    const lastCommits = lastCommitsOutput.split('\n');

    // Initialize with empty objects for dependencies and configuration
    return {
      branch,
      remotes,
      lastCommit,
      lastCommits,
      dependencies: {},
      devDependencies: {},
      configuration: {
        environmentVariables: [],
      },
    };
  } catch (error) {
    console.error('Error getting git info:', error);
    return {
      branch: 'unknown',
      remotes: [],
      lastCommit: 'unknown',
      lastCommits: [],
      dependencies: {},
      devDependencies: {},
      configuration: {
        environmentVariables: [],
      },
    };
  }
}

/**
 * Extract module imports from NestJS module files
 * @param files - List of project files
 * @returns Record of module imports by module name
 */
function extractModuleImports(files) {
  const moduleImports = {};

  for (const file of files) {
    if (!file.endsWith('.module.ts')) continue;

    try {
      const content = fs.readFileSync(file, 'utf8');
      const moduleName = path.basename(file, '.module.ts');

      // Extract module name from the file
      const moduleNameMatch = content.match(/@Module\s*\(\s*\{/);
      if (!moduleNameMatch) continue;

      // Find imports array in @Module decorator
      const importsMatch = content.match(/imports\s*:\s*\[([\s\S]*?)\]/);
      if (!importsMatch || !importsMatch[1]) {
        moduleImports[moduleName] = [];
        continue;
      }

      // Extract imported module names
      const importsList = importsMatch[1].trim();
      const imports = [];

      // Match each imported module name
      const importModuleRegex = /(\w+)Module/g;
      let match;
      while ((match = importModuleRegex.exec(importsList)) !== null) {
        imports.push(match[1]);
      }

      moduleImports[moduleName] = imports;
    } catch (error) {
      console.error(`Error analyzing module imports in ${file}: ${error}`);
    }
  }

  return moduleImports;
}

/**
 * Extract service injections from NestJS service files
 * @param files - List of project files
 * @returns Record of service dependencies by component name
 */
function extractServiceDependencies(files) {
  const serviceGroups = {};

  for (const file of files) {
    if (!file.endsWith('.service.ts') && !file.endsWith('.provider.ts'))
      continue;

    try {
      const content = fs.readFileSync(file, 'utf8');

      // Find directory name as the component group
      const dirName = path.basename(path.dirname(file));
      if (!serviceGroups[dirName]) {
        serviceGroups[dirName] = [];
      }

      // Extract service name and its dependencies
      const serviceNameMatch = content.match(/export\s+class\s+(\w+)/);
      if (!serviceNameMatch) continue;

      const serviceName = serviceNameMatch[1];

      // Find constructor with injected dependencies
      const constructorMatch = content.match(
        /constructor\s*\(\s*([\s\S]*?)\s*\)/,
      );
      if (!constructorMatch || !constructorMatch[1]) continue;

      // Extract dependencies from constructor params
      const constructorParams = constructorMatch[1];
      const dependencyRegex = /(\w+)\s*:\s*(\w+)/g;
      let depMatch;

      const dependencies = [];
      while ((depMatch = dependencyRegex.exec(constructorParams)) !== null) {
        const dependencyType = depMatch[2];
        if (
          dependencyType.endsWith('Service') ||
          dependencyType.endsWith('Repository')
        ) {
          dependencies.push({
            service: dependencyType,
            // Extract import path (simplified, would need full import analysis)
            module: `./${kebabCase(dependencyType)}`,
          });
        }
      }

      // Get actual imports from the file to determine module paths
      const importRegex =
        /import\s+{[^}]*?(\w+Service)[^}]*}\s+from\s+['"](.+?)['"]/g;
      while ((depMatch = importRegex.exec(content)) !== null) {
        const serviceName = depMatch[1];
        const modulePath = depMatch[2];

        // Update module path for any matching dependency
        for (const dep of dependencies) {
          if (dep.service === serviceName) {
            dep.module = modulePath;
          }
        }
      }

      serviceGroups[dirName].push(...dependencies);
    } catch (error) {
      console.error(
        `Error analyzing service dependencies in ${file}: ${error}`,
      );
    }
  }

  return serviceGroups;
}

/**
 * Generate a mermaid service diagram
 * @param serviceGroups - Service dependency groups
 * @returns Mermaid diagram as a string
 */
function generateServiceDiagram(serviceGroups) {
  let diagram = '```mermaid\ngraph TD\n';

  // Add nodes
  for (const groupName of Object.keys(serviceGroups)) {
    diagram += `  ${kebabCase(groupName)}[${kebabCase(groupName)}]\n`;
  }

  // Add edges
  for (const [groupName, dependencies] of Object.entries(serviceGroups)) {
    for (const dep of dependencies) {
      if (dep.service) {
        diagram += `  ${kebabCase(groupName)} --> ${dep.service}\n`;
      }
    }
  }

  diagram += '```';
  return diagram;
}

/**
 * Convert a string to kebab-case (for node IDs)
 * @param str - String to convert
 * @returns Kebab-case string
 */
function kebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/Service$/, '')
    .replace(/Module$/, '');
}

/**
 * Calculate token usage estimation
 * @param text Text to estimate
 * @returns Approximate token count
 */
function estimateTokens(text) {
  // This is a simple approximation: ~4 chars per token as a rough estimate
  return text.length / 4;
}

/**
 * Creates metadata for the analysis
 * @param startTime Analysis start time
 * @param analysis Current analysis object
 * @returns Metadata object
 */
function generateMeta(startTime, analysis) {
  const generationTimeMs = Date.now() - startTime;
  const analysisJson = JSON.stringify(analysis);

  return {
    schemaVersion: '1.1.0',
    generatedAt: new Date().toISOString(),
    generationTimeMs,
    overviewSizeChars: analysisJson.length,
    approximateTokenUsage: estimateTokens(analysisJson),
  };
}

/**
 * Main function to analyze the project
 * @returns Project analysis results
 */
function analyzeProject() {
  console.log('Starting project analysis...');
  const startTime = Date.now();

  const gitignorePatterns = getGitignorePatterns();
  const xrayIgnorePatterns = getXrayIgnorePatterns();
  const ignorePatterns = [...gitignorePatterns, ...xrayIgnorePatterns];

  console.log(`Found ${ignorePatterns.length} total ignore patterns`);

  // Initialize analysis object
  const analysis = {
    project: getProjectInfo(),
    repository: getRepositoryInfo(),
    meta: {
      schemaVersion: '1.1.0',
      generatedAt: new Date().toISOString(),
      generationTimeMs: 0,
      overviewSizeChars: 0,
      approximateTokenUsage: 0,
    },
    files: [],
    fileTree: '',
    entryPoints: {
      controllers: [],
      commands: [],
      eventHandlers: [],
      apis: [],
    },
    exitPoints: {
      apiCalls: [],
      databaseOperations: [],
      externalServices: [],
      fileOperations: [],
    },
    types: {
      interfaces: [],
      typeDefinitions: [],
      dtos: [],
    },
    stats: {
      totalLines: 0,
      linesPerFileType: {},
      largestFiles: [],
    },
  };

  // Gather files
  analysis.files = traverseDirectory(process.cwd(), ignorePatterns);
  console.log(`Found ${analysis.files.length} files in project`);

  // Generate file tree
  analysis.fileTree = generatePrettyFileTree(analysis.files);
  console.log(`${analysis.fileTree}`);

  // Analyze each file
  for (const file of analysis.files) {
    analyzeFileContent(file, analysis);
  }

  // Update metadata with final information
  analysis.meta = generateMeta(startTime, analysis);

  // Add package.json dependencies
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  analysis.repository.dependencies = packageJson.dependencies || {};
  analysis.repository.devDependencies = packageJson.devDependencies || {};

  // Extract environment variables from code
  analysis.repository.configuration = {
    environmentVariables: extractEnvironmentVariables(analysis),
  };

  // Extract NestJS module relationships
  const moduleImports = extractModuleImports(analysis.files);
  const serviceUsage = extractServiceDependencies(analysis.files);
  const serviceDiagram = generateServiceDiagram(serviceUsage);

  // Add to analysis object
  analysis.moduleImports = moduleImports;
  analysis.serviceUsage = serviceUsage;
  analysis.mermaidServiceDiagram = serviceDiagram;

  // Create report
  console.log('\nProject Analysis Summary:');
  console.log('=========================');
  console.log(`Project: ${analysis.project.name} v${analysis.project.version}`);
  console.log(`Branch: ${analysis.repository.branch}`);
  console.log(`Last commit: ${analysis.repository.lastCommit}`);
  console.log(`Total files: ${analysis.files.length}`);
  console.log(`Total lines: ${analysis.stats.totalLines.toLocaleString()}`);

  console.log('\nLines per file type:');
  Object.entries(analysis.stats.linesPerFileType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ext, lines]) => {
      console.log(`  ${ext}: ${lines.toLocaleString()} lines`);
    });

  console.log('\nLargest files:');
  analysis.stats.largestFiles.slice(0, 5).forEach((file) => {
    console.log(`  ${file.path}: ${file.lines.toLocaleString()} lines`);
  });

  console.log('\nEntry Points:');
  console.log(`  Controllers: ${analysis.entryPoints.controllers.length}`);
  console.log(`  Commands: ${analysis.entryPoints.commands.length}`);
  console.log(`  Event Handlers: ${analysis.entryPoints.eventHandlers.length}`);
  console.log(`  APIs: ${analysis.entryPoints.apis.length}`);

  console.log('\nExit Points:');
  console.log(`  API Calls: ${analysis.exitPoints.apiCalls.length}`);
  console.log(
    `  Database Operations: ${analysis.exitPoints.databaseOperations.length}`,
  );
  console.log(
    `  External Services: ${analysis.exitPoints.externalServices.length}`,
  );
  console.log(
    `  File Operations: ${analysis.exitPoints.fileOperations.length}`,
  );

  console.log('\nTypes:');
  console.log(`  Interfaces: ${analysis.types.interfaces.length}`);
  console.log(`  Type Definitions: ${analysis.types.typeDefinitions.length}`);
  console.log(`  DTOs: ${analysis.types.dtos.length}`);

  return analysis;
}

function generateMarkdownReport(analysis) {
  // Helper to extract just the name from a path
  const getName = (path) => path.split('/').pop() || path;

  // Helper to extract a class/type name from a string like "ClassName (path/to/file.ts)"
  const extractName = (fullString) => {
    const match = fullString.match(/^(\w+)/);
    return match ? match[1] : fullString;
  };

  let markdown = `# ${analysis.project.name} v${analysis.project.version}\n\n`;

  markdown += `*(The information in this document is algorithmically parsed from project files and may not be exhaustive or complete, but should give a detailed sketch of the repo.)*\n\n`;

  // Project overview
  markdown += `## Project Overview\n\n `;
  markdown += `- **Description**: ${analysis.project.description}\n`;
  markdown += `- **Branch**: ${analysis.repository.branch}\n`;
  markdown += `- **Last Commit**: ${analysis.repository.lastCommit}\n`;
  markdown += `- **Total Files**: ${analysis.files.length}\n`;
  markdown += `- **Total Lines**: ${analysis.stats.totalLines.toLocaleString()}\n`;

  // Stats section
  markdown += `\n## Stats\n\n`;

  // Lines per file type
  markdown += `### Lines per File Type\n\n`;
  Object.entries(analysis.stats.linesPerFileType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ext, lines]) => {
      markdown += `- **${ext}**: ${lines.toLocaleString()}\n`;
    });

  // Largest files
  markdown += `\n### Largest Files\n\n`;
  analysis.stats.largestFiles.slice(0, 10).forEach((file) => {
    markdown += `- \`${file.path}\`: ${file.lines.toLocaleString()} lines\n`;
  });

  // File tree
  markdown += `\n## File Structure\n\n`;
  markdown += '```\n' + analysis.fileTree + '```\n';

  // Entry points
  markdown += `\n## Entry Points\n\n`;

  if (analysis.entryPoints.controllers.length > 0) {
    markdown += `### Controllers (${analysis.entryPoints.controllers.length})\n\n`;
    analysis.entryPoints.controllers.forEach((controller) => {
      markdown += `- \`${getName(controller)}\`\n`;
    });
  }

  if (analysis.entryPoints.commands.length > 0) {
    markdown += `\n### Commands (${analysis.entryPoints.commands.length})\n\n`;
    analysis.entryPoints.commands.forEach((command) => {
      markdown += `- \`${getName(command)}\`\n`;
    });
  }

  if (analysis.entryPoints.eventHandlers.length > 0) {
    markdown += `\n### Event Handlers (${analysis.entryPoints.eventHandlers.length})\n\n`;
    analysis.entryPoints.eventHandlers.forEach((handler) => {
      markdown += `- \`${getName(handler)}\`\n`;
    });
  }

  if (analysis.entryPoints.apis.length > 0) {
    markdown += `\n### APIs (${analysis.entryPoints.apis.length})\n\n`;
    analysis.entryPoints.apis.forEach((api) => {
      markdown += `- \`${getName(api)}\`\n`;
    });
  }

  // Exit points
  markdown += `\n## Exit Points\n\n`;

  if (analysis.exitPoints.apiCalls.length > 0) {
    markdown += `### API Calls (${analysis.exitPoints.apiCalls.length})\n\n`;
    analysis.exitPoints.apiCalls.forEach((apiCall) => {
      markdown += `- \`${getName(apiCall)}\`\n`;
    });
  }

  if (analysis.exitPoints.databaseOperations.length > 0) {
    markdown += `\n### Database Operations (${analysis.exitPoints.databaseOperations.length})\n\n`;
    analysis.exitPoints.databaseOperations.forEach((dbOp) => {
      markdown += `- \`${getName(dbOp)}\`\n`;
    });
  }

  if (analysis.exitPoints.externalServices.length > 0) {
    markdown += `\n### External Services (${analysis.exitPoints.externalServices.length})\n\n`;
    analysis.exitPoints.externalServices.forEach((service) => {
      markdown += `- \`${getName(service)}\`\n`;
    });
  }

  if (analysis.exitPoints.fileOperations.length > 0) {
    markdown += `\n### File Operations (${analysis.exitPoints.fileOperations.length})\n\n`;
    analysis.exitPoints.fileOperations.forEach((fileOp) => {
      markdown += `- \`${getName(fileOp)}\`\n`;
    });
  }

  // Types
  markdown += `\n## Types\n\n`;

  if (analysis.types.interfaces.length > 0) {
    markdown += `### Interfaces (${analysis.types.interfaces.length})\n\n`;
    analysis.types.interfaces.forEach((intf) => {
      markdown += `- ${extractName(intf)}\n`;
    });
  }

  if (analysis.types.typeDefinitions.length > 0) {
    markdown += `\n### Type Definitions (${analysis.types.typeDefinitions.length})\n\n`;
    analysis.types.typeDefinitions.forEach((typeDef) => {
      markdown += `- ${extractName(typeDef)}\n`;
    });
  }

  if (analysis.types.dtos.length > 0) {
    markdown += `\n### DTOs (${analysis.types.dtos.length})\n\n`;
    analysis.types.dtos.forEach((dto) => {
      markdown += `- ${extractName(dto)}\n`;
    });
  }

  // Dependencies
  markdown += `\n## Dependencies\n\n`;
  const deps = Object.keys(analysis.repository.dependencies);
  markdown += `- ${deps.join(', ')}${
    deps.length < Object.keys(analysis.repository.dependencies).length
      ? ', ...'
      : ''
  }\n`;

  // Dev dependencies
  markdown += `\n## Dev Dependencies\n\n`;
  const devDeps = Object.keys(analysis.repository.devDependencies);
  markdown += `- ${devDeps.join(', ')}${
    devDeps.length < Object.keys(analysis.repository.devDependencies).length
      ? ', ...'
      : ''
  }\n`;

  // Environment Variables
  if (analysis.repository.configuration?.environmentVariables?.length > 0) {
    markdown += `\n## Environment Variables\n\n`;
    analysis.repository.configuration.environmentVariables.forEach((envVar) => {
      markdown += `- ${envVar}\n`;
    });
  }

  // Service Diagram
  if (analysis.mermaidServiceDiagram) {
    markdown += `\n## Service Diagram\n\n`;
    markdown += `${analysis.mermaidServiceDiagram}\n`;
  }

  // Add metadata footer
  markdown += `\n---\n`;
  markdown += `Generated at: ${analysis.meta.generatedAt} | `;
  markdown += `Schema version: ${analysis.meta.schemaVersion}\n`;

  // Calculate token assessment inline directly on the generated markdown
  const chars = markdown.length;
  const tokens = estimateTokens(markdown);

  // Add the token assessment to the footer
  markdown += `Tokens: ${tokens.toFixed(2)} | `;
  markdown += `Characters: ${chars.toLocaleString()}\n`;

  return markdown;
}

// When running the main function
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const analysis = analyzeProject();

  // Get project root directory (where the script is executed from)
  const projectRoot = process.cwd();

  // Save JSON analysis to project root
  const jsonPath = path.join(projectRoot, '.project.bones.json');
  fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
  console.log(`\nAnalysis saved to ${jsonPath}`);

  // Generate and save markdown report to project root
  const markdownReport = generateMarkdownReport(analysis);
  const mdPath = path.join(projectRoot, '.project.bones.md');
  fs.writeFileSync(mdPath, markdownReport);
  console.log(`Markdown report saved to ${mdPath}`);

  // Also update gitignore in project root
  updateGitignore();
}

export {
  analyzeProject,
  gatherProjectFiles,
  getGitignorePatterns,
  getXrayIgnorePatterns,
  traverseDirectory,
  shouldIgnore,
  generatePrettyFileTree,
  getProjectInfo,
  getRepositoryInfo,
};
