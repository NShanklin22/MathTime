import { fontsReady } from './fonts.js';

fontsReady().then(() => document.documentElement.classList.remove('loading'));
