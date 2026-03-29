import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function LiveMap({ location, firstName, zone }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Map preview</Text>
      <Text style={styles.body}>
        Live maps are available in the native Android and iOS builds. The web view keeps the
        location-aware weather and payment flow available.
      </Text>
      <Text style={styles.meta}>Zone: {zone || 'Unknown'}</Text>
      {location && (
        <Text style={styles.meta}>
          {firstName}: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: 24,
    backgroundColor: '#DCE7F3',
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 360,
    marginBottom: 12,
  },
  meta: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
});
