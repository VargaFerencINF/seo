import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './ui/styles/app.css';
import './ui/styles/map.css';

import { Shell } from './ui/shell';
import { MapScreen } from './ui/screens/mapScreen';
import { ProjectsScreen } from './ui/screens/projectsScreen';
import { SettingsScreen } from './ui/screens/settingsScreen';
import { applyTheme, loadSettings, settings } from './state/settings';

async function start(): Promise<void> {
  await loadSettings();
  applyTheme(settings.get().theme);
  settings.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.get().theme === 'system') {
      applyTheme('system');
      void mapScreen.refreshBaseStyle();
    }
  });

  const root = document.getElementById('app')!;
  const shell = new Shell(root);
  const mapScreen = new MapScreen();
  shell.register(mapScreen);
  shell.register(new ProjectsScreen());
  shell.register(new SettingsScreen());
  shell.show('map');
  await mapScreen.mount();
}

void start();
