import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.vnf.uticmreen.sigpoche',
  appName: 'SIG Poche UTI CMRE-EN',
  webDir: 'www',
  // Application 100% embarquée / hors-ligne : aucun serveur distant, pas de bundledWebRuntime.
  server: {
    androidScheme: 'https',
    // Autorise le fond de plan OSM en ligne uniquement quand disponible ; l'appli reste fonctionnelle hors-ligne
    // (couches vectorielles + fiches d'attributs) même sans connexion.
    allowNavigation: ['*.tile.openstreetmap.org']
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    Geolocation: {
      // Aucune configuration additionnelle requise : les permissions sont déclarées
      // dans AndroidManifest.xml (voir GUIDE_COMPILATION_ANDROID.md)
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0b2e45',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  }
};

export default config;
