import { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../../shared/ui/ThemeProvider';

// Lightweight charts built from plain Views (no SVG / chart library):
// - LineChart draws segments as thin rotated views between point dots.
// - BarChart draws one proportionally-sized bar per value.
// All colors come from the theme tokens.

export interface ChartPoint {
  value: number;
  label?: string;
}

export interface LineChartProps {
  points: ChartPoint[];
  height?: number;
  testID?: string;
}

const GRID_LINES = 3;

function withKey(point: ChartPoint, index: number) {
  return { point, key: `${point.label ?? ''}:${point.value}:${index}` };
}

export function LineChart({ points, height = 140, testID }: LineChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const padY = 10;
  const chartHeight = height - padY * 2;

  const values = points.map((point) => point.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min || 1;

  const toX = (index: number) => {
    if (points.length <= 1 || width === 0) {
      return 0;
    }
    return (index / (points.length - 1)) * width;
  };
  const toY = (value: number) => padY + chartHeight - ((value - min) / range) * chartHeight;

  const enriched = points.map(withKey);
  const segments: { style: ViewStyle; key: string }[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const x1 = toX(index - 1);
    const y1 = toY(points[index - 1].value);
    const x2 = toX(index);
    const y2 = toY(points[index].value);
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    segments.push({
      key: `${enriched[index - 1].key}->${enriched[index].key}`,
      style: {
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - 1,
        width: length,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.blue,
        transform: [{ rotate: `${angle}rad` }],
      },
    });
  }

  return (
    <View testID={testID} style={styles.root} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ height }}>
        {width === 0
          ? null
          : Array.from({ length: GRID_LINES }, (_, index) => padY + (index / (GRID_LINES - 1)) * chartHeight).map(
              (y) => (
                <View
                  key={`grid-${y}`}
                  style={[styles.gridLine, { top: y, backgroundColor: theme.surface0 }]}
                />
              ),
            )}

        {segments.map((segment) => (
          <View key={segment.key} style={segment.style} />
        ))}

        {enriched.map(({ point, key }, index) => (
          <View
            key={key}
            testID={`${testID}.point.${index}`}
            style={[
              styles.dot,
              {
                left: toX(index) - 4,
                top: toY(point.value) - 4,
                backgroundColor: theme.blue,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.axisRow}>
        <Text style={[styles.axisLabel, { color: theme.subtext0 }]}>
          {points.length > 0 ? String(Math.round(points[0].value)) : ''}
        </Text>
        <Text style={[styles.axisLabel, { color: theme.subtext0 }]}>
          {max > 0 ? String(Math.round(max)) : ''}
        </Text>
      </View>
    </View>
  );
}

export interface BarChartProps {
  bars: ChartPoint[];
  height?: number;
  testID?: string;
}

export function BarChart({ bars, height = 120, testID }: BarChartProps) {
  const theme = useTheme();
  const max = bars.length > 0 ? Math.max(...bars.map((bar) => bar.value)) : 0;

  if (bars.length === 0) {
    return (
      <Text testID={`${testID}.empty`} style={[styles.empty, { color: theme.subtext0 }]}>
        No data yet
      </Text>
    );
  }

  const enriched = bars.map(withKey);

  return (
    <View testID={testID} style={styles.barChart}>
      {enriched.map(({ point, key }, index) => {
        const barHeight = max > 0 ? Math.max(4, (point.value / max) * height) : 4;
        return (
          <View key={key} style={styles.barColumn}>
            <Text style={[styles.barValue, { color: theme.subtext0 }]}>
              {point.value > 0 ? String(Math.round(point.value)) : ''}
            </Text>
            <View
              testID={`${testID}.bar.${index}`}
              style={[styles.bar, { height: barHeight, backgroundColor: theme.blue }]}
            />
            <Text numberOfLines={1} style={[styles.barLabel, { color: theme.subtext0 }]}>
              {point.label ?? ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 8,
  },
  gridLine: {
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    position: 'absolute',
    width: 8,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    fontSize: 11,
  },
  barChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barValue: {
    fontSize: 10,
    marginBottom: 2,
  },
  bar: {
    borderRadius: 4,
    width: '70%',
  },
  barLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  empty: {
    fontSize: 14,
    marginTop: 8,
  },
});
