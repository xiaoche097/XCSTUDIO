import { SKYSPER_CORE_SYSTEM } from './prompts/skysper-core.system';
import { STARTUP_PACK } from './prompts/packs/startup.pack';
import { P0_PACK } from './prompts/packs/p0.pack';
import { P1_PACK } from './prompts/packs/p1.pack';
import { P2_PACK } from './prompts/packs/p2.pack';
import { P3_PACK } from './prompts/packs/p3.pack';
import { P4_PACK } from './prompts/packs/p4.pack';
import { P5_PACK } from './prompts/packs/p5.pack';

export type XcaiPackName =
  | 'STARTUP_PACK'
  | 'P0_PACK'
  | 'P1_PACK'
  | 'P2_PACK'
  | 'P3_PACK'
  | 'P4_PACK'
  | 'P5_PACK';

const xcaiOneclickPacks: Record<XcaiPackName, string> = {
  STARTUP_PACK,
  P0_PACK,
  P1_PACK,
  P2_PACK,
  P3_PACK,
  P4_PACK,
  P5_PACK,
};

export const AgentRegistry = {
  'xcai-oneclick': {
    core: SKYSPER_CORE_SYSTEM,
    packs: xcaiOneclickPacks,
  },
};

export type AgentRegistryId = keyof typeof AgentRegistry;
