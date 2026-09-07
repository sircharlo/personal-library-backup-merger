import { Notify, type QuasarPluginOptions } from 'quasar';
import iconSet from 'quasar/icon-set/svg-material-symbols-rounded';

export const quasarOptions: Partial<QuasarPluginOptions> = {
  plugins: { Notify },
  iconSet,
  config: {
    dark: true,
    notify: { position: 'top', timeout: 4500, progress: true, classes: 'notify' },
    brand: {
      primary: '#8b7cff',
      secondary: '#22d3ee',
      accent: '#d946ef',
      dark: '#111a33',
      'dark-page': '#0a0f1e',
      positive: '#34d399',
      negative: '#fb7185',
      info: '#60a5fa',
      warning: '#fbbf24',
    },
  },
};
