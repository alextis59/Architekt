#!/usr/bin/env node
import { spawn } from 'node:child_process';

const processes = [];

const spawnProcess = (command, args, name) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
    } else {
      console.log(`[${name}] exited with code ${code}`);
    }

    if (!shuttingDown) {
      shuttingDown = true;
      terminateAll();
      process.exitCode = code ?? 0;
    }
  });

  processes.push({ name, child });
};

let shuttingDown = false;

const terminateAll = () => {
  for (const { child } of processes) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
};

const handleSignal = (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down child processes...`);
  terminateAll();
};

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

spawnProcess('npm', ['--workspace', '@architekt/backend', 'run', 'start'], 'backend');
spawnProcess('npm', ['--workspace', '@architekt/frontend', 'run', 'dev'], 'frontend');
