import { createBottomTabNavigator, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';

import { useAuth } from '../features/auth/AuthContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ProfileScreen } from '../features/auth/ProfileScreen';
import { RegisterScreen } from '../features/auth/RegisterScreen';
import { AnalyticsScreen } from '../features/analytics/AnalyticsScreen';
import { ProgramsScreen } from '../features/programs/ProgramsScreen';
import { WorkoutTab } from '../features/workout/WorkoutTab';
import { useTheme } from '../shared/ui/ThemeProvider';

export type MainTabsParamList = {
  Workout: { workoutId?: string } | undefined;
  Programs: undefined;
  Analytics: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

type TabScreenProps<Name extends keyof MainTabsParamList> = BottomTabScreenProps<
  MainTabsParamList,
  Name
>;

// Auth "stack": the Login/Register screens already navigate via callbacks, so
// a local state switch keeps the auth gate free of a native-stack dependency.
function AuthScreens() {
  const [screen, setScreen] = useState<'login' | 'register'>('login');
  if (screen === 'login') {
    return <LoginScreen onNavigateToRegister={() => setScreen('register')} />;
  }
  return <RegisterScreen onNavigateToLogin={() => setScreen('login')} />;
}

function WorkoutTabScreen({ navigation, route }: TabScreenProps<'Workout'>) {
  return (
    <WorkoutTab
      activeWorkoutId={route.params?.workoutId}
      onClearActiveWorkout={() => navigation.setParams({ workoutId: undefined })}
    />
  );
}

function ProgramsTabScreen({ navigation }: TabScreenProps<'Programs'>) {
  return (
    <ProgramsScreen
      onWorkoutStarted={(workoutId) => navigation.navigate('Workout', { workoutId })}
    />
  );
}

function MainTabs() {
  const theme = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.mauve,
        tabBarInactiveTintColor: theme.overlay0,
        tabBarStyle: {
          backgroundColor: theme.mantle,
          borderTopColor: theme.surface1,
        },
      }}
    >
      <Tab.Screen name="Workout" component={WorkoutTabScreen} />
      <Tab.Screen name="Programs" component={ProgramsTabScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();

  // Wait for the stored session to hydrate before deciding which screens to
  // show (data screens must not mount before the auth providers are ready).
  if (loading) {
    return null;
  }

  if (!user) {
    return <AuthScreens />;
  }

  return <MainTabs />;
}
