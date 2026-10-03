import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'hu.teleklato.app',
  appName: 'Teleklátó',
  webDir: 'dist',
  android: {
    // A térkép-canvas PDF-be mentéséhez és a WebView hibakereséséhez
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // A CapacitorHttp-t célzottan hívjuk (src/native/http.ts), nem patcheljük a globális fetch-et,
    // mert a MapLibre csempéi így a WebView-ban gyorsítótárazódnak.
    CapacitorHttp: { enabled: false },
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#e7ece3',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
