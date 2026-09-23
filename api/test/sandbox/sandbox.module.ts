import { Module, type OnModuleInit } from '@nestjs/common';
import { registerSandboxSignalType } from './sandbox-signal.js';
import { SandboxWorkoutRule } from './sandbox-rule.js';
import {
  SandboxApplyOkHandler,
  SandboxConflictHandler,
  SandboxNonRevertibleHandler,
  SandboxThrowsHandler,
} from './sandbox-handlers.js';
import { SandboxDetector } from './sandbox-detector.js';

/**
 * Test-only stand-in for the domain modules (habits, fitness, finances,
 * meals) that don't exist yet. Never imported from src/ - e2e specs add it
 * alongside AppModule in Test.createTestingModule so the engine's
 * DiscoveryService-based registry picks up these fixtures exactly the way it
 * would pick up a real domain module's providers. Wired to "workout-to-habit",
 * the one connection with no real rule of its own yet.
 */
@Module({
  providers: [
    SandboxWorkoutRule,
    SandboxApplyOkHandler,
    SandboxNonRevertibleHandler,
    SandboxThrowsHandler,
    SandboxConflictHandler,
    SandboxDetector,
  ],
})
export class SandboxModule implements OnModuleInit {
  onModuleInit(): void {
    registerSandboxSignalType();
  }
}
