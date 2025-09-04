#!/usr/bin/env bun

import { spawn } from 'child_process';
import { watch } from 'fs';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

interface DevToolsConfig {
  autoRestart: boolean;
  hotReload: boolean;
  linting: boolean;
  typeChecking: boolean;
  testing: boolean;
  monitoring: boolean;
  profiling: boolean;
}

class DevelopmentWorkflowTools {
  private config: DevToolsConfig;
  private processes: Map<string, any> = new Map();
  private watchers: Map<string, any> = new Map();
  private isRunning = false;

  constructor(config: Partial<DevToolsConfig> = {}) {
    this.config = {
      autoRestart: true,
      hotReload: true,
      linting: true,
      typeChecking: true,
      testing: false, // Disabled by default for performance
      monitoring: true,
      profiling: false,
      ...config,
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Development tools already running');
      return;
    }

    console.log('🚀 Starting Enhanced Development Workflow Tools');
    console.log('='.repeat(50));
    
    this.printConfiguration();
    
    try {
      if (this.config.hotReload) {
        await this.startHotReload();
      }

      if (this.config.linting) {
        await this.startLinting();
      }

      if (this.config.typeChecking) {
        await this.startTypeChecking();
      }

      if (this.config.testing) {
        await this.startTesting();
      }

      if (this.config.monitoring) {
        await this.startMonitoring();
      }

      if (this.config.profiling) {
        await this.startProfiling();
      }

      this.isRunning = true;
      this.setupShutdownHandlers();
      
      console.log('\n✅ All development tools started successfully!');
      console.log('📁 Watching for changes in: src/, tests/, scripts/');
      console.log('🔧 Available commands:');
      console.log('   - Ctrl+C: Stop all tools');
      console.log('   - rs + Enter: Manual restart');
      console.log('   - q + Enter: Quit');
      console.log('');

      this.startCommandListener();

    } catch (error) {
      console.error('❌ Failed to start development tools:', error);
      await this.stop();
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('\n🛑 Stopping development tools...');
    
    // Stop all processes
    for (const [name, process] of this.processes) {
      try {
        console.log(`   Stopping ${name}...`);
        process.kill();
        this.processes.delete(name);
      } catch (error) {
        console.warn(`   Failed to stop ${name}:`, error);
      }
    }

    // Stop all watchers
    for (const [name, watcher] of this.watchers) {
      try {
        console.log(`   Stopping ${name} watcher...`);
        watcher.close();
        this.watchers.delete(name);
      } catch (error) {
        console.warn(`   Failed to stop ${name} watcher:`, error);
      }
    }

    this.isRunning = false;
    console.log('✅ All development tools stopped');
  }

  private printConfiguration(): void {
    console.log('⚙️  Configuration:');
    console.log(`   Hot Reload: ${this.config.hotReload ? '✅' : '❌'}`);
    console.log(`   Auto Restart: ${this.config.autoRestart ? '✅' : '❌'}`);
    console.log(`   Linting: ${this.config.linting ? '✅' : '❌'}`);
    console.log(`   Type Checking: ${this.config.typeChecking ? '✅' : '❌'}`);
    console.log(`   Testing: ${this.config.testing ? '✅' : '❌'}`);
    console.log(`   Monitoring: ${this.config.monitoring ? '✅' : '❌'}`);
    console.log(`   Profiling: ${this.config.profiling ? '✅' : '❌'}`);
    console.log('');
  }

  private async startHotReload(): Promise<void> {
    console.log('🔥 Starting hot reload...');
    
    const serverProcess = spawn('bun', ['--hot', 'run', 'src/index.ts'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'debug' }
    });

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('error') || output.includes('Error')) {
        console.log(`🔥 [SERVER] ${output.trim()}`);
      } else {
        console.log(`🔥 [SERVER] ${output.trim()}`);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.log(`🔥 [SERVER ERROR] ${data.toString().trim()}`);
    });

    serverProcess.on('close', (code) => {
      if (code !== 0) {
        console.log(`🔥 [SERVER] Process exited with code ${code}`);
        if (this.config.autoRestart && this.isRunning) {
          console.log('🔄 Auto-restarting server...');
          setTimeout(() => this.startHotReload(), 2000);
        }
      }
    });

    this.processes.set('server', serverProcess);
  }

  private async startLinting(): Promise<void> {
    console.log('🔍 Starting linter...');
    
    // Watch for file changes and run linter
    const lintWatcher = watch('./src', { recursive: true }, async (eventType, filename) => {
      if (filename && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
        await this.runLinter(filename);
      }
    });

    this.watchers.set('linter', lintWatcher);
    
    // Run initial lint
    await this.runLinter();
  }

  private async runLinter(specificFile?: string): Promise<void> {
    const startTime = performance.now();
    const files = specificFile ? [specificFile] : ['src/', 'tests/', 'scripts/'];
    
    try {
      const lintProcess = spawn('bun', ['x', 'biome', 'check', ...files], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let hasErrors = false;
      let errorOutput = '';

      lintProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('✖')) {
          hasErrors = true;
          errorOutput += output;
        }
      });

      lintProcess.stderr?.on('data', (data) => {
        hasErrors = true;
        errorOutput += data.toString();
      });

      lintProcess.on('close', (code) => {
        const duration = performance.now() - startTime;
        if (code === 0) {
          console.log(`✅ [LINT] Clean (${duration.toFixed(0)}ms)${specificFile ? ` - ${specificFile}` : ''}`);
        } else {
          console.log(`❌ [LINT] Errors found (${duration.toFixed(0)}ms):`);
          if (errorOutput) {
            console.log(errorOutput.trim());
          }
        }
      });

    } catch (error) {
      console.log(`❌ [LINT] Failed to run linter: ${error}`);
    }
  }

  private async startTypeChecking(): Promise<void> {
    console.log('📝 Starting type checker...');
    
    // Watch for TypeScript file changes
    const typeWatcher = watch('./src', { recursive: true }, async (eventType, filename) => {
      if (filename && filename.endsWith('.ts')) {
        await this.runTypeCheck();
      }
    });

    this.watchers.set('typecheck', typeWatcher);
    
    // Run initial type check
    await this.runTypeCheck();
  }

  private async runTypeCheck(): Promise<void> {
    const startTime = performance.now();
    
    try {
      const tscProcess = spawn('bun', ['x', 'tsc', '--noEmit', '--incremental'], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let hasErrors = false;
      let errorOutput = '';

      tscProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('TS')) {
          hasErrors = true;
          errorOutput += output;
        }
      });

      tscProcess.stderr?.on('data', (data) => {
        hasErrors = true;
        errorOutput += data.toString();
      });

      tscProcess.on('close', (code) => {
        const duration = performance.now() - startTime;
        if (code === 0) {
          console.log(`✅ [TYPE] No type errors (${duration.toFixed(0)}ms)`);
        } else {
          console.log(`❌ [TYPE] Type errors found (${duration.toFixed(0)}ms):`);
          if (errorOutput) {
            console.log(errorOutput.trim());
          }
        }
      });

    } catch (error) {
      console.log(`❌ [TYPE] Failed to run type checker: ${error}`);
    }
  }

  private async startTesting(): Promise<void> {
    console.log('🧪 Starting test watcher...');
    
    // Watch for test file changes
    const testWatcher = watch('./tests', { recursive: true }, async (eventType, filename) => {
      if (filename && filename.endsWith('.test.ts')) {
        await this.runTests(filename);
      }
    });

    // Watch for source file changes to run related tests
    const srcWatcher = watch('./src', { recursive: true }, async (eventType, filename) => {
      if (filename && filename.endsWith('.ts')) {
        await this.runRelatedTests(filename);
      }
    });

    this.watchers.set('test-files', testWatcher);
    this.watchers.set('test-src', srcWatcher);
  }

  private async runTests(specificTest?: string): Promise<void> {
    const startTime = performance.now();
    const testArgs = specificTest ? [specificTest] : ['tests/'];
    
    try {
      const testProcess = spawn('bun', ['test', ...testArgs], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let output = '';
      testProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      testProcess.on('close', (code) => {
        const duration = performance.now() - startTime;
        const lines = output.trim().split('\n');
        const summary = lines[lines.length - 1] || 'Tests completed';
        
        if (code === 0) {
          console.log(`✅ [TEST] ${summary} (${duration.toFixed(0)}ms)`);
        } else {
          console.log(`❌ [TEST] ${summary} (${duration.toFixed(0)}ms)`);
          // Show last few lines of output for context
          console.log(lines.slice(-5).join('\n'));
        }
      });

    } catch (error) {
      console.log(`❌ [TEST] Failed to run tests: ${error}`);
    }
  }

  private async runRelatedTests(sourceFile: string): Promise<void> {
    // Find related test files
    const testFile = sourceFile.replace('src/', 'tests/').replace('.ts', '.test.ts');
    try {
      await stat(testFile);
      await this.runTests(testFile);
    } catch {
      // Test file doesn't exist, run all tests for broad coverage
      // await this.runTests();
    }
  }

  private async startMonitoring(): Promise<void> {
    console.log('📊 Starting performance monitoring...');
    
    // Start metrics endpoint if available
    try {
      const metricsProcess = spawn('bun', ['run', 'src/monitoring/metricsEndpoint.ts'], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      metricsProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('started')) {
          console.log(`📊 [METRICS] ${output}`);
        }
      });

      this.processes.set('metrics', metricsProcess);
    } catch (error) {
      console.log('📊 [METRICS] Metrics endpoint not available');
    }

    // Monitor file system for changes
    this.startFileSystemMonitoring();
    
    // Monitor memory usage
    this.startMemoryMonitoring();
  }

  private startFileSystemMonitoring(): void {
    let changeCount = 0;
    const startTime = Date.now();
    
    const fsWatcher = watch('.', { recursive: true }, (eventType, filename) => {
      if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
        changeCount++;
        
        // Report every 10 changes or every 30 seconds
        if (changeCount % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = changeCount / elapsed;
          console.log(`📁 [FS] ${changeCount} changes detected (${rate.toFixed(1)}/sec)`);
        }
      }
    });

    this.watchers.set('filesystem', fsWatcher);
  }

  private startMemoryMonitoring(): void {
    const startMemory = process.memoryUsage();
    let peakMemory = startMemory.heapUsed;
    
    const memoryInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      
      if (memUsage.heapUsed > peakMemory) {
        peakMemory = memUsage.heapUsed;
      }
      
      // Report if memory usage is high
      if (heapUsedMB > 200) {
        const peakMB = peakMemory / 1024 / 1024;
        console.log(`⚠️  [MEM] High memory usage: ${heapUsedMB.toFixed(1)}MB (peak: ${peakMB.toFixed(1)}MB)`);
      }
    }, 30000); // Check every 30 seconds

    this.processes.set('memory-monitor', { kill: () => clearInterval(memoryInterval) });
  }

  private async startProfiling(): Promise<void> {
    console.log('🔬 Starting performance profiling...');
    
    // Start with heap profiling
    const profileProcess = spawn('bun', ['--heap-prof', 'run', 'src/index.ts'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    profileProcess.stdout?.on('data', (data) => {
      console.log(`🔬 [PROFILE] ${data.toString().trim()}`);
    });

    profileProcess.on('close', () => {
      console.log('🔬 [PROFILE] Heap profile saved to isolate-*.heapprofile');
    });

    this.processes.set('profiler', profileProcess);
  }

  private startCommandListener(): void {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let input = '';
    
    process.stdin.on('data', async (key) => {
      const char = key.toString();
      
      if (char === '\u0003') { // Ctrl+C
        await this.stop();
        process.exit(0);
      } else if (char === '\r' || char === '\n') {
        const command = input.trim().toLowerCase();
        input = '';
        
        switch (command) {
          case 'rs':
          case 'restart':
            console.log('🔄 Manual restart triggered...');
            await this.restart();
            break;
          case 'q':
          case 'quit':
          case 'exit':
            await this.stop();
            process.exit(0);
            break;
          case 'help':
          case 'h':
            this.showHelp();
            break;
          case 'status':
          case 's':
            this.showStatus();
            break;
          default:
            if (command) {
              console.log(`❓ Unknown command: ${command}. Type 'help' for available commands.`);
            }
        }
      } else if (char.charCodeAt(0) === 127) { // Backspace
        input = input.slice(0, -1);
      } else if (char.charCodeAt(0) >= 32) { // Printable characters
        input += char;
      }
    });
  }

  private async restart(): Promise<void> {
    const serverProcess = this.processes.get('server');
    if (serverProcess) {
      serverProcess.kill();
      this.processes.delete('server');
      
      // Wait a moment then restart
      setTimeout(async () => {
        if (this.config.hotReload) {
          await this.startHotReload();
        }
      }, 1000);
    }
  }

  private showHelp(): void {
    console.log('\n📖 Available Commands:');
    console.log('   rs, restart  - Restart the development server');
    console.log('   s, status    - Show current status');
    console.log('   h, help      - Show this help message');
    console.log('   q, quit      - Quit development tools');
    console.log('   Ctrl+C       - Force quit\n');
  }

  private showStatus(): void {
    console.log('\n📊 Development Tools Status:');
    console.log(`   Running: ${this.isRunning ? '✅' : '❌'}`);
    console.log(`   Processes: ${this.processes.size}`);
    console.log(`   Watchers: ${this.watchers.size}`);
    
    const memUsage = process.memoryUsage();
    console.log(`   Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Uptime: ${(process.uptime() / 60).toFixed(1)} minutes\n`);
  }

  private setupShutdownHandlers(): void {
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error);
      this.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled rejection:', reason);
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: Partial<DevToolsConfig> = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-lint':
        options.linting = false;
        break;
      case '--no-type-check':
        options.typeChecking = false;
        break;
      case '--with-tests':
        options.testing = true;
        break;
      case '--with-profiling':
        options.profiling = true;
        break;
      case '--no-hot-reload':
        options.hotReload = false;
        break;
      case '--no-monitoring':
        options.monitoring = false;
        break;
      case '--help':
        console.log(`
🔧 Enhanced Development Workflow Tools

Usage: bun run scripts/dev-tools.ts [options]

Options:
  --no-lint           Disable automatic linting
  --no-type-check     Disable TypeScript type checking
  --with-tests        Enable automatic test running
  --with-profiling    Enable performance profiling
  --no-hot-reload     Disable hot reload
  --no-monitoring     Disable performance monitoring
  --help              Show this help message

Examples:
  bun run scripts/dev-tools.ts                    # Default configuration
  bun run scripts/dev-tools.ts --with-tests       # Enable testing
  bun run scripts/dev-tools.ts --no-lint          # Disable linting
  bun run scripts/dev-tools.ts --with-profiling   # Enable profiling
        `);
        process.exit(0);
        break;
    }
  }

  const devTools = new DevelopmentWorkflowTools(options);
  await devTools.start();
}

if (import.meta.main) {
  main().catch(console.error);
}

export { DevelopmentWorkflowTools, type DevToolsConfig };