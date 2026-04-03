import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { getLeafletTileConfig } from '../utils/mapTiles';

const WeatherMap = ({ latitude = 13.0527, longitude = 80.2016 }) => {
  const { tileUrl, attribution, errorMessage, maxZoom, subdomains } = getLeafletTileConfig();
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
          ${tileUrl
            ? `
          var map = L.map('map').setView([${latitude}, ${longitude}], 13);
          L.tileLayer(${JSON.stringify(tileUrl)}, {
            attribution: ${JSON.stringify(attribution)},
            maxZoom: ${maxZoom},
            subdomains: ${JSON.stringify(subdomains)}
          }).addTo(map);
          L.marker([${latitude}, ${longitude}]).addTo(map);
          `
            : `
          document.getElementById('map').innerHTML =
            '<div style="display:flex;height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:sans-serif;color:#0F172A;background:#F5F5F5;">${errorMessage}</div>';
          `}
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
