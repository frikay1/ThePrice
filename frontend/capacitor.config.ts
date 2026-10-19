import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.theprice.app',
  appName: 'The Price',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
