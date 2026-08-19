import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/features/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SyncProvider } from './src/shared/sync/SyncContext';
import { ThemeProvider } from './src/shared/ui/ThemeProvider';

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SafeAreaProvider>
      <ThemeProvider flavor="mocha">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider>
              <NavigationContainer>
                <StatusBar style="light" />
                <RootNavigator />
              </NavigationContainer>
            </SyncProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
