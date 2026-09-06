import { Notify, type QuasarPluginOptions } from 'quasar';

export const quasarOptions: Partial<QuasarPluginOptions> = {
  plugins: { Notify },
  config: {
    notify: { position: 'top', timeout: 5000 },
    brand: {
      primary: '#4a6da7',
      secondary: '#5e8c61',
      accent: '#9c6b98',
      positive: '#3f8f5f',
      negative: '#b23b3b',
      warning: '#d9a441',
      info: '#4a6da7',
    },
  },
};
