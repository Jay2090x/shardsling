// Worker bootstrap: lets worker threads load the TypeScript sources through tsx.
import { register } from 'tsx/esm/api';
register();
await import('./worker.ts');
