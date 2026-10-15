import type { TestProject } from 'vitest/node';
import { type DevServer, startServer } from './server';

let server: DevServer | null = null;

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

export async function setup(project: TestProject) {
  let url = process.env.BASE_URL;
  if (!url) {
    server = await startServer(8791, project.config.env?.TEST_BACKEND ?? 'node');
    url = server.url;
  }
  project.provide('baseUrl', url);
}

export async function teardown() {
  await server?.stop();
}
