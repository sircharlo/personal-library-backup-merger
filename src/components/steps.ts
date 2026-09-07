import type { WizardStep } from '@/composables/useMergeWizard';

export interface RailStep {
  key: WizardStep;
  title: string;
  caption: string;
  icon: string;
  skipped?: boolean;
}
