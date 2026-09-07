import { createApp } from 'vue';
import { Notify, Quasar } from 'quasar';
import 'quasar/src/css/index.sass';
import '@/styles/theme.scss';
import App from './App.vue';
import { quasarOptions } from './quasar-setup';
import { installDebugConsole } from '@/composables/useMergeWizard';
import { createLogger, errorMessage } from '@/core/util/log';

const log = createLogger('app');
const nav = navigator as Navigator & { deviceMemory?: number };
log.info(`booting (${import.meta.env.MODE}) · ${nav.userAgent} · ${nav.hardwareConcurrency ?? '?'} cores · ${nav.deviceMemory ?? '?'} GB`);

function reportFatal(source: string, error: unknown): void {
  log.error(`${source}:`, error);
  try {
    Notify.create({ type: 'negative', message: `Something went wrong: ${errorMessage(error)}`, caption: 'Details are in the browser console.', timeout: 8000 });
  } catch {
    /* Notify may not be installed yet */
  }
}
window.addEventListener('error', (e) => reportFatal('Uncaught error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportFatal('Unhandled promise rejection', e.reason));

const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => reportFatal(`Vue error (${info})`, err);
app.config.warnHandler = (msg, _instance, trace) => log.warn(`Vue warning: ${msg}`, trace);
app.use(Quasar, quasarOptions).mount('#app');
installDebugConsole();
log.info('mounted');
