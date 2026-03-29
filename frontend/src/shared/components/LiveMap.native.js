import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

export default function LiveMap({
  mapRef,
  region,
  isDark,
  location,
  firstName,
  darkMapStyle,
  lightMapStyle,
}) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      initialRegion={region}
      customMapStyle={isDark ? darkMapStyle : lightMapStyle}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {location && (
        <Marker coordinate={location} title={firstName} description="Your current location" />
      )}
    </MapView>
  );
}
