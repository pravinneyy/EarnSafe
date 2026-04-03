import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const WeatherMap = ({ latitude = 13.0527, longitude = 80.2016 }) => {
  const mapHtml = `
    <html>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>#map { height: 100vh; width: 100vw; margin: 0; }</style>
      </head>
      <body style="margin:0;">
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${latitude}, ${longitude}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          L.marker([${latitude}, ${longitude}]).addTo(map);
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView originWhitelist={['*']} source={{ html: mapHtml }} />
    </View>
  );
};

const styles = StyleSheet.create({ container: { flex: 1, height: 300 } });
export default WeatherMap;