import { createApp } from 'vue';
import { Quasar } from 'quasar';
import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import App from './App.vue';
import { quasarOptions } from './quasar-setup';
import { configureSqlJsForBrowser } from './sqljs-browser';

configureSqlJsForBrowser();

createApp(App).use(Quasar, quasarOptions).mount('#app');
